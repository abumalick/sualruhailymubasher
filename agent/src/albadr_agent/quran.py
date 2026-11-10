"""Ayah text for the Tafsir start points, from the Tanzil Project's Quran text (tanzil.net, CC BY 3.0).

data/quran-simple.txt and data/quran-data.xml are verbatim Tanzil files; their terms forbid editing them.
"""
import re
import xml.etree.ElementTree as ET
from functools import cache
from pathlib import Path

DATA = Path(__file__).parent / "data"
OPENING_MAX = 50
ARABIC_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
WESTERN_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

_MARKS = re.compile(r"[ـً-ٰٟ]")
_HAMZA = re.compile(r"[أإآٱئؤء]")
_NON_LETTER = re.compile(r"[^ء-ي]")
_LABEL = re.compile(r"^\s*تفسير\s+سورة\s+([^:]+?)\s*:\s*من\s+الآية\s*\(\s*([0-9٠-٩]+)\s*\)")


def normalize(text: str) -> str:
    """Letters only, so spellings of the same words compare equal (يَاأَيُّهَا / يَا أَيُّهَا, يسئلونك / يسألونك)."""
    text = _HAMZA.sub("ا", _MARKS.sub("", text)).translate(str.maketrans("ىة", "يه"))
    return _NON_LETTER.sub("", text)


@cache
def _surahs() -> list[str]:
    root = ET.parse(DATA / "quran-data.xml").getroot()
    return [s.get("name") for s in sorted(root.iter("sura"), key=lambda s: int(s.get("index")))]


@cache
def _ayahs() -> dict[tuple[int, int], str]:
    ayahs: dict[tuple[int, int], str] = {}
    for line in (DATA / "quran-simple.txt").read_text(encoding="utf-8").splitlines():
        parts = line.split("|")
        if len(parts) == 3 and parts[0].isdigit():
            surah, number, text = int(parts[0]), int(parts[1]), parts[2]
            if number == 1 and surah != 1:
                text = text.removeprefix(ayahs[1, 1] + " ")
            ayahs[surah, number] = text
    return ayahs


def surah_number(name: str) -> int | None:
    wanted = normalize(name.removeprefix("سورة").strip())
    return next((i for i, s in enumerate(_surahs(), start=1) if normalize(s) == wanted), None)


def ayah(surah: int, number: int) -> str | None:
    return _ayahs().get((surah, number))


def parse_label(point: str) -> tuple[int, int] | None:
    """(surah, ayah) of a start point written the way the channel announces Tafsir lessons."""
    m = _LABEL.match(point)
    if not m:
        return None
    surah = surah_number(m.group(1))
    return (surah, int(m.group(2).translate(WESTERN_DIGITS))) if surah else None


def opening(text: str, limit: int = OPENING_MAX) -> str:
    """Whole words up to `limit` letters (diacritics not counted), closed with ﴾ and marked «...» when cut."""
    words = text.split()
    kept = words[:1]
    for word in words[1:]:
        if len(_MARKS.sub("", " ".join(kept + [word]))) > limit:
            return f"﴿{' '.join(kept)}...﴾"
        kept.append(word)
    return f"﴿{' '.join(kept)}﴾"


def label(surah: int, number: int) -> str:
    return f"تفسير سورة {_surahs()[surah - 1]}: من الآية ({str(number).translate(ARABIC_DIGITS)}) {opening(ayah(surah, number))}"


def matches(words: str, surah: int, number: int) -> bool:
    """Whether words someone wrote are the opening of that ayah."""
    text = ayah(surah, number)
    wanted, actual = normalize(words), normalize(text or "")
    size = min(len(wanted), len(actual), 12)
    return size >= 3 and wanted[:size] == actual[:size]
