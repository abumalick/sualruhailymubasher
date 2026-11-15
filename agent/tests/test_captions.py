import json
from pathlib import Path

import pytest

from sualruhaily_agent.captions import (
    Absence,
    Lecture,
    Message,
    SiteLesson,
    Skip,
    TelegramLesson,
    parse_message,
)

FIXTURE = Path(__file__).parent / "fixtures" / "telegram-1448.json"
MESSAGES = {
    m["id"]: Message(m["id"], m["date"], m["file"], m["text"])
    for m in json.loads(FIXTURE.read_text(encoding="utf-8"))["messages"]
}


def parse(msg_id):
    return parse_message(MESSAGES[msg_id])


@pytest.mark.parametrize(
    "msg_id, course, section, number, hijri, start_point",
    [
        (859, "targhib", "كتاب الصدقات", 5, "1448/3/20", "لترهيب من منع الزكاة وماجاء في زكاة الحلي"),
        (861, "kitab-tawhid", "", 1, "1448/3/23", "المقدمة"),
        (866, "dalil-talib", "كتاب الحدود", 12, "1448/3/23", "قوله: باب قتال البغاة ويعتبر كونه قرشياً"),
        (867, "dalil-talib", "كتاب الحدود", 11, "1448/3/22", "قوله: باب قتال البغاة"),
        (
            895,
            "dalil-talib",
            "كتاب الأطعمة",
            1,
            "1448/4/1",
            "قوله: كتاب الأطعمة. يُباح كل طعام طاهر لا مضرّة فيه حتى المسك ونحوه.",
        ),
        (917, "dalil-talib", "كتاب الأطعمة", 4, "1448/4/8", "قوله: ويربوع وبقر وحش وحمره وضب وظباء"),
        (
            918,
            "kitab-tawhid",
            "",
            3,
            "1448/4/8",
            "قوله: وقوله تعالى ولقد بعثنا في كل أمة رسولاً أن اعبدوا الله",
        ),
        (
            955,
            "kitab-tawhid",
            "",
            4,
            "1448/4/22",
            "قوله: وقول الله تعالىوقضى ربك ألا تعبدوا إلا إياه وبالوالدين إحساناً",
        ),
        (
            1006,
            "targhib",
            "كتاب الصدقات",
            10,
            "1448/5/3",
            "الترهيب من المسألة وتحريمها مع الغنى وماجاء في ذم الطمع",
        ),
        (1009, "kitab-tawhid", "", 6, "1448/5/5", "قوله: فيه مسائل الأولى الحكمة في خلق الجن والإنس"),
        (1112, "dalil-talib", "كتاب الشهادات", 1, "1448/6/3", "قوله: تحمل الشهادة في حقوق الآدميين فرض كفاية"),
    ],
)
def test_course_lessons(msg_id, course, section, number, hijri, start_point):
    assert parse(msg_id) == TelegramLesson(
        f"tg:{msg_id}", course, section, number, hijri, start_point, msg_id, "mp3"
    )


def test_duplicate_post_parses_like_the_original():
    original = parse(861)
    duplicate = parse(940)

    assert duplicate == TelegramLesson(
        "tg:940",
        original.course_id,
        original.section,
        original.section_number,
        original.hijri_date,
        original.start_point,
        940,
        "mp3",
    )


def test_kabair_majlis_post_becomes_a_site_lesson():
    assert parse(1049) == SiteLesson(
        "tg:1049", "kabair", "https://sualruhaily.com/play/2898", "1448/5/12"
    )


@pytest.mark.parametrize(
    "msg_id, reason",
    [
        (872, "majlis-other-course"),
        (1033, "kabair-audio"),
        (968, "khutba"),
        (1097, "lecture-audio"),
        (1109, "live-start"),
        (873, "live-start"),
        (970, "no-lesson"),
    ],
)
def test_skipped_posts(msg_id, reason):
    assert parse(msg_id) == Skip(f"tg:{msg_id}", reason)


def test_absences_use_the_medina_date_of_the_post():
    assert parse(971) == Absence("tg:971", "asr", "2026-10-10")
    assert parse(1005) == Absence("tg:1005", "asr", "2026-10-17")


def test_absence_for_tomorrow_moves_one_day_forward():
    text = "تنبيه:- يعتذر شيخنا حفظه الله غداً عن درس الفجر ."
    posted = 1794524400  # 2026-11-13 02:00 in Medina

    assert parse_message(Message(1, posted, "", text)) == Absence("tg:1", "fajr", "2026-11-14")
    assert parse_message(Message(1, posted, "", text.replace("غداً", "غدا"))) == Absence(
        "tg:1", "fajr", "2026-11-14"
    )


def test_absence_date_rolls_over_at_midnight_medina_time():
    text = "يعتذر شيخنا اليوم عن درس المغرب"
    posted = 1794524400 - 7200 - 1  # 2026-11-12 23:59:59 in Medina

    assert parse_message(Message(1, posted, "", text)) == Absence("tg:1", "maghrib", "2026-11-12")


def test_apology_without_a_known_slot_is_unrecognised():
    assert parse_message(Message(2, 1794524400, "", "يعتذر شيخنا عن الدرس")) == Skip(
        "tg:2", "unrecognised"
    )


def test_lecture_announcement():
    assert parse(1093) == Lecture("tg:1093", "asr", "1448/6/1", "خطر الإشاعات على العقيدة والفكر")


@pytest.mark.parametrize(
    "month, number",
    [
        ("محرم", 1),
        ("صفر", 2),
        ("ربيع الأول", 3),
        ("ربيع الآخر", 4),
        ("ربيع الثاني", 4),
        ("جمادى الأولى", 5),
        ("جمادى الآخرة", 6),
        ("جمادى الثانية", 6),
        ("رجب", 7),
        ("شعبان", 8),
        ("رمضان", 9),
        ("شوال", 10),
        ("ذو القعدة", 11),
        ("ذو الحجة", 12),
    ],
)
def test_lecture_month_names(month, number):
    text = f"💡#دعوة\n📌لحضور #محاضرة\n📘 عنوان\n⏱ الفجر\n🗓 الأحد: 12 {month} ١٤٤٩ هـ"

    assert parse_message(Message(3, 0, "x.jpg", text)) == Lecture(
        "tg:3", "fajr", f"1449/{number}/12", "عنوان"
    )


def test_every_audio_post_is_classified():
    audio = [m for m in MESSAGES.values() if m.file.endswith((".mp3", ".m4a"))]

    assert audio
    assert [m.id for m in audio if parse_message(m) == Skip(f"tg:{m.id}", "unrecognised")] == []


def test_audio_with_an_unknown_caption_is_unrecognised():
    assert parse_message(Message(4, 0, "a.mp3", "تسجيل")) == Skip("tg:4", "unrecognised")


def test_text_only_post_without_a_rule_is_no_lesson():
    assert parse_message(Message(5, 0, "", "السلام عليكم")) == Skip("tg:5", "no-lesson")


def test_m4a_extension_is_kept():
    text = "شرح دليل الطالب\n\nكتاب الأيمان [2]\n\n٥/ ٥/ ١٤٤٨هـ"
    lesson = parse_message(Message(6, 0, "02قوله_س_05_05_1448.m4a", text))

    assert lesson.ext == "m4a"
