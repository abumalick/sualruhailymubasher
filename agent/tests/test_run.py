import json

import httpx
import pytest

from albadr_agent import cli
from albadr_agent.locate import ClaudeUnavailable, LocateResult, candidate_pages
from albadr_agent.lock import run_lock

PAGES = [f"صفحة {i}" for i in range(1, 6)]


def lesson(course, number, pdfs=("https://x/a.pdf",), **extra):
    return {
        "courseId": course, "number": number, "recordingUrl": f"https://x/{course}{number}.mp3",
        "startPoint": "من قوله: صفحة", "pdfUrls": list(pdfs), **extra,
    }


def good(**over):
    base = dict(start_page=1, end_page=2, pdf_index=0, end_pdf_index=0,
                end_point="من قوله: كذا", confidence=0.9)
    return LocateResult(**{**base, **over})


@pytest.fixture
def setup(monkeypatch, tmp_path):
    monkeypatch.setenv("API_BASE", "https://api.test")
    monkeypatch.setenv("ADMIN_TOKEN", "tok")
    monkeypatch.setenv("ALBADR_AGENT_LOCK", str(tmp_path / "run.lock"))
    monkeypatch.setattr(cli, "DEFAULT_TRANSCRIPTS", tmp_path / "tr")
    monkeypatch.setattr(cli, "DEFAULT_VERDICTS", tmp_path / "verdicts")
    mp3s = []

    def download(url):
        mp3 = tmp_path / f"{len(mp3s)}.mp3"
        mp3.write_bytes(b"x")
        mp3s.append(mp3)
        return mp3

    monkeypatch.setattr(cli, "download_audio", download)
    monkeypatch.setattr(cli, "transcribe", lambda mp3, out: [])
    monkeypatch.setattr(cli, "book_pages", lambda url: PAGES)
    monkeypatch.setattr(cli, "candidate_pages", lambda p, pages, prev, size=None: pages)
    patches = []

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=handler.pending)
        patches.append((request.url.path, request.content))
        return httpx.Response(200, json={})

    handler.pending = []
    return handler, patches, mp3s


def run(handler):
    return cli.main(["run"], transport=httpx.MockTransport(handler))


def test_failure_in_one_lesson_does_not_stop_the_next(setup, monkeypatch):
    handler, patches, mp3s = setup
    handler.pending = [lesson("c", 1), lesson("c", 2)]
    results = iter([RuntimeError("boom"), good()])

    def fake_locate(prompt):
        r = next(results)
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(cli, "locate", fake_locate)
    assert run(handler) == 0
    assert [p for p, _ in patches] == ["/api/admin/lessons/c/2"]
    assert b'"endPdfIndex":0' in patches[0][1].replace(b" ", b"")
    assert mp3s[0].exists() and not mp3s[1].exists()


def test_rejected_result_is_not_patched(setup, monkeypatch):
    handler, patches, mp3s = setup
    handler.pending = [lesson("c", 1)]
    monkeypatch.setattr(cli, "locate", lambda prompt: good(confidence=0.2))
    assert run(handler) == 0
    assert patches == [] and mp3s[0].exists()


def test_course_without_pdfs_is_skipped_without_download(setup, monkeypatch, caplog):
    handler, patches, mp3s = setup
    caplog.set_level("INFO")
    handler.pending = [lesson("t", 1, pdfs=())]
    assert run(handler) == 0
    assert mp3s == [] and patches == []
    assert "no book PDF" in caplog.text


def test_held_lock_does_not_call_pending(setup, tmp_path):
    handler, _, _ = setup

    def boom(request):
        raise AssertionError("must not call server")

    with run_lock(tmp_path / "run.lock"):
        assert cli.main(["run"], transport=httpx.MockTransport(boom)) == 0


BOOK = {
    "https://x/v1.pdf": ["مقدمة الكتاب والحمد لله", "باب فضل التوحيد وما يكفر من الذنوب", "شرح الحديث الاول"],
    "https://x/v2.pdf": ["باب الخوف من الشرك وقول الله تعالى", "باب الدعاء الى شهادة ان لا اله الا الله"],
}


@pytest.fixture
def chained(setup, monkeypatch):
    handler, patches, mp3s = setup
    monkeypatch.setattr(cli, "book_pages", lambda url: BOOK[url])

    def no_audio(*a, **k):
        raise AssertionError("must not download or transcribe")

    monkeypatch.setattr(cli, "download_audio", no_audio)
    monkeypatch.setattr(cli, "transcribe", no_audio)
    monkeypatch.setattr(cli, "locate", no_audio)
    return handler, patches


@pytest.fixture
def recorded(chained, monkeypatch):
    handler, patches = chained
    monkeypatch.setattr(cli, "download_audio", lambda url: cli.Path(url))
    monkeypatch.setattr(cli, "transcribe", lambda mp3, out: [])
    monkeypatch.setattr(cli, "candidate_pages", candidate_pages)
    prompts = []

    def fake_locate(prompt):
        prompts.append(prompt)
        return fake_locate.answer

    fake_locate.answer = good(start_page=1, end_page=1, pdf_index=1, end_pdf_index=1, end_point="من قوله: من كلود")
    monkeypatch.setattr(cli, "locate", fake_locate)
    return handler, patches, prompts, fake_locate


def older(**extra):
    return lesson("c", 4, pdfs=list(BOOK), startPoint="من قوله: بَابُ فَضْلِ التَّوْحِيدِ", **extra)


def test_next_start_point_patches_end_from_the_chained_start_without_transcription(chained, caplog):
    handler, patches = chained
    caplog.set_level("INFO")
    handler.pending = [older(nextStartPoint="من قوله: باب الخوف من الشرك", startPage=2, pdfIndex=0)]
    assert run(handler) == 0
    [(path, body)] = patches
    assert path == "/api/admin/lessons/c/4"
    assert json.loads(body) == {
        "endPoint": "من قوله: باب الخوف من الشرك", "endPage": 1, "endPdfIndex": 1,
        "startPage": 2, "pdfIndex": 0,
    }
    assert "start match 1.00, end match 1.00" in caplog.text


def test_next_start_point_truncates(chained):
    handler, patches = chained
    nxt = "من قوله: باب الدعاء الى شهادة ان لا اله الا الله " + "و" * 100
    handler.pending = [older(nextStartPoint=nxt, startPage=1, pdfIndex=1)]
    assert run(handler) == 0
    body = json.loads(patches[0][1])
    assert body == {"endPoint": nxt[:80], "endPage": 2, "endPdfIndex": 1, "startPage": 1, "pdfIndex": 1}


@pytest.mark.parametrize("start_page,pdf_index", [(None, None), (1, None), (9, 0)])
def test_without_a_known_start_the_next_start_point_goes_to_the_recording(recorded, caplog, start_page, pdf_index):
    handler, patches, prompts, _ = recorded
    caplog.set_level("INFO")
    nxt = "من قوله: باب الخوف من الشرك"
    handler.pending = [older(nextStartPoint=nxt, startPage=start_page, pdfIndex=pdf_index)]
    assert run(handler) == 0
    assert "no known start page, using the recording" in caplog.text
    assert len(prompts) == 1
    body = json.loads(patches[0][1])
    assert (body["startPage"], body["pdfIndex"], body["endPoint"]) == (1, 1, nxt)


def test_next_start_point_without_a_confident_match_falls_through_to_the_recording(recorded, caplog):
    handler, patches, prompts, _ = recorded
    nxt = "من قوله: باب الخوف من الشرك والرياء"
    handler.pending = [older(nextStartPoint=nxt, startPage=1, pdfIndex=1)]
    assert run(handler) == 0
    assert "best 0.75 at 1:1" in caplog.text and "falling back to the recording" in caplog.text
    [prompt] = prompts
    assert f"الدرس التالي يبدأ بـ: {nxt}" in prompt
    assert "ملف 0 صفحة 3 ===" in prompt and "ملف 0 صفحة 2 ===" not in prompt
    assert json.loads(patches[0][1]) == {"endPage": 1, "endPdfIndex": 1, "endPoint": nxt}


def test_next_start_point_before_the_start_is_not_matched(recorded, caplog):
    handler, patches, prompts, _ = recorded
    handler.pending = [older(nextStartPoint="من قوله: مقدمة الكتاب والحمد لله", startPage=2, pdfIndex=0)]
    assert run(handler) == 0
    assert "falling back to the recording" in caplog.text and len(prompts) == 1


def test_next_start_point_not_in_the_book_falls_through_to_the_recording(recorded, caplog):
    handler, patches, prompts, _ = recorded
    handler.pending = [older(nextStartPoint="من قوله: كلام غير موجود اصلا هنا", startPage=2, pdfIndex=0)]
    assert run(handler) == 0
    assert "falling back to the recording" in caplog.text and len(prompts) == 1


def test_known_start_patches_only_the_end_fields(recorded):
    handler, patches, _, fake = recorded
    fake.answer = good(start_page=2, end_page=1, pdf_index=0, end_pdf_index=1)
    handler.pending = [lesson("c", 9, pdfs=list(BOOK), startPage=3, pdfIndex=0)]
    assert run(handler) == 0
    assert json.loads(patches[0][1]) == {"endPage": 1, "endPdfIndex": 1, "endPoint": "من قوله: كذا"}


def test_unknown_start_patches_claudes_start(recorded):
    handler, patches, _, fake = recorded
    handler.pending = [lesson("c", 9, pdfs=list(BOOK), startPoint="من قوله: شرح الحديث الاول")]
    fake.answer = good(start_page=3, end_page=1, pdf_index=0, end_pdf_index=1)
    assert run(handler) == 0
    assert json.loads(patches[0][1]) == {
        "startPage": 3, "pdfIndex": 0, "endPage": 1, "endPdfIndex": 1, "endPoint": "من قوله: كذا",
    }


def test_a_rejected_verdict_is_not_asked_again_until_an_input_changes(recorded, caplog):
    handler, patches, prompts, fake = recorded
    caplog.set_level("INFO")
    fake.answer = good(confidence=0.2)
    handler.pending = [lesson("c", 9, pdfs=list(BOOK), startPage=3, pdfIndex=0)]
    assert run(handler) == 0
    assert run(handler) == 0
    assert len(prompts) == 1 and patches == []
    assert "cached claude verdict" in caplog.text
    handler.pending = [lesson("c", 9, pdfs=list(BOOK), startPage=3, pdfIndex=0, nextStartPoint="من قوله: جديد")]
    assert run(handler) == 0
    assert len(prompts) == 2


def test_a_missing_answer_is_cached_too(recorded):
    handler, patches, prompts, fake = recorded
    fake.answer = None
    handler.pending = [lesson("c", 9, pdfs=list(BOOK), startPage=3, pdfIndex=0)]
    run(handler)
    run(handler)
    assert len(prompts) == 1


def test_server_error_on_patch_keeps_the_mp3_continues_and_resends_without_claude(setup, monkeypatch, caplog):
    handler, patches, mp3s = setup
    asked = []
    monkeypatch.setattr(cli, "locate", lambda prompt: asked.append(prompt) or good())
    handler.pending = [lesson("c", 1), lesson("c", 2)]
    seen = []

    def flaky(request):
        if request.method == "GET":
            return httpx.Response(200, json=handler.pending)
        seen.append(request.url.path)
        return httpx.Response(500 if request.url.path.endswith("/1") else 200, json={})

    assert run(flaky) == 0
    assert seen == ["/api/admin/lessons/c/1", "/api/admin/lessons/c/2"]
    assert mp3s[0].exists() and not mp3s[1].exists()
    assert "c #1: failed" in caplog.text
    assert run(handler) == 0
    assert len(asked) == 2 and [p for p, _ in patches] == ["/api/admin/lessons/c/1", "/api/admin/lessons/c/2"]


def test_unavailable_claude_cli_exits_nonzero_after_the_other_lessons(recorded, monkeypatch, caplog):
    handler, patches, _, _ = recorded

    def gone(prompt):
        raise ClaudeUnavailable("claude: not found")

    monkeypatch.setattr(cli, "locate", gone)
    handler.pending = [
        lesson("c", 9, pdfs=list(BOOK), startPage=3, pdfIndex=0),
        older(nextStartPoint="من قوله: باب الخوف من الشرك", startPage=2, pdfIndex=0),
    ]
    assert run(handler) == 1
    assert [p for p, _ in patches] == ["/api/admin/lessons/c/4"]
    assert "claude CLI unavailable" in caplog.text
    monkeypatch.setattr(cli, "locate", lambda prompt: good(start_page=3, end_page=1, end_pdf_index=1))
    handler.pending = handler.pending[:1]
    assert run(handler) == 0
    assert len(patches) == 2


def test_low_confidence_at_the_window_edge_retries_with_a_wider_window(setup, monkeypatch):
    handler, patches, _ = setup
    monkeypatch.setattr(cli, "candidate_pages", candidate_pages)
    book = [f"صفحة رقم {i}" for i in range(1, 41)]
    monkeypatch.setattr(cli, "book_pages", lambda url: book)
    handler.pending = [lesson("c", 9, startPage=1, pdfIndex=0)]
    prompts, answers = [], iter([good(start_page=1, end_page=12, confidence=0.4), good(start_page=1, end_page=15)])

    def fake_locate(prompt):
        prompts.append(prompt)
        return next(answers)

    monkeypatch.setattr(cli, "locate", fake_locate)
    assert run(handler) == 0
    assert len(prompts) == 2
    assert "صفحة 12 ===" in prompts[0] and "صفحة 13 ===" not in prompts[0]
    assert "صفحة 24 ===" in prompts[1] and "صفحة 25 ===" not in prompts[1]
    assert json.loads(patches[0][1])["endPage"] == 15


def test_low_confidence_inside_the_window_does_not_retry(setup, monkeypatch):
    handler, patches, _ = setup
    monkeypatch.setattr(cli, "candidate_pages", candidate_pages)
    monkeypatch.setattr(cli, "book_pages", lambda url: [f"صفحة رقم {i}" for i in range(1, 41)])
    handler.pending = [lesson("c", 9, startPage=1, pdfIndex=0)]
    calls = []
    monkeypatch.setattr(cli, "locate", lambda prompt: calls.append(prompt) or good(end_page=5, confidence=0.4))
    assert run(handler) == 0
    assert len(calls) == 1 and patches == []


def test_unauthorized_patch_stops_the_run(setup, monkeypatch):
    handler, patches, _ = setup
    handler.pending = [lesson("c", 1), lesson("c", 2)]
    monkeypatch.setattr(cli, "locate", lambda prompt: good())
    seen = []

    def deny(request):
        if request.method == "GET":
            return httpx.Response(200, json=handler.pending)
        seen.append(request.url.path)
        return httpx.Response(401, json={})

    assert run(deny) == 1
    assert seen == ["/api/admin/lessons/c/1"]


def test_a_patched_end_becomes_the_next_lessons_start_in_the_same_run(recorded):
    handler, patches, prompts, fake = recorded
    fake.answer = None
    handler.pending = [
        older(nextStartPoint="من قوله: باب الخوف من الشرك", startPage=2, pdfIndex=0),
        lesson("c", 5, pdfs=list(BOOK), startPoint="من قوله: شرح الحديث الاول"),
    ]
    assert run(handler) == 0
    assert len(patches) == 1
    assert "=== ملف 1 صفحة 1 ===" in prompts[0] and "ملف 0 صفحة 2 ===" not in prompts[0]
