import json
from pathlib import Path

import pytest

from albadr_agent.quran import ayah, label, matches, next_lesson_start, normalize, opening, parse_label, surah_number

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


def test_matches_needs_every_written_letter_when_ayahs_share_an_opening():
    assert matches(ayah(8, 20), 8, 20)
    assert not matches(ayah(8, 20), 8, 15)


def test_matches_ignores_a_basmala_before_the_first_ayah():
    assert matches("بسم الله الرحمن الرحيم يسألونك عن الأنفال قل الأنفال", 8, 1)
    assert matches("الم", 2, 1)


def test_ayah_one_has_no_basmala_in_any_surah_and_matches_its_real_opening():
    for surah in range(2, 115):
        first = ayah(surah, 1)
        assert not normalize(first).startswith(normalize(ayah(1, 1))), surah
        assert matches(first, surah, 1), surah
    assert normalize(ayah(95, 1)) == normalize("والتين والزيتون")
    assert normalize(ayah(97, 1)).startswith(normalize("إنا أنزلناه"))


def test_a_shared_generic_opening_with_a_wrong_number_is_rejected():
    generic = "يا أيها الذين آمنوا"
    assert normalize(ayah(8, 24)).startswith(normalize(generic)) and normalize(ayah(8, 27)).startswith(normalize(generic))
    assert not matches(generic, 8, 27)
    point, problem = next_lesson_start("تفسير سورة الأنفال: من الآية (٢٠) ﴿...﴾", "الأنفال", 27, generic)
    assert point is None and "not a known ayah opening" in problem
    assert not matches(ayah(8, 24), 8, 27)


def test_matches_rejects_another_ayah_and_too_few_letters():
    assert matches("كيف وإن يظهروا عليكم لا يرقبوا فيكم", 9, 8)
    assert not matches("كيف يكون للمشركين عهد", 9, 8)
    assert not matches("كي", 9, 8)
    assert not matches("كيف وإن يظهروا", 9, 999)


@pytest.mark.parametrize("row", [r for r in ANNOUNCED if "claude" in r], ids=lambda r: str(r["lesson"]))
def test_real_claude_replies_give_the_announced_next_ayah(row):
    c = row["claude"]
    got = next_lesson_start(row["start_point"], c["next_surah"], c["next_ayah"], c["next_ayah_words"])
    assert got == (label(*parse_label(row["next_announced"])), None)


NINE_FIVE = "تفسير سورة التوبة: من الآية (٥) ﴿فَإِذَا انْسَلَخَ...﴾"


@pytest.mark.parametrize("surah,number,words,why", [
    (None, None, None, "not a known ayah opening"),
    ("التوبة", 8, "كيف يكون للمشركين عهد", "not a known ayah opening"),
    ("التوبة", 4, ayah(9, 4), "does not follow"),
    ("التوبة", 60, ayah(9, 60), "does not follow"),
    ("يونس", 1, ayah(10, 1), "does not follow"),
])
def test_next_lesson_start_rejects_with_a_reason(surah, number, words, why):
    point, problem = next_lesson_start(NINE_FIVE, surah, number, words)
    assert point is None and why in problem


def test_next_lesson_start_is_silent_for_book_courses():
    assert next_lesson_start("من قوله: باب فضل التوحيد", "التوبة", 8, "كيف وإن يظهروا") == (None, None)


def test_next_lesson_start_may_open_the_next_surah_only_near_the_end():
    near_end = "تفسير سورة الأنفال: من الآية (٧٣) ﴿وَالَّذِينَ كَفَرُوا...﴾"
    assert next_lesson_start(near_end, "التوبة", 1, ayah(9, 1))[0].startswith("تفسير سورة التوبة: من الآية (١)")
    early = "تفسير سورة الأنفال: من الآية (٥) ﴿كَمَا أَخْرَجَكَ...﴾"
    assert "does not follow" in next_lesson_start(early, "التوبة", 1, ayah(9, 1))[1]
