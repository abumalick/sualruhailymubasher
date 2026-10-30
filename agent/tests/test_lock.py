from albadr_agent.lock import run_lock


def test_second_holder_gets_false_and_release_frees(tmp_path):
    path = tmp_path / "sub" / "run.lock"
    with run_lock(path) as first:
        assert first is True
        with run_lock(path) as second:
            assert second is False
    with run_lock(path) as again:
        assert again is True
