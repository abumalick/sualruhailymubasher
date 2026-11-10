import json
import logging
import re
import subprocess

from pydantic import BaseModel, ValidationError

from .api import Pending
from .quran import parse_label
from .transcribe import Segment

log = logging.getLogger("albadr_agent")
MIN_CONFIDENCE = 0.6
MAX_END_POINT = 80
WINDOW_BEFORE, WINDOW_SIZE = 1, 12
MIN_MATCH = 0.3
NEXT_MATCH = 0.8
ATTEMPTS = 2
CLAUDE_TIMEOUT = 300
CLAUDE_CMD = [
    "claude", "-p", "--model", "sonnet", "--output-format", "json",
    "--tools", "", "--no-session-persistence",
]
END_PREFIX = "من قوله:"
_PAIRS = [("﴿", "﴾"), ("«", "»"), ("{", "}"), ("(", ")"), ("<", ">")]

PROMPT = """أنت تساعد في تحديد موضع قراءة الشيخ من الكتاب في درس مسجل.

الكتاب: {title}
نقطة بداية الدرس المعلنة: {start_point}
{next_hint}
نص الدرس المفرّغ (بعلامات الوقت [دقيقة:ثانية]) قد يحتوي على أخطاء في التفريغ:
{transcript}

الصفحات المرشحة من الكتاب (نصها مستخرج بالتعرّف الضوئي وفيه أخطاء وتشكيل غير دقيق، فطابق الكلام تقريبياً لا حرفياً):
{pages}

تجاهل رؤوس الصفحات المتكررة وأرقام الصفحات والحواشي عند اختيار آخر جملة قرأها الشيخ والجملة التالية.

المطلوب:
1. حدد الصفحة التي يبدأ فيها الجزء المقروء من الكتاب في هذا الدرس.
2. حدد آخر جملة من الكتاب قرأها الشيخ في هذا الدرس، والصفحة التي توجد فيها.
3. اكتب أول كلمات الجملة التالية التي لم تُقرأ بعد، بصيغة: {end_prefix} <أول الكلمات>… في حدود {max_end} حرفاً، منقولة من نص الكتاب.
{next_ayah_step}4. إن كان الدرس محاضرة مستقلة لا قراءة فيها من الكتاب، أو لم تستطع التحديد بثقة، فأعطِ confidence أقل من 0.5.

أجب بكائن JSON فقط، بلا شرح ولا علامات تنسيق، بهذه الحقول بالضبط:
{{"start_page": عدد صحيح, "end_page": عدد صحيح, "pdf_index": رقم الملف الذي فيه صفحة البداية, "end_pdf_index": رقم الملف الذي فيه صفحة النهاية, "end_point": نص, "confidence": عدد بين 0 و1{next_ayah_fields}}}
أرقام الصفحات والملفات هي الواردة في رؤوس الصفحات المرشحة."""


NEXT_AYAH_STEP = """3ب. هذا درس تفسير، وكل درس يبدأ بآية ثم شرحها. حدد أول آية لم يشرحها الشيخ بعد، وهي التي يبدأ بها الدرس التالي: اسم السورة، ورقم الآية في السورة، وأول كلماتها من المصحف (لا من نص الكتاب المستخرج).
"""
NEXT_AYAH_FIELDS = ', "next_surah": اسم السورة, "next_ayah": رقم الآية, "next_ayah_words": أول كلمات الآية'


class ClaudeUnavailable(Exception):
    pass


class LocateResult(BaseModel):
    start_page: int
    end_page: int
    pdf_index: int
    end_pdf_index: int
    end_point: str
    confidence: float
    next_surah: str | None = None
    next_ayah: int | None = None
    next_ayah_words: str | None = None


Page = tuple[int, int, str]


def _stamp(seconds: float) -> str:
    return f"[{int(seconds) // 60:02d}:{int(seconds) % 60:02d}]"


def clip(text: str, limit: int = MAX_END_POINT) -> str:
    """Cut on a word boundary, mark the cut with «…», and close any bracket the cut left open."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 2]
    if " " in cut:
        cut = cut[: cut.rindex(" ")]
    cut = cut.rstrip(" ،,.:؛…") + "…"
    closing = "".join(close for open_, close in _PAIRS if cut.count(open_) > cut.count(close))
    return cut + closing


def build_prompt(pending: Pending, segments: list[Segment], pages: list[Page]) -> str:
    tafsir = parse_label(pending.start_point) is not None
    return PROMPT.format(
        title=pending.course_id,
        start_point=pending.start_point,
        next_hint=f"الدرس التالي يبدأ بـ: {pending.next_start_point}\n" if pending.next_start_point else "",
        transcript="\n".join(f"{_stamp(s.start)} {s.text}" for s in segments),
        pages="\n\n".join(f"=== ملف {pdf} صفحة {n} ===\n{text}" for pdf, n, text in pages),
        end_prefix=END_PREFIX,
        max_end=MAX_END_POINT,
        next_ayah_step=NEXT_AYAH_STEP if tafsir else "",
        next_ayah_fields=NEXT_AYAH_FIELDS if tafsir else "",
    )


def _parse(stdout: str) -> LocateResult | None:
    try:
        reply = json.loads(stdout)
        if isinstance(reply, list):
            reply = next(e for e in reply if e.get("type") == "result")
        text = reply["result"]
        start, end = text.index("{"), text.rindex("}")
        return LocateResult.model_validate_json(text[start : end + 1])
    except (ValueError, KeyError, StopIteration, AttributeError, TypeError, ValidationError):
        return None


def locate(prompt: str, run=subprocess.run) -> LocateResult | None:
    replied = False
    for attempt in range(1, ATTEMPTS + 1):
        try:
            done = run(CLAUDE_CMD, input=prompt, capture_output=True, text=True, timeout=CLAUDE_TIMEOUT)
        except OSError as e:
            raise ClaudeUnavailable(str(e)) from e
        except subprocess.TimeoutExpired as e:
            log.warning("claude attempt %d failed: %s", attempt, e)
            continue
        if done.returncode != 0:
            log.warning("claude attempt %d exited %d: %s", attempt, done.returncode, done.stderr[:200])
            continue
        replied = True
        parsed = _parse(done.stdout)
        if parsed:
            if not parsed.end_point.startswith(END_PREFIX):
                parsed.end_point = f"{END_PREFIX} {parsed.end_point}"
            parsed.end_point = clip(parsed.end_point)
            return parsed
        log.warning("claude attempt %d returned an unusable reply", attempt)
    if not replied:
        raise ClaudeUnavailable(f"no reply in {ATTEMPTS} attempts (timeout or error exit)")
    return None


def accept(r: LocateResult, pages: list[Page]) -> bool:
    known = {(pdf, n) for pdf, n, _ in pages}
    start, end = (r.pdf_index, r.start_page), (r.end_pdf_index, r.end_page)
    return (
        r.confidence >= MIN_CONFIDENCE
        and start in known
        and end in known
        and start <= end
        and r.end_point.startswith(END_PREFIX)
    )


_MARKS = re.compile(r"[ـً-ٰٟ]")
_FOLD = str.maketrans("أإآٱىة", "اااايه")


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[ء-ي]+", _MARKS.sub("", text).translate(_FOLD)))


_TAFSIR_LABEL = re.compile(r"^\s*تفسير\s+سورة\s+[^:]+:\s*من\s+الآية\s*\([^)]*\)")


def match_score(point: str, text: str) -> float:
    point = _TAFSIR_LABEL.sub("", point)
    wanted = _tokens(point.replace(END_PREFIX, "")) - _tokens("من قوله")
    return len(wanted & _tokens(text)) / len(wanted) if wanted else 0.0


def find_page(
    point: str, pages: list[Page], start: int = 0, span: int | None = None, floor: float = MIN_MATCH
) -> int | None:
    stop = start + span if span is not None else len(pages)
    scores = [match_score(point, text) for _, _, text in pages[start:stop]]
    best = max(range(len(scores)), key=scores.__getitem__, default=None)
    return start + best if best is not None and scores[best] >= floor else None


def page_position(pages: list[Page], key: tuple[int, int]) -> int | None:
    return next((i for i, (pdf, n, _) in enumerate(pages) if (pdf, n) == key), None)


_SURAH = re.compile(r"سورة\s+([ء-ي]+)")


def _find_in_surah(point: str, pages: list[Page]) -> int | None:
    """A tafsir verse is quoted again in other surahs' commentary; when the start point names its surah,
    search only the pages whose running header carries that surah's name."""
    surah = _SURAH.search(_MARKS.sub("", point))
    if surah is None:
        return find_page(point, pages)
    name = _tokens(surah.group(1))
    inside = [i for i, (_, _, text) in enumerate(pages) if name <= _tokens(text)]
    found = find_page(point, [pages[i] for i in inside])
    return inside[found] if found is not None else None


def candidate_pages(
    pending: Pending, pages: list[Page], previous_end: tuple[int, int] | None, size: int = WINDOW_SIZE
) -> list[Page]:
    if previous_end is not None:
        position = page_position(pages, previous_end)
    else:
        position = _find_in_surah(pending.start_point, pages)
    if position is None:
        return []
    first = max(0, position - WINDOW_BEFORE)
    return pages[first : first + size]
