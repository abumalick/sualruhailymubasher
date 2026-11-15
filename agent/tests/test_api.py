import json

import httpx
import pytest

from sualruhaily_agent.api import Api, ApiError

PENDING = [
    {
        "courseId": "c1",
        "number": 4,
        "recordingUrl": "https://x/r.mp3",
        "startPoint": "من قوله: كذا",
        "pdfUrls": ["https://x/a.pdf"],
    }
]


def api_with(handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return Api("https://api.test", "tok", client)


def test_pending_parses_camel_case():
    seen = {}

    def handler(request):
        seen["auth"] = request.headers["authorization"]
        seen["url"] = str(request.url)
        return httpx.Response(200, json=PENDING)

    [p] = api_with(handler).pending()
    assert p.course_id == "c1" and p.number == 4
    assert p.recording_url == "https://x/r.mp3"
    assert p.start_point == "من قوله: كذا"
    assert p.pdf_urls == ["https://x/a.pdf"]
    assert seen["auth"] == "Bearer tok"
    assert seen["url"] == "https://api.test/api/admin/pending-transcriptions"


def test_unauthorized_raises_api_error_with_status():
    api = api_with(lambda r: httpx.Response(401, json={"error": "no"}))
    with pytest.raises(ApiError) as e:
        api.pending()
    assert e.value.status == 401


def test_unreachable_raises_api_error():
    def handler(request):
        raise httpx.ConnectError("down")

    with pytest.raises(ApiError) as e:
        api_with(handler).pending()
    assert e.value.status is None


def test_patch_lesson_sends_bearer_and_camel_case_body():
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={})

    api_with(handler).patch_lesson(
        "c1",
        4,
        {"start_page": 3, "pdf_index": 0, "end_page": 5, "end_pdf_index": 0, "end_point": "من قوله: س"},
    )
    assert seen["method"] == "PATCH"
    assert seen["path"] == "/api/admin/lessons/c1/4"
    assert seen["auth"] == "Bearer tok"
    assert seen["body"] == {
        "startPage": 3,
        "pdfIndex": 0,
        "endPage": 5,
        "endPdfIndex": 0,
        "endPoint": "من قوله: س",
    }


def test_patch_lesson_error_raises():
    api = api_with(lambda r: httpx.Response(404))
    with pytest.raises(ApiError) as e:
        api.patch_lesson("c1", 4, {"end_page": 1})
    assert e.value.status == 404


@pytest.mark.parametrize("body", [b"not json", b'{"a": 1}', b'[{"courseId": "c"}]'])
def test_malformed_200_body_raises_api_error(body):
    api = api_with(lambda r: httpx.Response(200, content=body))
    with pytest.raises(ApiError):
        api.pending()


def recorder(response):
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["auth"] = request.headers["authorization"]
        seen["headers"] = request.headers
        seen["body"] = request.read()
        return response

    return seen, handler


def test_ingest_index_parses_lessons_and_exception_refs():
    body = {
        "lessons": [{"sourceRef": "tg:861", "courseId": "kitab-tawhid", "section": "", "sectionNumber": 1, "recordingUrl": None}],
        "exceptionRefs": ["tg:971"],
    }
    seen, handler = recorder(httpx.Response(200, json=body))
    index = api_with(handler).ingest_index()
    assert (seen["method"], seen["path"]) == ("GET", "/api/admin/ingest-index")
    [row] = index.lessons
    assert (row.source_ref, row.course_id, row.section, row.section_number, row.recording_url) == (
        "tg:861", "kitab-tawhid", "", 1, None,
    )
    assert index.exception_refs == ["tg:971"]


def test_ingest_index_malformed_raises():
    with pytest.raises(ApiError):
        api_with(lambda r: httpx.Response(200, json={"lessons": [{}]})).ingest_index()


def test_post_lesson_sends_the_body_and_returns_the_result():
    result = {"number": 7, "created": True, "dateFlag": False, "pushed": False}
    seen, handler = recorder(httpx.Response(200, json=result))
    lesson = {"courseId": "c1", "sourceRef": "tg:1", "notify": False}
    assert api_with(handler).post_lesson(lesson) == result
    assert (seen["method"], seen["path"], seen["auth"]) == ("POST", "/api/admin/lessons", "Bearer tok")
    assert json.loads(seen["body"]) == lesson


def test_post_lesson_conflict_raises_with_status():
    with pytest.raises(ApiError) as e:
        api_with(lambda r: httpx.Response(409, json={"error": "x"})).post_lesson({})
    assert e.value.status == 409


def test_put_media_streams_the_file_with_type_and_length(tmp_path):
    audio = tmp_path / "a.mp3"
    audio.write_bytes(b"x" * 200_000)
    seen, handler = recorder(httpx.Response(200, json={"url": "https://media.test/lessons/c1/5.mp3"}))
    url = api_with(handler).put_media("lessons/c1/5.mp3", audio, "audio/mpeg")
    assert url == "https://media.test/lessons/c1/5.mp3"
    assert (seen["method"], seen["path"], seen["auth"]) == ("PUT", "/api/admin/media/lessons/c1/5.mp3", "Bearer tok")
    assert seen["headers"]["content-type"] == "audio/mpeg"
    assert seen["headers"]["content-length"] == "200000"
    assert "transfer-encoding" not in seen["headers"]
    assert seen["body"] == audio.read_bytes()


def test_slot_cancellation_posts_the_body():
    result = {"date": "2026-10-10", "courseIds": ["targhib"], "created": 1}
    seen, handler = recorder(httpx.Response(200, json=result))
    body = {"sourceRef": "tg:971", "slot": "asr", "date": "2026-10-10", "note": "n"}
    assert api_with(handler).slot_cancellation(body) == result
    assert (seen["method"], seen["path"]) == ("POST", "/api/admin/slot-cancellations")
    assert json.loads(seen["body"]) == body


def test_heartbeat_puts_ok_and_summary():
    seen, handler = recorder(httpx.Response(204))
    api_with(handler).heartbeat(False, "0 lessons, 0 cancellations, 0 skipped, 1 failed")
    assert (seen["method"], seen["path"]) == ("PUT", "/api/admin/heartbeat/ingest")
    assert json.loads(seen["body"]) == {"ok": False, "summary": "0 lessons, 0 cancellations, 0 skipped, 1 failed"}
