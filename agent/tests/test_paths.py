import json
import os
import subprocess
import sys
from pathlib import Path

from sualruhaily_agent.paths import cache_root


def test_cache_root_defaults_to_the_home_cache(tmp_path):
    assert cache_root({}, home=tmp_path) == tmp_path / ".cache" / "sualruhaily-agent"


def test_cache_root_follows_the_override(tmp_path):
    assert cache_root({"SUALRUHAILY_AGENT_CACHE": str(tmp_path / "wt")}, home=tmp_path) == tmp_path / "wt"


def test_cache_root_ignores_an_empty_override(tmp_path):
    assert cache_root({"SUALRUHAILY_AGENT_CACHE": ""}, home=tmp_path) == tmp_path / ".cache" / "sualruhaily-agent"


PRINT_CACHE_PATHS = """
import json
from sualruhaily_agent import books, cli, lock, transcribe
print(json.dumps([str(p) for p in (transcribe.DEFAULT_AUDIO, transcribe.DEFAULT_TRANSCRIPTS,
    cli.DEFAULT_VERDICTS, books.DEFAULT_CACHE, lock.DEFAULT_LOCK)]))
"""


def test_every_cache_and_the_lock_move_with_the_override(tmp_path):
    env = {**os.environ, "SUALRUHAILY_AGENT_CACHE": str(tmp_path)}
    out = subprocess.run([sys.executable, "-c", PRINT_CACHE_PATHS], env=env, capture_output=True, text=True, check=True)
    paths = [Path(p) for p in json.loads(out.stdout)]
    assert len(paths) == 5
    assert all(p.parent == tmp_path for p in paths), paths
