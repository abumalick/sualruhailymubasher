import json

import httpx
import pytest

from albadr_agent import cli
from albadr_agent.locate import LocateResult, candidate_pages
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


def older(**extra):
    return lesson("c", 4, pdfs=list(BOOK), startPoint="من قوله: بَابُ فَضْلِ التَّوْحِيدِ", **extra)


def test_next_start_point_patches_end_without_transcription(chained):
    handler, patches = chained
    handler.pending = [older(nextStartPoint="من قوله: باب الخوف من الشرك", startPage=None, pdfIndex=None)]
    assert run(handler) == 0
    [(path, body)] = patches
    assert path == "/api/admin/lessons/c/4"
    assert json.loads(body) == {
        "endPoint": "من قوله: باب الخوف من الشرك", "endPage": 1, "endPdfIndex": 1,
        "startPage": 2, "pdfIndex": 0,
    }


def test_next_start_point_uses_given_start_and_truncates(chained):
    handler, patches = chained
    nxt = "من قوله: باب الدعاء الى شهادة ان لا اله الا الله " + "و" * 100
    handler.pending = [older(nextStartPoint=nxt, startPage=1, pdfIndex=1)]
    assert run(handler) == 0
    body = json.loads(patches[0][1])
    assert body == {"endPoint": nxt[:80], "endPage": 2, "endPdfIndex": 1, "startPage": 1, "pdfIndex": 1}


@pytest.mark.parametrize("start_page,pdf_index", [(1, None), (9, 0)])
def test_unusable_own_start_falls_back_to_the_start_point_match(chained, start_page, pdf_index):
    handler, patches = chained
    handler.pending = [older(nextStartPoint="من قوله: باب الخوف من الشرك", startPage=start_page, pdfIndex=pdf_index)]
    assert run(handler) == 0
    body = json.loads(patches[0][1])
    assert (body["startPage"], body["pdfIndex"]) == (2, 0)


def test_next_start_point_before_the_start_is_not_matched(chained, caplog):
    handler, patches = chained
    handler.pending = [older(nextStartPoint="من قوله: مقدمة الكتاب والحمد لله", startPage=None, pdfIndex=None)]
    assert run(handler) == 0
    assert patches == []
    assert "next start point not found" in caplog.text


def test_next_start_point_without_a_confident_match_stays_pending(chained, caplog):
    handler, patches = chained
    handler.pending = [older(nextStartPoint="من قوله: كلام غير موجود اصلا هنا", startPage=None, pdfIndex=None)]
    assert run(handler) == 0
    assert patches == []
    assert "next start point not found" in caplog.text


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
