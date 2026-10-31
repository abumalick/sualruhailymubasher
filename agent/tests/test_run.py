import httpx
import pytest

from albadr_agent import cli
from albadr_agent.locate import LocateResult
from albadr_agent.lock import run_lock

PAGES = [f"صفحة {i}" for i in range(1, 6)]


def lesson(course, number, pdfs=("https://x/a.pdf",)):
    return {
        "courseId": course, "number": number, "recordingUrl": f"https://x/{course}{number}.mp3",
        "startPoint": "من قوله: صفحة", "pdfUrls": list(pdfs),
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
    monkeypatch.setattr(cli, "candidate_pages", lambda p, pages, prev: pages)
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
