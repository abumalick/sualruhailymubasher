import json
from pathlib import Path

import pytest

from albadr_agent.quran import ayah, label, matches, normalize, opening, parse_label, surah_number

ANNOUNCED = json.loads((Path(__file__).parent / "fixtures" / "tafsir_announcements.json").read_text())["lessons"]


def head(point: str) -> str:
    return point[: point.index("﴿")]


def words(point: str) -> str:
    return point[point.index("﴿") + 1 : point.index("﴾")].replace("...", "")


@pytest.mark.parametrize("row", ANNOUNCED, ids=lambda r: str(r["lesson"]))
def test_label_reads_like_the_channel_announcement(row):
    announced = row["next_announced"]
    surah, number = parse_label(announced)
    got = label(surah, number)
    assert head(got) == head(announced)
    shown, said = normalize(words(got)), normalize(words(announced))
    assert shown.startswith(said) or said.startswith(shown)
    assert got.count("﴿") == got.count("﴾") == 1 and got.endswith("﴾")


@pytest.mark.parametrize("row", ANNOUNCED, ids=lambda r: str(r["lesson"]))
def test_announced_words_are_the_opening_of_the_announced_ayah(row):
    assert matches(words(row["next_announced"]), *parse_label(row["next_announced"]))


def test_parse_label_reads_both_digit_styles():
    assert parse_label("تفسير سورة الأنفال: من الآية (60) ﴿وَأَعِدُّوا...﴾") == (8, 60)
    assert parse_label("تفسير سورة التوبة: من الآية (١٣) ﴿أَلَا...﴾") == (9, 13)
    assert parse_label("من قوله: باب فضل التوحيد") is None
    assert parse_label("تفسير سورة المجهول: من الآية (1) ﴿...﴾") is None


def test_surah_names_ignore_diacritics_and_prefix():
    assert surah_number("الأنفال") == 8
    assert surah_number("سورة التوبة") == 9
    assert surah_number("الانفال") == 8
    assert surah_number("") is None


def test_first_ayah_drops_the_basmala_except_in_al_fatiha():
    assert ayah(8, 1).startswith("يَسْأَلُونَكَ")
    assert ayah(2, 1) == "الم"
    assert ayah(1, 1).startswith("بِسْمِ")
    assert ayah(9, 130) is None


def test_opening_keeps_whole_words_and_closes_the_bracket():
    assert opening("الم") == "﴿الم﴾"
    cut = opening(ayah(2, 282))
    assert cut.endswith("...﴾") and cut.startswith("﴿") and ayah(2, 282).startswith(cut[1:-4])
    assert opening(ayah(9, 1)) == f"﴿{ayah(9, 1)}﴾"


def test_matches_rejects_another_ayah_and_too_few_letters():
    assert matches("كيف وإن يظهروا عليكم", 9, 8)
    assert not matches("كيف يكون للمشركين عهد", 9, 8)
    assert not matches("كي", 9, 8)
    assert not matches("كيف وإن يظهروا", 9, 999)
