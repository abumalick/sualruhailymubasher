import logging
import os
import sys
from pathlib import Path

import httpx

from .api import Api, ApiError
from .lock import DEFAULT_LOCK, run_lock

log = logging.getLogger("albadr_agent")


def main(argv: list[str] | None = None, transport: httpx.BaseTransport | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    base, token = os.environ.get("API_BASE"), os.environ.get("ADMIN_TOKEN")
    if not base or not token:
        log.error("API_BASE and ADMIN_TOKEN must be set (see ~/.config/albadr-lessons/agent.env)")
        return 1
    lock_path = Path(os.environ.get("ALBADR_AGENT_LOCK", DEFAULT_LOCK))
    with run_lock(lock_path) as acquired:
        if not acquired:
            log.info("another run holds the lock, exiting")
            return 0
        api = Api(base, token, httpx.Client(transport=transport, timeout=30))
        try:
            pending = api.pending()
        except ApiError as e:
            log.error("server error: %s", e)
            return 1
        log.info("%d pending lesson(s)", len(pending))
        return 0


if __name__ == "__main__":
    sys.exit(main())
