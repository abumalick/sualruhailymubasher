import os
from collections.abc import Mapping
from pathlib import Path


def cache_root(environ: Mapping[str, str] = os.environ, home: Path | None = None) -> Path:
    """Where the agent keeps audio, transcripts, verdicts, books and its run lock.

    SUALRUHAILY_AGENT_CACHE moves all of it, so a run from a development worktree never
    shares a cache with the production agent (which reuses cached verdicts).
    """
    override = environ.get("SUALRUHAILY_AGENT_CACHE")
    if override:
        return Path(override)
    return (home or Path.home()) / ".cache" / "sualruhaily-agent"


CACHE_ROOT = cache_root()
