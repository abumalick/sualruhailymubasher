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


class Api:
    def __init__(self, base: str, token: str, client: httpx.Client | None = None):
        self._base = base.rstrip("/")
        self._client = client or httpx.Client(timeout=30)
        self._headers = {"Authorization": f"Bearer {token}"}

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        url = f"{self._base}{path}"
        try:
            response = self._client.request(method, url, headers=self._headers, **kwargs)
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

    def close(self) -> None:
        self._client.close()

    def patch_lesson(self, course_id: str, number: int, patch: dict) -> None:
        body = {to_camel(key): value for key, value in patch.items()}
        self._request("PATCH", f"/api/admin/lessons/{course_id}/{number}", json=body)
