import argparse
import json
import logging
import os
import sys
from pathlib import Path

import httpx

from .api import Api, ApiError
from .books import DEFAULT_CACHE, book_pages
from .locate import accept, build_prompt, candidate_pages, locate
from .lock import DEFAULT_LOCK, run_lock
from .api import Pending
from .transcribe import DEFAULT_AUDIO, DEFAULT_TRANSCRIPTS, Segment, download_audio, transcribe, url_key

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
    loc = sub.add_parser("locate-one", help="locate a lesson in the book from a cached transcript")
    loc.add_argument("--course", required=True)
    loc.add_argument("--number", type=int, required=True)
    loc.add_argument("--transcript", type=Path, required=True)
    loc.add_argument("--pdf-url", action="append", required=True, dest="pdf_urls")
    loc.add_argument("--start-point", required=True)
    loc.add_argument("--previous-end", help="pdf_index:page of the previous lesson's end")
    loc.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
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
    if args.command == "locate-one":
        pending = Pending(
            course_id=args.course, number=args.number, recording_url="",
            start_point=args.start_point, pdf_urls=args.pdf_urls,
        )
        segments = [Segment(**s) for s in json.loads(args.transcript.read_text())]
        pages = [
            (pdf, n, text)
            for pdf, url in enumerate(args.pdf_urls)
            for n, text in enumerate(book_pages(url, args.cache_dir), start=1)
        ]
        previous = tuple(map(int, args.previous_end.split(":"))) if args.previous_end else None
        candidates = candidate_pages(pending, pages, previous)
        log.info("candidates: %s", [(pdf, n) for pdf, n, _ in candidates])
        found = locate(build_prompt(pending, segments, candidates)) if candidates else None
        if found is None:
            log.error("no usable result")
            return 1
        log.info("result: %s accepted=%s", found.model_dump_json(), accept(found, candidates))
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
