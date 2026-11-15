import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath

MEDINA = timezone(timedelta(hours=3))
AUDIO_EXTENSIONS = {".mp3", ".m4a"}

DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
TASHKEEL_AND_TATWEEL = re.compile("[ً-ٰٟـ]")

COURSES = (
    ("شرح صحيح الترغيب والترهيب", "targhib"),
    ("شرح دليل الطالب", "dalil-talib"),
    ("شرح كتاب التوحيد", "kitab-tawhid"),
)
SLOTS = {"العصر": "asr", "الفجر": "fajr", "المغرب": "maghrib"}
HIJRI_MONTHS = {
    "محرم": 1,
    "صفر": 2,
    "ربيع الأول": 3,
    "ربيع الآخر": 4,
    "ربيع الثاني": 4,
    "جمادى الأولى": 5,
    "جمادى الآخرة": 6,
    "جمادى الثانية": 6,
    "رجب": 7,
    "شعبان": 8,
    "رمضان": 9,
    "شوال": 10,
    "ذو القعدة": 11,
    "ذو الحجة": 12,
}

DAY_FIRST_DATE = re.compile(r"(?<!\d)(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})(?!\d)")
YEAR_FIRST_DATE = re.compile(r"(?<!\d)(\d{4})\s*/\s*(\d{1,2})\s*/\s*(\d{1,2})(?!\d)")
NAMED_MONTH_DATE = re.compile(
    r"(\d{1,2})\s+(" + "|".join(sorted(HIJRI_MONTHS, key=len, reverse=True)) + r")\s+(\d{4})"
)
SECTION_NUMBER = re.compile(r"(كتاب[^\[\]\n]*?)\s*\[\s*(\d+)\s*\]")
OLD_FORMAT_SECTION = re.compile(r"🔴\s*\[\s*(كتاب[^\]]*?)\s*\]")
OLD_FORMAT_START = re.compile(r"\(-\s*من\s+قوله:\s*(.*?)\s*\[\s*(\d+)\s*\]\s*\)", re.DOTALL)
LESSON_NUMBER = re.compile(r"\[\s*(\d+)\s*\]")
PLAY_URL = re.compile(r"https://sualruhaily\.com/play/\d+")


@dataclass(frozen=True)
class Message:
    id: int
    date: int
    file: str
    text: str


@dataclass(frozen=True)
class TelegramLesson:
    ref: str
    course_id: str
    section: str
    section_number: int
    hijri_date: str
    start_point: str
    msg_id: int
    ext: str


@dataclass(frozen=True)
class SiteLesson:
    ref: str
    course_id: str
    play_url: str
    hijri_date: str


@dataclass(frozen=True)
class Absence:
    ref: str
    slot: str
    date: str


@dataclass(frozen=True)
class Lecture:
    ref: str
    slot: str
    hijri_date: str
    title: str


@dataclass(frozen=True)
class Skip:
    ref: str
    reason: str


def _plain(text: str) -> str:
    return TASHKEEL_AND_TATWEEL.sub("", text.translate(DIGITS))


def _collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _section_name(raw: str) -> str:
    return _collapse(_plain(raw)).rstrip(". ")


def _hijri_date(text: str) -> str | None:
    if m := DAY_FIRST_DATE.search(text):
        day, month, year = m.groups()
    elif m := YEAR_FIRST_DATE.search(text):
        year, month, day = m.groups()
    else:
        return None
    return f"{year}/{int(month)}/{int(day)}"


def _slot(text: str, prefix: str = "") -> str | None:
    for arabic, slot in SLOTS.items():
        if prefix + arabic in text:
            return slot
    return None


def _start_point_from_filename(file: str) -> str:
    stem = PurePosixPath(file).stem
    stem = re.sub(r"^\d+[\s_-]*", "", stem)
    stem = re.sub(r"(?:[\s_-]+\d+)+$", "", stem)
    stem = _collapse(stem.replace("_", " "))
    return re.sub(r"^قوله(?!:)\s*", "قوله: ", stem)


def _start_point(old_format: re.Match | None, file: str) -> str:
    if old_format and old_format.group(1).strip():
        return f"قوله: {old_format.group(1).strip()}"
    return _start_point_from_filename(file)


def _absence(m: Message, text: str) -> Absence | Skip:
    slot = _slot(text, "درس ")
    if slot is None:
        return Skip(f"tg:{m.id}", "unrecognised")
    posted = datetime.fromtimestamp(m.date, MEDINA).date()
    if "غدا" in text:
        posted += timedelta(days=1)
    return Absence(f"tg:{m.id}", slot, posted.isoformat())


def _lecture(m: Message, text: str) -> Lecture | None:
    slot = _slot(text, "⏱ ")
    named = NAMED_MONTH_DATE.search(text)
    title = re.search(r"📘\s*(.+)", text)
    if not (slot and named and title):
        return None
    day, month, year = named.groups()
    return Lecture(f"tg:{m.id}", slot, f"{year}/{HIJRI_MONTHS[month]}/{int(day)}", _collapse(title.group(1)))


def _majlis(m: Message, text: str, raw: str) -> SiteLesson | Skip:
    ref = f"tg:{m.id}"
    if "شرح كتاب الكبائر" not in text:
        return Skip(ref, "majlis-other-course")
    url = PLAY_URL.search(raw)
    hijri = _hijri_date(text)
    if not (url and hijri):
        return Skip(ref, "unrecognised")
    return SiteLesson(ref, "kabair", url.group(0), hijri)


def _audio(m: Message, text: str, ext: str) -> TelegramLesson | Skip:
    ref = f"tg:{m.id}"
    if "شرح كتاب الكبائر" in text:
        return Skip(ref, "kabair-audio")
    if "محاضرة" in text:
        return Skip(ref, "lecture-audio")

    hijri = _hijri_date(text)
    old_start = OLD_FORMAT_START.search(m.text.translate(DIGITS))
    course = next((cid for title, cid in COURSES if title in text), None)
    if course is None and old_start:
        course = "dalil-talib"
    if course is None or hijri is None:
        return Skip(ref, "unrecognised")

    if course == "kitab-tawhid":
        section = ""
        number = LESSON_NUMBER.search(text)
    elif old_start:
        heading = OLD_FORMAT_SECTION.search(text)
        section = _section_name(heading.group(1)) if heading else None
        number = old_start
    else:
        found = SECTION_NUMBER.search(text)
        section = _section_name(found.group(1)) if found else None
        number = found and re.match(r"(\d+)", found.group(2))
    if section is None or number is None:
        return Skip(ref, "unrecognised")

    n = int(number.group(number.lastindex))
    return TelegramLesson(ref, course, section, n, hijri, _start_point(old_start, m.file), m.id, ext)


def parse_message(m: Message) -> TelegramLesson | SiteLesson | Absence | Lecture | Skip:
    ref = f"tg:{m.id}"
    text = _plain(m.text)
    ext = PurePosixPath(m.file).suffix.lower()
    is_audio = ext in AUDIO_EXTENSIONS

    if "#محاضرة" in text and (lecture := _lecture(m, text)):
        return lecture
    if "يعتذر" in text:
        return _absence(m, text)
    if "بدأ البث المباشر" in text:
        return Skip(ref, "live-start")
    if "#خطب_الرحيلي" in text or re.search(r"(?m)^[^\w\n]*خطبة\b", text):
        return Skip(ref, "khutba")
    if "⚡" in text and "المجلس" in text:
        return _majlis(m, text, m.text)
    if is_audio:
        return _audio(m, text, ext.lstrip("."))
    return Skip(ref, "no-lesson")
