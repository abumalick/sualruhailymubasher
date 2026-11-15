import json
import logging
import re
import shutil
from dataclasses import dataclass, field, replace
from pathlib import Path

import httpx

from .api import ApiError, IndexedLesson, IngestIndex
from .captions import SLOTS, Absence, Lecture, SiteLesson, Skip, TelegramLesson, parse_message
from .site import SitePageError, parse_play_page
from .telegram import TelegramBusy

log = logging.getLogger("sualruhaily_agent")

FIRST_ID = 859
RESCAN = 150
CONTENT_TYPES = {"mp3": "audio/mpeg", "m4a": "audio/mp4"}
SLOT_NAMES = {slot: arabic for arabic, slot in SLOTS.items()}
FAILURE_PREFIXES = ("identity-conflict:", "site-error", "failed:")
MEDIA_MAX_BYTES = 95_000_000
PERMANENT_STATUSES = {400, 409, 413, 415}
MAX_RETRIES = 5
LISTED_REFS = 3


class PermanentFailure(Exception):
    """A post that fails the same way on every try: recorded so later ticks skip it until --retry-failed."""


@dataclass(frozen=True)
class SiteResolved(TelegramLesson):
    mp3_url: str = ""


@dataclass(frozen=True)
class Upload:
    lesson: TelegramLesson


@dataclass(frozen=True)
class Moved:
    lesson: TelegramLesson
    recording_url: str


@dataclass(frozen=True)
class Cancel:
    item: Absence | Lecture


Parsed = TelegramLesson | SiteLesson | Absence | Lecture | Skip
Action = Upload | Moved | Cancel | Skip
Identity = tuple[str, str, int]


def _ref(action: Action) -> str:
    if isinstance(action, Skip):
        return action.ref
    return (action.item if isinstance(action, Cancel) else action.lesson).ref


def _msg_id(p: Parsed) -> int:
    return int(p.ref.removeprefix("tg:"))


def _identity(lesson: TelegramLesson, number: int | None = None) -> Identity:
    return lesson.course_id, lesson.section, lesson.section_number if number is None else number


def _row_identity(row: IndexedLesson) -> Identity:
    return row.course_id, row.section, row.section_number


def _hijri_key(date: str | None) -> tuple[int, int, int] | None:
    """`1448/6/3` (agent) and `03-06-1448` (as the server stores it) compare equal."""
    parts = re.split(r"\s*[/-]\s*", date.strip()) if date else []
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        return None
    a, m, c = parts
    y, d = (a, c) if len(a) == 4 else (c, a)
    return int(y), int(m), int(d)


def _claim(lesson: TelegramLesson, owners: dict[Identity, str], dates: dict[str, str]) -> TelegramLesson | Skip:
    """The identity this post may take. A post colliding with another ref's identity is a repost when the dates
    match (or the other post's date is unknown); otherwise a caption typo, fixed by the filename's number."""
    owner = owners.get(_identity(lesson))
    if owner in (None, lesson.ref):
        return lesson
    owner_date = _hijri_key(dates.get(owner))
    if owner_date == _hijri_key(lesson.hijri_date):
        return Skip(lesson.ref, f"duplicate-of:{owner}")
    n = lesson.file_number
    if n is not None and n != lesson.section_number and owners.get(_identity(lesson, n)) in (None, lesson.ref):
        return replace(lesson, section_number=n)
    return Skip(lesson.ref, f"duplicate-of:{owner}" if owner_date is None else f"identity-conflict:{owner}")


def _plan_lesson(lesson: TelegramLesson, known: dict[str, IndexedLesson], owners: dict[Identity, str], dates: dict[str, str]) -> Action:
    claimed = _claim(lesson, owners, dates)
    if isinstance(claimed, Skip):
        return claimed
    row = known.get(claimed.ref)
    if row is None or row.recording_url is None:
        action: Action = Upload(claimed)
    elif _row_identity(row) == _identity(claimed):
        action = Skip(claimed.ref, "done")
    else:
        action = Moved(claimed, row.recording_url)
    if row is not None and owners.get(_row_identity(row)) == claimed.ref:
        del owners[_row_identity(row)]
    owners[_identity(claimed)] = claimed.ref
    return action


def plan(
    parsed: list[Parsed], index: IngestIndex, failed: dict[str, str] | None = None, cancelled: set[str] | None = None,
) -> list[Action]:
    """Ingested refs keep their identity; within the batch the lowest message id of an identity wins.
    Refs in `failed` failed permanently on an earlier tick and are skipped unless already done. Refs in
    `cancelled` were cancelled before: done even when the owner has since deleted the exception."""
    failed = failed or {}
    known = {row.source_ref: row for row in index.lessons}
    owners = {_row_identity(row): row.source_ref for row in index.lessons}
    dates = {row.source_ref: row.hijri_date for row in index.lessons if row.hijri_date}
    dates |= {p.ref: p.hijri_date for p in parsed if isinstance(p, TelegramLesson)}
    exceptions = set(index.exception_refs) | (cancelled or set())
    actions: list[Action] = []
    for p in sorted(parsed, key=_msg_id):
        row = known.get(p.ref)
        if isinstance(p, (Absence, Lecture)):
            if p.ref in exceptions:
                actions.append(Skip(p.ref, "done"))
            elif p.ref in failed:
                actions.append(Skip(p.ref, f"failed:{failed[p.ref]}"))
            else:
                actions.append(Cancel(p))
        elif isinstance(p, TelegramLesson) and p.ref in failed and not (row and row.recording_url):
            actions.append(Skip(p.ref, f"failed:{failed[p.ref]}"))
        elif isinstance(p, TelegramLesson):
            actions.append(_plan_lesson(p, known, owners, dates))
        elif isinstance(p, SiteLesson):
            actions.append(Skip(p.ref, "done" if row and row.recording_url else "site-error"))
        else:
            actions.append(p)
    return actions


def describe(action: Action) -> str:
    if isinstance(action, Skip):
        return f"skip {action.ref}: {action.reason}"
    if isinstance(action, Cancel):
        item = action.item
        when = item.date if isinstance(item, Absence) else item.hijri_date
        return f"cancel {item.ref}: {item.slot} {when} ({_note(item)})"
    lesson = action.lesson
    verb = "move" if isinstance(action, Moved) else "upload"
    section = f" {lesson.section}" if lesson.section else ""
    return f"{verb} {lesson.ref}: {lesson.course_id}{section} {lesson.section_number} {lesson.hijri_date} — {lesson.start_point}"


@dataclass
class Summary:
    lessons: int = 0
    cancellations: int = 0
    skipped: int = 0
    failed: int = 0
    unrecognised: int = 0
    without_course: int = 0
    failed_refs: list[str] = field(default_factory=list)
    unrecognised_refs: list[str] = field(default_factory=list)
    actions: list[Action] = field(default_factory=list)

    def fail(self, ref: str) -> None:
        self.failed += 1
        self.failed_refs.append(ref)

    @property
    def ok(self) -> bool:
        return self.failed == 0 and self.unrecognised == 0

    def __str__(self) -> str:
        def count(n: int, word: str) -> str:
            return f"{n} {word}{'' if n == 1 else 's'}"

        def refs(listed: list[str]) -> str:
            more = ", …" if len(listed) > LISTED_REFS else ""
            return ", ".join(listed[:LISTED_REFS]) + more

        text = f"{count(self.lessons, 'lesson')}, {count(self.cancellations, 'cancellation')}, {self.skipped} skipped, {self.failed} failed"
        if self.failed_refs:
            text += f" ({refs(self.failed_refs)})"
        if self.unrecognised_refs:
            text += f", unrecognised {refs(self.unrecognised_refs)}"
        if self.without_course:
            text += f", {count(self.without_course, 'cancellation')} without a course"
        return text


def _note(item: Absence | Lecture) -> str:
    if isinstance(item, Absence):
        return f"اعتذار الشيخ عن درس {SLOT_NAMES[item.slot]}"
    return f"محاضرة: {item.title}"


def _cancellation_body(item: Absence | Lecture) -> dict:
    when = {"date": item.date} if isinstance(item, Absence) else {"hijriDate": item.hijri_date}
    return {"sourceRef": item.ref, "slot": item.slot, **when, "note": _note(item)}


def _lesson_body(lesson: TelegramLesson, recording_url: str, notify: bool) -> dict:
    return {
        "courseId": lesson.course_id,
        "section": lesson.section,
        "sectionNumber": lesson.section_number,
        "hijriDate": lesson.hijri_date,
        "startPoint": lesson.start_point,
        "recordingUrl": recording_url,
        "sourceRef": lesson.ref,
        "notify": notify,
    }


def _resolve(p: Parsed, site, done: set[str], failed: dict[str, str]) -> Parsed:
    if not isinstance(p, SiteLesson) or p.ref in done:
        return p
    if p.ref in failed:
        return Skip(p.ref, f"failed:{failed[p.ref]}")
    try:
        page = parse_play_page(site.fetch(p.play_url))
    except httpx.HTTPError as e:
        log.error("%s: could not read %s: %s", p.ref, p.play_url, e)
        return Skip(p.ref, "site-error")
    except SitePageError as e:
        log.error("%s: unusable play page %s: %s", p.ref, p.play_url, e)
        failed[p.ref] = "site-page"
        return Skip(p.ref, "failed:site-page")
    return SiteResolved(
        p.ref, p.course_id, "", page.number, p.hijri_date, page.start_point, _msg_id(p), "mp3", None, page.mp3_url,
    )


def _upload(api, telegram, site, lesson: TelegramLesson, work: Path, notify: bool) -> None:
    folder = work / str(lesson.msg_id)
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)
    try:
        if isinstance(lesson, SiteResolved):
            path = site.download(lesson.mp3_url, folder / f"{lesson.msg_id}.mp3")
        else:
            path = telegram.download(lesson.msg_id, folder)
        if lesson.ext not in CONTENT_TYPES:
            raise PermanentFailure("unsupported-extension")
        if path.stat().st_size > MEDIA_MAX_BYTES:
            raise PermanentFailure("too-large")
        key = f"lessons/{lesson.course_id}/{lesson.msg_id}.{lesson.ext}"
        url = api.put_media(key, path, CONTENT_TYPES[lesson.ext])
        api.post_lesson(_lesson_body(lesson, url, notify))
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def _execute(api, telegram, site, action: Action, work: Path, notify: bool) -> bool:
    """Returns False for a cancellation that matched no course on that day."""
    try:
        if isinstance(action, Upload):
            _upload(api, telegram, site, action.lesson, work, notify)
        elif isinstance(action, Moved):
            api.post_lesson(_lesson_body(action.lesson, action.recording_url, notify))
        elif isinstance(action, Cancel):
            if not api.slot_cancellation(_cancellation_body(action.item)).get("courseIds"):
                log.warning("%s: the cancellation matched no course on that day", action.item.ref)
                return False
    except ApiError as e:
        if e.status in PERMANENT_STATUSES:
            raise PermanentFailure(f"http-{e.status}") from e
        raise
    return True


def _count(summary: Summary, action: Action) -> None:
    if isinstance(action, (Upload, Moved)):
        summary.lessons += 1
    elif isinstance(action, Cancel):
        summary.cancellations += 1
    elif action.reason.startswith(FAILURE_PREFIXES):
        summary.fail(action.ref)
    elif action.reason != "done":
        summary.skipped += 1
        if action.reason == "unrecognised":
            summary.unrecognised += 1
            summary.unrecognised_refs.append(action.ref)


def _load_state(state_path: Path) -> dict | None:
    try:
        state = json.loads(state_path.read_text())
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        state = None
    if not isinstance(state, dict):
        log.warning("unreadable %s, starting from a fresh state", state_path)
        return None
    return state


def _save_state(state_path: Path, state: dict) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_path.with_suffix(".part")
    tmp.write_text(json.dumps(state, ensure_ascii=False))
    tmp.replace(state_path)


def _reason(e: Exception) -> str:
    return f"http-{e.status}" if isinstance(e, ApiError) and e.status else type(e).__name__


def run_ingest(
    api, telegram, site, state_path: Path, *,
    from_id: int | None = None, notify: bool = True, dry_run: bool = False, retry_failed: bool = False,
) -> Summary:
    """One pass over the channel: auth failures and a busy Telegram stop it, any other failure only fails that post."""
    state = _load_state(state_path)
    if state is None and notify and not dry_run:
        log.info("first run (no %s): a backfill, so nothing is pushed", state_path)
        notify = False
    state = state or {}
    last_id = state.get("last_id")
    failed: dict[str, str] = {} if retry_failed else dict(state.get("failed", {}))
    retries: dict[str, int] = {} if retry_failed else dict(state.get("retries", {}))
    cancelled: set[str] = set(state.get("cancelled", []))
    if from_id is not None:
        start = from_id
    elif isinstance(last_id, int):
        start = max(FIRST_ID, last_id - RESCAN)
    else:
        start = FIRST_ID
    messages = sorted(telegram.export(start), key=lambda m: m.id)
    log.info("ingest: %d message(s) from %d", len(messages), start)
    index = api.ingest_index()
    done = {row.source_ref for row in index.lessons if row.recording_url}
    actions = plan([_resolve(parse_message(m), site, done, failed) for m in messages], index, failed, cancelled)
    summary = Summary(actions=actions)
    work = state_path.parent / "media"
    for action in actions:
        is_done = isinstance(action, Skip) and action.reason == "done"
        log.log(logging.DEBUG if is_done else logging.INFO, "%s", describe(action))
        if dry_run:
            _count(summary, action)
            continue
        ref = _ref(action)
        try:
            matched = _execute(api, telegram, site, action, work, notify)
        except TelegramBusy:
            raise
        except PermanentFailure as e:
            log.error("%s: failed permanently (%s), skipped until --retry-failed", ref, e)
            failed[ref] = str(e)
            retries.pop(ref, None)
            summary.fail(ref)
            continue
        except Exception as e:
            if isinstance(e, ApiError) and e.status in (401, 403):
                raise
            retries[ref] = retries.get(ref, 0) + 1
            if retries[ref] >= MAX_RETRIES:
                failed[ref] = f"retries:{_reason(e)}"
                del retries[ref]
                log.exception("%s: failed %d times in a row, skipped until --retry-failed", ref, MAX_RETRIES)
            else:
                log.exception("%s: failed (%d/%d), retrying next tick", ref, retries[ref], MAX_RETRIES)
            summary.fail(ref)
            continue
        retries.pop(ref, None)
        if isinstance(action, Cancel) and matched:
            cancelled.add(ref)
        _count(summary, action)
        summary.without_course += not matched
    if dry_run:
        return summary
    seen = [m.id for m in messages] + ([last_id] if isinstance(last_id, int) else [])
    _save_state(state_path, {
        **({"last_id": max(seen)} if seen else {}),
        "failed": failed,
        "retries": retries,
        "cancelled": sorted(cancelled, key=lambda r: int(r.removeprefix("tg:"))),
    })
    api.heartbeat(summary.ok, str(summary))
    return summary
