from pathlib import Path

import httpx
from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError
from pydantic.alias_generators import to_camel


class ApiError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class Pending(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    course_id: str
    number: int
    recording_url: str
    start_point: str
    pdf_urls: list[str]
    next_start_point: str | None = None
    start_page: int | None = None
    pdf_index: int | None = None
    prev_number: int | None = None


class Published(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    number: int
    section: str = ""
    label: str = ""
    start_point: str
    end_point: str | None = None
    end_page: int | None = None


class IndexedLesson(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    source_ref: str
    course_id: str
    section: str
    section_number: int
    hijri_date: str | None = None
    recording_url: str | None


class IngestIndex(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    lessons: list[IndexedLesson]
    exception_refs: list[str]


UPLOAD_TIMEOUT = httpx.Timeout(300)
CHUNK = 1 << 16


def _chunks(path: Path):
    with open(path, "rb") as f:
        while chunk := f.read(CHUNK):
            yield chunk


class Api:
    def __init__(self, base: str, token: str, client: httpx.Client | None = None):
        self._base = base.rstrip("/")
        self._client = client or httpx.Client(timeout=30)
        self._headers = {"Authorization": f"Bearer {token}"}

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        url = f"{self._base}{path}"
        try:
            headers = {**self._headers, **kwargs.pop("headers", {})}
            response = self._client.request(method, url, headers=headers, **kwargs)
        except httpx.HTTPError as e:
            raise ApiError(f"{method} {path} failed: {e}") from e
        if not response.is_success:
            raise ApiError(f"{method} {path} returned {response.status_code}", response.status_code)
        return response

    def pending(self) -> list[Pending]:
        response = self._request("GET", "/api/admin/pending-transcriptions")
        try:
            return TypeAdapter(list[Pending]).validate_python(response.json())
        except (ValueError, ValidationError) as e:
            raise ApiError(f"pending-transcriptions returned a malformed body: {e}") from e

    def latest(self) -> dict[str, list[Published]]:
        """Each course's most recent published lessons, as the app sees them."""
        response = self._request("GET", "/api/state")
        try:
            return {
                course["id"]: TypeAdapter(list[Published]).validate_python(course["latest"])
                for course in response.json()["courses"]
            }
        except (ValueError, KeyError, TypeError, ValidationError) as e:
            raise ApiError(f"state returned a malformed body: {e}") from e

    def close(self) -> None:
        self._client.close()

    def patch_lesson(self, course_id: str, number: int, patch: dict) -> None:
        body = {to_camel(key): value for key, value in patch.items()}
        self._request("PATCH", f"/api/admin/lessons/{course_id}/{number}", json=body)

    def ingest_index(self) -> IngestIndex:
        response = self._request("GET", "/api/admin/ingest-index")
        try:
            return IngestIndex.model_validate(response.json())
        except (ValueError, ValidationError) as e:
            raise ApiError(f"ingest-index returned a malformed body: {e}") from e

    def _json(self, response: httpx.Response, what: str) -> dict:
        try:
            body = response.json()
        except ValueError as e:
            raise ApiError(f"{what} returned a malformed body: {e}") from e
        if not isinstance(body, dict):
            raise ApiError(f"{what} returned a malformed body: {body!r}")
        return body

    def post_lesson(self, body: dict) -> dict:
        return self._json(self._request("POST", "/api/admin/lessons", json=body), "POST lessons")

    def put_media(self, key: str, path: Path, content_type: str) -> str:
        response = self._request(
            "PUT",
            f"/api/admin/media/{key}",
            content=_chunks(path),
            headers={"Content-Type": content_type, "Content-Length": str(path.stat().st_size)},
            timeout=UPLOAD_TIMEOUT,
        )
        url = self._json(response, f"PUT media {key}").get("url")
        if not isinstance(url, str):
            raise ApiError(f"PUT media {key} returned no url")
        return url

    def slot_cancellation(self, body: dict) -> dict:
        return self._json(self._request("POST", "/api/admin/slot-cancellations", json=body), "POST slot-cancellations")

    def heartbeat(self, ok: bool, summary: str) -> None:
        self._request("PUT", "/api/admin/heartbeat/ingest", json={"ok": ok, "summary": summary})
