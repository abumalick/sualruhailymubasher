import httpx
import pytest

from albadr_agent import cli


def env(monkeypatch, tmp_path):
    monkeypatch.setenv("API_BASE", "https://api.test")
    monkeypatch.setenv("ADMIN_TOKEN", "tok")
    monkeypatch.setenv("ALBADR_AGENT_LOCK", str(tmp_path / "run.lock"))


def test_unauthorized_exits_nonzero_and_releases_lock(monkeypatch, tmp_path, caplog):
    env(monkeypatch, tmp_path)
    transport = httpx.MockTransport(lambda r: httpx.Response(401))
    assert cli.main([], transport=transport) == 1
    assert "401" in caplog.text
    from albadr_agent.lock import run_lock

    with run_lock(tmp_path / "run.lock") as ok:
        assert ok


def test_missing_config_exits_nonzero(monkeypatch, tmp_path, caplog):
    monkeypatch.delenv("API_BASE", raising=False)
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    assert cli.main([]) == 1
    assert "ADMIN_TOKEN" in caplog.text


def test_held_lock_exits_zero_immediately(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path)
    from albadr_agent.lock import run_lock

    def boom(r):
        raise AssertionError("must not call server")

    with run_lock(tmp_path / "run.lock"):
        assert cli.main([], transport=httpx.MockTransport(boom)) == 0


def test_no_pending_exits_zero(monkeypatch, tmp_path):
    env(monkeypatch, tmp_path)
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json=[]))
    assert cli.main([], transport=transport) == 0
