import json
from pathlib import Path

import httpx
import pytest

from sualruhaily_agent import cli
from sualruhaily_agent.captions import Message
from sualruhaily_agent.telegram import TelegramBusy

FIXTURE = Path(__file__).parent / "fixtures" / "telegram-1448.json"


def env(monkeypatch, tmp_path):
    monkeypatch.setenv("API_BASE", "https://api.test")
    monkeypatch.setenv("ADMIN_TOKEN", "tok")
    monkeypatch.setenv("SUALRUHAILY_AGENT_LOCK", str(tmp_path / "run.lock"))


def test_unauthorized_exits_nonzero_and_releases_lock(monkeypatch, tmp_path, caplog):
    env(monkeypatch, tmp_path)
    transport = httpx.MockTransport(lambda r: httpx.Response(401))
    assert cli.main(["run"], transport=transport) == 1
    assert "401" in caplog.text
    from sualruhaily_agent.lock import run_lock

    with run_lock(tmp_path / "run.lock") as ok:
        assert ok


def test_missing_config_exits_nonzero(monkeypatch, tmp_path, caplog):
    monkeypatch.delenv("API_BASE", raising=False)
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    assert cli.main(["run"]) == 1
    assert "ADMIN_TOKEN" in caplog.text


def test_held_lock_exits_zero_immediately(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path)
    from sualruhaily_agent.lock import run_lock

    def boom(r):
        raise AssertionError("must not call server")

    with run_lock(tmp_path / "run.lock"):
        assert cli.main(["run"], transport=httpx.MockTransport(boom)) == 0


def test_no_pending_exits_zero(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path)
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json=[]))
    assert cli.main(["run"], transport=transport) == 0


def test_index_book_command(tmp_path, monkeypatch, caplog):
    caplog.set_level("INFO")
    monkeypatch.delenv("API_BASE", raising=False)
    monkeypatch.setattr("sualruhaily_agent.cli.book_pages", lambda url, cache_dir: ["a", "b"])
    assert cli.main(["index-book", "https://x.test/b.pdf", "--cache-dir", str(tmp_path)]) == 0
    assert "indexed 2 page(s)" in caplog.text


class FakeTelegram:
    busy = False
    closed = 0

    def __init__(self, *args, **kwargs):
        pass

    def close(self):
        FakeTelegram.closed += 1

    def export(self, from_id):
        if self.busy:
            raise TelegramBusy("Telegram asked to wait 30s")
        rows = json.loads(FIXTURE.read_text(encoding="utf-8"))["messages"]
        return [Message(m["id"], m["date"], m["file"], m["text"]) for m in rows if m["id"] in (971, 1111, 1112)]

    def download(self, msg_id, dest):
        path = dest / f"{msg_id}.mp3"
        path.write_bytes(b"audio")
        return path


def ingest_server(seen):
    def handler(request):
        seen.append((request.method, request.url.path, request.read()))
        path = request.url.path
        if path == "/api/admin/ingest-index":
            return httpx.Response(200, json={"lessons": [], "exceptionRefs": []})
        if path.startswith("/api/admin/media/"):
            return httpx.Response(200, json={"url": "https://media.test" + path})
        if path == "/api/admin/lessons":
            return httpx.Response(200, json={"number": 1, "created": True, "dateFlag": False, "pushed": False})
        if path == "/api/admin/slot-cancellations":
            return httpx.Response(200, json={"date": "2026-10-10", "courseIds": ["targhib"], "created": 1})
        return httpx.Response(204)

    return httpx.MockTransport(handler)


def ingest_env(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path)
    monkeypatch.setenv("SUALRUHAILY_AGENT_CACHE", str(tmp_path / "cache"))
    monkeypatch.setattr(cli, "Telegram", FakeTelegram)


def test_no_notify_flag_reaches_every_lesson_post(monkeypatch, tmp_path):
    ingest_env(monkeypatch, tmp_path)
    state = tmp_path / "cache" / "ingest" / "state.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"last_id": 900}))
    seen = []
    assert cli.main(["ingest", "--no-notify"], transport=ingest_server(seen)) == 0
    posts = [json.loads(body) for method, path, body in seen if path == "/api/admin/lessons"]
    assert len(posts) == 2 and all(p["notify"] is False for p in posts)
    assert (tmp_path / "cache" / "ingest" / "state.json").exists()
    assert ("PUT", "/api/admin/heartbeat/ingest") in [(m, p) for m, p, _ in seen]


def test_ingest_closes_the_telegram_connection(monkeypatch, tmp_path):
    ingest_env(monkeypatch, tmp_path)
    before = FakeTelegram.closed
    assert cli.main(["ingest", "--dry-run"], transport=ingest_server([])) == 0
    assert FakeTelegram.closed == before + 1


def test_ingest_without_telegram_settings_exits_nonzero(monkeypatch, tmp_path, caplog):
    env(monkeypatch, tmp_path)
    monkeypatch.setenv("SUALRUHAILY_AGENT_CACHE", str(tmp_path / "cache"))
    monkeypatch.delenv("TELEGRAM_API_ID", raising=False)
    monkeypatch.delenv("TELEGRAM_API_HASH", raising=False)
    assert cli.main(["ingest"], transport=ingest_server([])) == 1
    assert "TELEGRAM_API_ID" in caplog.text


def test_dry_run_prints_the_plan_and_writes_nothing(monkeypatch, tmp_path, capsys):
    ingest_env(monkeypatch, tmp_path)
    seen = []
    assert cli.main(["ingest", "--dry-run", "--from-id", "900"], transport=ingest_server(seen)) == 0
    assert [(m, p) for m, p, _ in seen] == [("GET", "/api/admin/ingest-index")]
    out = capsys.readouterr().out
    assert "tg:1112" in out and "tg:971" in out
    assert not (tmp_path / "cache" / "ingest" / "state.json").exists()


def test_telegram_busy_skips_tick(monkeypatch, tmp_path, caplog):
    caplog.set_level("INFO")
    ingest_env(monkeypatch, tmp_path)
    monkeypatch.setattr(FakeTelegram, "busy", True)
    seen = []
    assert cli.main(["ingest"], transport=ingest_server(seen)) == 0
    assert "/api/admin/heartbeat/ingest" not in [p for _, p, _ in seen]
    assert "busy" in caplog.text


def test_held_ingest_lock_exits_zero(monkeypatch, tmp_path, caplog):
    caplog.set_level("INFO")
    ingest_env(monkeypatch, tmp_path)
    from sualruhaily_agent.lock import run_lock

    def boom(r):
        raise AssertionError("must not call server")

    with run_lock(tmp_path / "cache" / "ingest.lock"):
        assert cli.main(["ingest"], transport=httpx.MockTransport(boom)) == 0
    assert "lock" in caplog.text


def test_ingest_auth_failure_exits_nonzero(monkeypatch, tmp_path):
    ingest_env(monkeypatch, tmp_path)
    assert cli.main(["ingest"], transport=httpx.MockTransport(lambda r: httpx.Response(401))) == 1


def test_retry_failed_flag_clears_recorded_failures(monkeypatch, tmp_path):
    ingest_env(monkeypatch, tmp_path)
    state = tmp_path / "cache" / "ingest" / "state.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"last_id": 900, "failed": {"tg:1112": "http-413"}}))
    seen = []
    assert cli.main(["ingest", "--retry-failed"], transport=ingest_server(seen)) == 0
    posts = [json.loads(body)["sourceRef"] for method, path, body in seen if path == "/api/admin/lessons"]
    assert "tg:1112" in posts
    assert json.loads(state.read_text())["failed"] == {}


def test_crash_sends_a_failed_heartbeat_and_exits_nonzero(monkeypatch, tmp_path, caplog):
    ingest_env(monkeypatch, tmp_path)

    def boom(*args, **kwargs):
        raise RuntimeError("planner bug")

    monkeypatch.setattr(cli, "run_ingest", boom)
    seen = []
    assert cli.main(["ingest"], transport=ingest_server(seen)) == 1
    [(method, path, body)] = seen
    assert (method, path) == ("PUT", "/api/admin/heartbeat/ingest")
    assert json.loads(body) == {"ok": False, "summary": "crashed: RuntimeError"}
    assert "planner bug" in caplog.text


def test_crash_heartbeat_failure_is_ignored(monkeypatch, tmp_path):
    ingest_env(monkeypatch, tmp_path)

    def boom(*args, **kwargs):
        raise RuntimeError("planner bug")

    monkeypatch.setattr(cli, "run_ingest", boom)
    assert cli.main(["ingest"], transport=httpx.MockTransport(lambda r: httpx.Response(500))) == 1
