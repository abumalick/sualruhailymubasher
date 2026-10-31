import argparse
import logging
import os
import sys
from pathlib import Path

import httpx

from .api import Api, ApiError
from .books import DEFAULT_CACHE, book_pages
from .lock import DEFAULT_LOCK, run_lock
from .transcribe import DEFAULT_AUDIO, DEFAULT_TRANSCRIPTS, download_audio, transcribe, url_key

log = logging.getLogger("albadr_agent")


def main(argv: list[str] | None = None, transport: httpx.BaseTransport | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="albadr-agent")
    sub = parser.add_subparsers(dest="command")
    index = sub.add_parser("index-book", help="build the per-page text index of a book PDF")
    index.add_argument("url")
    index.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    one = sub.add_parser("transcribe-one", help="download and transcribe one lesson recording")
    one.add_argument("url")
    one.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO)
    one.add_argument("--transcripts-dir", type=Path, default=DEFAULT_TRANSCRIPTS)
    args = parser.parse_args(argv)
    if args.command == "index-book":
        pages = book_pages(args.url, args.cache_dir)
        log.info("indexed %d page(s) into %s", len(pages), args.cache_dir)
        return 0
    if args.command == "transcribe-one":
        mp3 = download_audio(args.url, args.audio_dir)
        out = args.transcripts_dir / f"{url_key(args.url)}.json"
        segments = transcribe(mp3, out)
        log.info("%d segment(s) written to %s", len(segments), out)
        return 0
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
