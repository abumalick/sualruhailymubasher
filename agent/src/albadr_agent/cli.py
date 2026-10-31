import argparse
import json
import logging
import os
import sys
from pathlib import Path

import httpx

from .api import Api, ApiError, Pending
from .books import DEFAULT_CACHE, book_pages
from .locate import (
    MAX_END_POINT, MIN_CONFIDENCE, NEXT_MATCH, WINDOW_SIZE, Page, accept, build_prompt, candidate_pages,
    find_page, locate, match_score, page_position,
)
from .lock import DEFAULT_LOCK, run_lock
from .transcribe import DEFAULT_AUDIO, DEFAULT_TRANSCRIPTS, Segment, download_audio, transcribe, url_key

log = logging.getLogger("albadr_agent")


EXTRA_WINDOW = 12


def _book(lesson: Pending) -> list[Page]:
    return [
        (pdf, n, text)
        for pdf, url in enumerate(lesson.pdf_urls)
        for n, text in enumerate(book_pages(url), start=1)
    ]


def _own_start(lesson: Pending, pages: list[Page]) -> tuple[int, int] | None:
    if lesson.start_page is None or lesson.pdf_index is None:
        return None
    key = (lesson.pdf_index, lesson.start_page)
    return key if page_position(pages, key) is not None else None


End = tuple[int, int]


def _patch_from_next_start(api: Api, lesson: Pending, name: str) -> End | None:
    pages = _book(lesson)
    own = _own_start(lesson, pages)
    start = page_position(pages, own) if own else find_page(lesson.start_point, pages)
    if start is None:
        log.warning("%s: start point not found in the book, skipping", name)
        return
    # later pages that only cite the next start point (or the table of contents) can outscore the real page,
    # so stay near the start and demand a near-complete match
    span = pages[start : start + WINDOW_SIZE + EXTRA_WINDOW]
    end = find_page(lesson.next_start_point, pages, start, len(span), NEXT_MATCH)
    if end is None:
        best = max((match_score(lesson.next_start_point, text), pdf, n) for pdf, n, text in span)
        log.warning("%s: next start point not found in the book after the start (best %.2f at %d:%d), skipping",
                    name, *best)
        return
    (start_pdf, start_page, _), (end_pdf, end_page, _) = pages[start], pages[end]
    api.patch_lesson(lesson.course_id, lesson.number, {
        "end_point": lesson.next_start_point[:MAX_END_POINT],
        "end_page": end_page,
        "end_pdf_index": end_pdf,
        "start_page": start_page,
        "pdf_index": start_pdf,
    })
    log.info("%s: patched pages %d:%d-%d:%d from the next lesson's start point (match %.2f)",
             name, start_pdf, start_page, end_pdf, end_page, match_score(lesson.next_start_point, pages[end][2]))
    return end_pdf, end_page


def _patch_from_recording(api: Api, lesson: Pending, name: str) -> End | None:
    mp3 = download_audio(lesson.recording_url)
    segments = transcribe(mp3, DEFAULT_TRANSCRIPTS / f"{url_key(lesson.recording_url)}.json")
    pages = _book(lesson)
    own = _own_start(lesson, pages)
    candidates = candidate_pages(lesson, pages, own)
    if not candidates:
        log.warning("%s: start point not found in the book, skipping", name)
        return
    found = locate(build_prompt(lesson, segments, candidates))
    if (
        found is not None
        and found.confidence < MIN_CONFIDENCE
        and (found.end_pdf_index, found.end_page) == candidates[-1][:2]
    ):
        log.info("%s: low confidence at the window edge, retrying with %d more pages", name, EXTRA_WINDOW)
        candidates = candidate_pages(lesson, pages, own, WINDOW_SIZE + EXTRA_WINDOW)
        found = locate(build_prompt(lesson, segments, candidates))
    if found is None:
        log.warning("%s: no usable answer from claude, skipping", name)
        return
    if not accept(found, candidates):
        log.warning("%s: result rejected: %s", name, found.model_dump_json())
        return
    api.patch_lesson(lesson.course_id, lesson.number, {
        "start_page": found.start_page,
        "pdf_index": found.pdf_index,
        "end_page": found.end_page,
        "end_pdf_index": found.end_pdf_index,
        "end_point": found.end_point,
    })
    mp3.unlink(missing_ok=True)
    log.info("%s: patched pages %d-%d", name, found.start_page, found.end_page)
    return found.end_pdf_index, found.end_page


def process_lesson(api: Api, lesson: Pending) -> End | None:
    name = f"{lesson.course_id} #{lesson.number}"
    if not lesson.pdf_urls:
        log.info("%s: no book PDF for this course yet, skipping", name)
        return
    try:
        if lesson.next_start_point:
            return _patch_from_next_start(api, lesson, name)
        return _patch_from_recording(api, lesson, name)
    except Exception as e:
        if isinstance(e, ApiError) and e.status in (401, 403):
            raise
        log.exception("%s: failed, continuing with the next lesson", name)


def main(argv: list[str] | None = None, transport: httpx.BaseTransport | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="albadr-agent")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("run", help="process every pending lesson")
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
    if args.command != "run":
        parser.print_help()
        return 2
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
            log.info("%d pending lesson(s)", len(pending))
            previous: tuple[str, int, End] | None = None
            for lesson in pending:
                if previous and previous[:2] == (lesson.course_id, lesson.number - 1) and lesson.start_page is None:
                    lesson.pdf_index, lesson.start_page = previous[2]
                end = process_lesson(api, lesson)
                previous = (lesson.course_id, lesson.number, end) if end else None
        except ApiError as e:
            log.error("server error: %s", e)
            return 1
        finally:
            api.close()
        return 0


if __name__ == "__main__":
    sys.exit(main())
