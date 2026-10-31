import json

import httpx
import pytest

from albadr_agent.api import Api, ApiError

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
