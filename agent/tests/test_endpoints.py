import json
from pathlib import Path

from sualruhaily_agent.api import Published
from sualruhaily_agent.endpoints import corrections, recorded_end_point
from sualruhaily_agent.locate import LocateResult
from sualruhaily_agent.quran import ayah, label

STATE = json.loads((Path(__file__).parent / "fixtures" / "api-state-2026-11-01.json").read_text())
TAFSIR = "تفسير سورة التوبة: من الآية (٥) ﴿فَإِذَا انْسَلَخَ الْأَشْهُرُ الْحُرُمُ فَاقْتُلُوا الْمُشْرِكِينَ...﴾"


def found(**over):
    base = dict(start_page=1, end_page=2, pdf_index=0, end_pdf_index=0, end_point="من قوله: كذا", confidence=0.9)
    return LocateResult(**{**base, **over})


def latest(course_id):
    [course] = [c for c in STATE["courses"] if c["id"] == course_id]
    return [Published.model_validate(lesson) for lesson in course["latest"]]


def test_published_next_start_wins_for_both_course_kinds():
    assert recorded_end_point(TAFSIR, "منشور", found()) == ("منشور", None)
    assert recorded_end_point("من قوله: باب", "منشور", found()) == ("منشور", None)


def test_book_course_keeps_the_book_sentence():
    assert recorded_end_point("من قوله: باب", None, found()) == ("من قوله: كذا", None)


def test_tafsir_uses_the_checked_ayah():
    got = found(next_surah="التوبة", next_ayah=8, next_ayah_words=ayah(9, 8))
    assert recorded_end_point(TAFSIR, None, got) == (label(9, 8), None)


def test_tafsir_without_a_checked_ayah_is_left_unset_never_the_book_sentence():
    point, problem = recorded_end_point(TAFSIR, None, found())
    assert point is None and problem


def test_corrections_on_the_captured_state_fix_the_cut_tafsir_end_points():
    got = dict(corrections(latest("tafsir-saadi")))
    by_number = {l.number: l for l in latest("tafsir-saadi")}
    assert got == {451: by_number[452].start_point, 452: by_number[453].start_point}


def test_corrections_skip_book_courses_and_unlocated_lessons():
    assert corrections(latest("kitab-tawhid")) == []
    unlocated = [Published(number=1, start_point=TAFSIR), Published(number=2, start_point="تفسير سورة التوبة: من الآية (٨) ﴿...﴾")]
    assert corrections(unlocated) == []


STATE_SECTIONS = json.loads((Path(__file__).parent / "fixtures" / "api-state-2026-11-15.json").read_text())


def test_corrections_pair_a_lesson_with_its_neighbour_in_sequence_order_across_sections():
    [course] = [c for c in STATE_SECTIONS["courses"] if c["id"] == "dalil-talib"]
    lessons = [Published.model_validate(l) for l in course["latest"]]
    assert [l.label for l in lessons[:2]] == ["كتاب الشهادات – الدرس ١", "كتاب القضاء – الدرس ٧"]
    cut = {**lessons[1].model_dump(), "start_point": TAFSIR, "end_point": "x", "end_page": 3}
    lessons[1] = Published.model_validate(cut)
    lessons[0] = Published.model_validate({**lessons[0].model_dump(), "start_point": "من قوله: بداية الشهادات"})
    assert corrections(lessons) == [(7, "من قوله: بداية الشهادات")]


def test_published_carries_section_and_label():
    [course] = [c for c in STATE_SECTIONS["courses"] if c["id"] == "dalil-talib"]
    first = Published.model_validate(course["latest"][0])
    assert (first.section, first.label) == ("كتاب الشهادات", "كتاب الشهادات – الدرس ١")
