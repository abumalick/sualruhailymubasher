import json
import re
from dataclasses import replace
from pathlib import Path

import pytest

from sualruhaily_agent.api import ApiError, IndexedLesson, IngestIndex
from sualruhaily_agent.captions import Message, SiteLesson, Skip, TelegramLesson, parse_message
from sualruhaily_agent.ingest import Cancel, Moved, Upload, plan, run_ingest

FIXTURES = Path(__file__).parent / "fixtures"
MESSAGES = {
    m["id"]: Message(m["id"], m["date"], m["file"], m["text"])
    for m in json.loads((FIXTURES / "telegram-1448.json").read_text(encoding="utf-8"))["messages"]
}
PAGE_2898 = (FIXTURES / "site-play-2898.html").read_text(encoding="utf-8")


def indexed(ref, course, section, number, url="https://media.test/x.mp3"):
    return IndexedLesson(source_ref=ref, course_id=course, section=section, section_number=number, recording_url=url)


class FakeApi:
    def __init__(self, lessons=(), exception_refs=(), fail=(), status=500, course_ids=("targhib",)):
        self.index = IngestIndex(lessons=list(lessons), exception_refs=list(exception_refs))
        self.fail, self.status, self.course_ids = set(fail), status, list(course_ids)
        self.uploads, self.posts, self.cancellations, self.heartbeats = [], [], [], []

    def ingest_index(self):
        return self.index.model_copy(deep=True)

    def put_media(self, key, path, content_type):
        self.uploads.append((key, content_type, path.read_bytes()))
        return f"https://media.test/{key}"

    def post_lesson(self, body):
        if body["sourceRef"] in self.fail:
            raise ApiError("POST /api/admin/lessons returned the test status", self.status)
        self.posts.append(body)
        rows = [r for r in self.index.lessons if r.source_ref != body["sourceRef"]]
        rows.append(indexed(body["sourceRef"], body["courseId"], body["section"], body["sectionNumber"], body["recordingUrl"]))
        self.index.lessons = rows
        return {"number": len(rows), "created": True, "dateFlag": False, "pushed": False}

    def slot_cancellation(self, body):
        self.cancellations.append(body)
        if self.course_ids:
            self.index.exception_refs.append(body["sourceRef"])
        return {"date": "2026-10-10", "courseIds": self.course_ids, "created": len(self.course_ids)}

    def heartbeat(self, ok, summary):
        self.heartbeats.append((ok, summary))


class FakeTelegram:
    def __init__(self, messages):
        self.messages = messages
        self.exports, self.downloads = [], []

    def export(self, from_id):
        self.exports.append(from_id)
        return [m for m in reversed(self.messages) if m.id >= from_id]

    def download(self, msg_id, dest):
        self.downloads.append(msg_id)
        path = dest / f"3174045392_{msg_id}_{MESSAGES[msg_id].file if msg_id in MESSAGES else 'a.mp3'}"
        path.write_bytes(f"audio {msg_id}".encode())
        return path


class FakeSite:
    """The real 2898 page; other play pages get a synthetic page numbered after their id."""

    def __init__(self):
        self.fetched, self.downloaded = [], []

    def fetch(self, url):
        self.fetched.append(url)
        play = int(url.rsplit("/", 1)[1])
        if play == 2898:
            return PAGE_2898
        return f'<title>({play - 2840}) الكبيرة: س.... 1448/5/1 هـ</title><audio src="https://sualruhaily.com/upload/{play}.mp3">'

    def download(self, url, dest):
        self.downloaded.append(url)
        dest.write_bytes(b"site audio")
        return dest


def messages(*ids):
    return [MESSAGES[i] for i in ids]


def run(api, telegram, tmp_path, **kwargs):
    return run_ingest(api, telegram, kwargs.pop("site", FakeSite()), tmp_path / "ingest" / "state.json", **kwargs)


def identity(lesson):
    return lesson.course_id, lesson.section, lesson.section_number


def by_ref(actions):
    return {a.ref if isinstance(a, Skip) else (a.item if isinstance(a, Cancel) else a.lesson).ref: a for a in actions}


def test_backfill_plans_every_lesson_once(tmp_path):
    summary = run(FakeApi(), FakeTelegram(list(MESSAGES.values())), tmp_path, dry_run=True)

    uploads = [a.lesson for a in summary.actions if isinstance(a, Upload)]
    lessons = [p for p in map(parse_message, MESSAGES.values()) if isinstance(p, (TelegramLesson, SiteLesson))]
    assert len(uploads) == len({identity(l) for l in uploads}) == len(lessons) - 3
    actions = by_ref(summary.actions)
    assert actions["tg:940"] == Skip("tg:940", "duplicate-of:tg:861")
    assert actions["tg:942"] == Skip("tg:942", "duplicate-of:tg:896")
    assert actions["tg:944"] == Skip("tg:944", "duplicate-of:tg:918")
    assert [a.lesson.msg_id for a in summary.actions if isinstance(a, Upload)] == sorted(l.msg_id for l in uploads)


def test_caption_number_typo_falls_back_to_filename():
    actions = by_ref(plan([parse_message(m) for m in MESSAGES.values()], IngestIndex(lessons=[], exception_refs=[])))

    assert identity(actions["tg:915"].lesson) == ("dalil-talib", "كتاب الأطعمة", 2)
    assert identity(actions["tg:916"].lesson) == ("dalil-talib", "كتاب الأطعمة", 3)

    lesson_916 = parse_message(MESSAGES[916])
    clash = replace(lesson_916, ref="tg:2000", msg_id=2000, hijri_date="1448/9/9", file_number=None)
    planned = plan([clash, lesson_916], IngestIndex(lessons=[], exception_refs=[]))
    assert planned[1] == Skip("tg:2000", "identity-conflict:tg:916")


def test_repost_of_ingested_identity_is_skipped():
    index = IngestIndex(lessons=[indexed("tg:861", "kitab-tawhid", "", 1)], exception_refs=[])

    assert plan([parse_message(MESSAGES[940])], index) == [Skip("tg:940", "duplicate-of:tg:861")]


def test_second_pass_is_a_no_op(tmp_path):
    api, site = FakeApi(), FakeSite()
    first = FakeTelegram(list(MESSAGES.values()))
    run(api, first, tmp_path, site=site)
    assert api.posts and api.cancellations and first.downloads

    writes = (len(api.uploads), len(api.posts), len(api.cancellations))
    second, site_again = FakeTelegram(list(MESSAGES.values())), FakeSite()
    summary = run(api, second, tmp_path, site=site_again, from_id=859)

    assert (len(api.uploads), len(api.posts), len(api.cancellations)) == writes
    assert second.downloads == [] and site_again.fetched == [] and site_again.downloaded == []
    assert not any(isinstance(a, (Upload, Moved, Cancel)) for a in summary.actions)


def test_corrected_caption_moves_without_reupload(tmp_path):
    api = FakeApi([indexed("tg:1111", "dalil-talib", "كتاب القضاء", 6, "https://media.test/lessons/dalil-talib/1111.mp3")])
    telegram = FakeTelegram(messages(1111))

    summary = run(api, telegram, tmp_path)

    assert isinstance(summary.actions[0], Moved)
    assert telegram.downloads == [] and api.uploads == []
    [post] = api.posts
    assert post["sectionNumber"] == 7 and post["section"] == "كتاب القضاء"
    assert post["recordingUrl"] == "https://media.test/lessons/dalil-talib/1111.mp3"


def test_kabair_resolved_from_site(tmp_path):
    api, site = FakeApi(), FakeSite()

    run(api, FakeTelegram(messages(1049)), tmp_path, site=site)

    [post] = api.posts
    assert {k: post[k] for k in ("courseId", "section", "sectionNumber", "startPoint", "hijriDate", "sourceRef")} == {
        "courseId": "kabair",
        "section": "",
        "sectionNumber": 54,
        "startPoint": "الكبيرة الثالثة والخمسون: لبس الحرير والذهب للرجال",
        "hijriDate": "1448/5/12",
        "sourceRef": "tg:1049",
    }
    [(key, content_type, _)] = api.uploads
    assert (key, content_type) == ("lessons/kabair/1049.mp3", "audio/mpeg")
    mp3 = re.search(r'src="(https://sualruhaily\.com/upload/[^"]+\.mp3)"', PAGE_2898).group(1)
    assert site.downloaded == [mp3]
    assert post["recordingUrl"] == "https://media.test/lessons/kabair/1049.mp3"


def test_unreadable_site_page_fails_that_post_only(tmp_path):
    class BrokenSite(FakeSite):
        def fetch(self, url):
            return "<title>no number</title>"

    api = FakeApi()
    summary = run(api, FakeTelegram(messages(1049, 1112)), tmp_path, site=BrokenSite())

    assert [p["sourceRef"] for p in api.posts] == ["tg:1112"]
    assert summary.failed == 1 and api.heartbeats[0][0] is False


def test_telegram_lesson_upload_and_post(tmp_path):
    api, telegram = FakeApi(), FakeTelegram(messages(1112))

    run(api, telegram, tmp_path, notify=False)

    [(key, content_type, data)] = api.uploads
    assert (key, content_type, data) == ("lessons/dalil-talib/1112.mp3", "audio/mpeg", b"audio 1112")
    assert api.posts == [{
        "courseId": "dalil-talib",
        "section": "كتاب الشهادات",
        "sectionNumber": 1,
        "hijriDate": "1448/6/3",
        "startPoint": parse_message(MESSAGES[1112]).start_point,
        "recordingUrl": "https://media.test/lessons/dalil-talib/1112.mp3",
        "sourceRef": "tg:1112",
        "notify": False,
    }]
    assert list((tmp_path / "ingest" / "media").iterdir()) == []


def test_absence_and_lecture_become_cancellations(tmp_path):
    api = FakeApi()

    run(api, FakeTelegram(messages(971, 1093)), tmp_path)

    assert api.cancellations == [
        {"sourceRef": "tg:971", "slot": "asr", "date": "2026-10-10", "note": "اعتذار الشيخ عن درس العصر"},
        {"sourceRef": "tg:1093", "slot": "asr", "hijriDate": "1448/6/1", "note": "محاضرة: خطر الإشاعات على العقيدة والفكر"},
    ]


def test_cancellation_matching_no_course_is_reported(tmp_path, caplog):
    api = FakeApi(course_ids=())

    run(api, FakeTelegram(messages(971)), tmp_path)

    assert "tg:971" in caplog.text and "no course" in caplog.text


def test_known_exception_ref_is_not_cancelled_again():
    index = IngestIndex(lessons=[], exception_refs=["tg:971"])
    assert plan([parse_message(MESSAGES[971])], index) == [Skip("tg:971", "done")]


def test_one_failure_does_not_stop_the_run(tmp_path):
    api = FakeApi(fail={"tg:1111"})

    summary = run(api, FakeTelegram(messages(1111, 1112)), tmp_path)

    assert [p["sourceRef"] for p in api.posts] == ["tg:1112"]
    assert summary.failed == 1
    assert api.heartbeats == [(False, "1 lesson, 0 cancellations, 0 skipped, 1 failed")]
    assert json.loads((tmp_path / "ingest" / "state.json").read_text()) == {"last_id": 1112}


@pytest.mark.parametrize("status", [401, 403])
def test_auth_failure_stops_the_run(tmp_path, status):
    api = FakeApi(fail={"tg:1111"}, status=status)
    telegram = FakeTelegram(messages(1111, 1112))

    with pytest.raises(ApiError):
        run(api, telegram, tmp_path)

    assert api.posts == [] and telegram.downloads == [1111]
    assert api.heartbeats == []
    assert not (tmp_path / "ingest" / "state.json").exists()


def test_rescan_window_uses_state(tmp_path):
    state = tmp_path / "ingest" / "state.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"last_id": 1112}))
    telegram = FakeTelegram([])

    run(FakeApi(), telegram, tmp_path)
    run(FakeApi(), telegram, tmp_path, from_id=1100)

    assert telegram.exports == [962, 1100]
    assert json.loads(state.read_text()) == {"last_id": 1112}


def test_first_run_starts_at_the_first_1448_lesson(tmp_path):
    telegram = FakeTelegram([])
    run(FakeApi(), telegram, tmp_path)
    assert telegram.exports == [859]


def test_dry_run_writes_nothing(tmp_path):
    api, telegram, site = FakeApi(), FakeTelegram(list(MESSAGES.values())), FakeSite()

    summary = run(api, telegram, tmp_path, site=site, dry_run=True)

    assert summary.lessons > 0 and summary.cancellations == 3
    assert api.uploads == api.posts == api.cancellations == api.heartbeats == []
    assert telegram.downloads == [] and site.downloaded == []
    assert not (tmp_path / "ingest").exists()


def test_heartbeat_reports_failures(tmp_path):
    unrecognised = Message(5000, 1791632929, "x.mp3", "شرح صحيح الترغيب والترهيب")
    api = FakeApi()

    run(api, FakeTelegram([*messages(1112, 1105), unrecognised]), tmp_path)

    assert api.heartbeats == [(False, "1 lesson, 0 cancellations, 2 skipped, 0 failed")]


def test_heartbeat_ok_on_a_clean_run(tmp_path):
    api = FakeApi()
    run(api, FakeTelegram(messages(1112, 971)), tmp_path)
    assert api.heartbeats == [(True, "1 lesson, 1 cancellation, 0 skipped, 0 failed")]
