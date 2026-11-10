import argparse
import hashlib
import json
import logging
import os
import sys
from pathlib import Path

import httpx

from .api import Api, ApiError, Pending
from .books import DEFAULT_CACHE, book_pages
from .locate import (
    MIN_CONFIDENCE, NEXT_MATCH, WINDOW_SIZE, ClaudeUnavailable, LocateResult, Page, accept,
    build_prompt, candidate_pages, find_page, locate, match_score, page_position,
)
from .lock import DEFAULT_LOCK, run_lock
from .endpoints import corrections, recorded_end_point
from .transcribe import CACHE_ROOT, DEFAULT_AUDIO, DEFAULT_TRANSCRIPTS, Segment, download_audio, transcribe, url_key

log = logging.getLogger("albadr_agent")


EXTRA_WINDOW = 12
DEFAULT_VERDICTS = CACHE_ROOT / "verdicts"
VERDICT_SCHEMA = 3


def _local_books() -> dict[str, list[str]]:
    """ALBADR_LOCAL_BOOKS="course-id=/a.pdf,/b.pdf;other=/c.pdf": books the agent may read but the app must not link."""
    books = {}
    for entry in filter(None, os.environ.get("ALBADR_LOCAL_BOOKS", "").split(";")):
        course, _, paths = entry.partition("=")
        books[course.strip()] = [p.strip() for p in paths.split(",") if p.strip()]
    return books


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
    if own is None:
        log.info("%s: no known start page, using the recording", name)
        return None
    start = page_position(pages, own)
    # later pages that only cite the next start point (or the table of contents) can outscore the real page,
    # so stay near the start and demand a near-complete match
    span = pages[start : start + WINDOW_SIZE + EXTRA_WINDOW]
    end = find_page(lesson.next_start_point, pages, start, len(span), NEXT_MATCH)
    if end is None:
        best = max((match_score(lesson.next_start_point, text), pdf, n) for pdf, n, text in span)
        log.warning("%s: next start point not found in the book after the start (best %.2f at %d:%d), "
                    "falling back to the recording", name, *best)
        return None
    (start_pdf, start_page, start_text), (end_pdf, end_page, end_text) = pages[start], pages[end]
    api.patch_lesson(lesson.course_id, lesson.number, {
        "end_point": lesson.next_start_point,
        "end_page": end_page,
        "end_pdf_index": end_pdf,
        "start_page": start_page,
        "pdf_index": start_pdf,
    })
    log.info("%s: patched pages %d:%d-%d:%d from the next lesson's start point (start match %.2f, end match %.2f)",
             name, start_pdf, start_page, end_pdf, end_page,
             match_score(lesson.start_point, start_text), match_score(lesson.next_start_point, end_text))
    return end_pdf, end_page


def _verdict_path(lesson: Pending, segments: list[Segment], candidates: list[Page]) -> Path:
    transcript = json.dumps([s.model_dump() for s in segments], ensure_ascii=False)
    inputs = json.dumps([
        VERDICT_SCHEMA, lesson.course_id, lesson.number, lesson.start_point, hashlib.sha256(transcript.encode()).hexdigest(),
        [(pdf, n) for pdf, n, _ in candidates], lesson.next_start_point,
    ], ensure_ascii=False)
    return DEFAULT_VERDICTS / f"{hashlib.sha256(inputs.encode()).hexdigest()}.json"


def _ask(lesson: Pending, segments: list[Segment], candidates: list[Page], name: str) -> LocateResult | None:
    path = _verdict_path(lesson, segments, candidates)
    try:
        cached = json.loads(path.read_text())
        log.info("%s: using the cached claude verdict (inputs unchanged)", name)
        return LocateResult.model_validate(cached) if cached else None
    except (OSError, ValueError):
        pass
    found = locate(build_prompt(lesson, segments, candidates))
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    tmp.write_text(found.model_dump_json() if found else "null")
    tmp.replace(path)
    return found


def _patch_from_recording(api: Api, lesson: Pending, name: str) -> End | None:
    mp3 = download_audio(lesson.recording_url)
    segments = transcribe(mp3, DEFAULT_TRANSCRIPTS / f"{url_key(lesson.recording_url)}.json")
    pages = _book(lesson)
    own = _own_start(lesson, pages)
    candidates = candidate_pages(lesson, pages, own)
    if not candidates:
        log.warning("%s: start point not found in the book, skipping", name)
        return None
    found = _ask(lesson, segments, candidates, name)
    if (
        found is not None
        and found.confidence < MIN_CONFIDENCE
        and (found.end_pdf_index, found.end_page) == candidates[-1][:2]
    ):
        log.info("%s: low confidence at the window edge, retrying with %d more pages", name, EXTRA_WINDOW)
        candidates = candidate_pages(lesson, pages, own, WINDOW_SIZE + EXTRA_WINDOW)
        found = _ask(lesson, segments, candidates, name)
    if found is None:
        log.warning("%s: no usable answer from claude, skipping", name)
        return None
    if not accept(found, candidates):
        log.warning("%s: result rejected: %s", name, found.model_dump_json())
        return None
    patch = {} if own else {"start_page": found.start_page, "pdf_index": found.pdf_index}
    end_point, problem = recorded_end_point(lesson.start_point, lesson.next_start_point, found)
    if problem:
        log.warning("%s: %s, leaving the end point unset", name, problem)
    patch |= {"end_page": found.end_page, "end_pdf_index": found.end_pdf_index}
    if end_point:
        patch["end_point"] = end_point
    api.patch_lesson(lesson.course_id, lesson.number, patch)
    mp3.unlink(missing_ok=True)
    log.info("%s: patched pages %d-%d", name, own[1] if own else found.start_page, found.end_page)
    return found.end_pdf_index, found.end_page


def correct_end_points(api: Api) -> None:
    """Once the next Tafsir lesson is published, its start point replaces whatever was predicted. Best effort:
    the next run tries again, so only an auth failure stops the run."""
    try:
        for course_id, latest in api.latest().items():
            for number, end_point in corrections(latest):
                api.patch_lesson(course_id, number, {"end_point": end_point})
                log.info("%s #%d: end point set to the next lesson's published start", course_id, number)
    except ApiError as e:
        if e.status in (401, 403):
            raise
        log.warning("could not correct end points from the published lessons: %s", e)


def process_lesson(api: Api, lesson: Pending) -> End | None:
    name = f"{lesson.course_id} #{lesson.number}"
    if not lesson.pdf_urls:
        log.info("%s: no book PDF for this course yet, skipping", name)
        return None
    try:
        if lesson.next_start_point:
            end = _patch_from_next_start(api, lesson, name)
            if end:
                return end
        return _patch_from_recording(api, lesson, name)
    except ClaudeUnavailable:
        raise
    except Exception as e:
        if isinstance(e, ApiError) and e.status in (401, 403):
            raise
        log.exception("%s: failed, continuing with the next lesson", name)
        return None


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
            claude_down = False
            local = _local_books()
            for lesson in pending:
                if not lesson.pdf_urls:
                    lesson.pdf_urls = local.get(lesson.course_id, [])
                if previous and previous[:2] == (lesson.course_id, lesson.number - 1) and lesson.start_page is None:
                    lesson.pdf_index, lesson.start_page = previous[2]
                try:
                    end = process_lesson(api, lesson)
                except ClaudeUnavailable as e:
                    log.error("%s #%d: claude CLI unavailable: %s", lesson.course_id, lesson.number, e)
                    claude_down, end = True, None
                previous = (lesson.course_id, lesson.number, end) if end else None
            correct_end_points(api)
        except ApiError as e:
            log.error("server error: %s", e)
            return 1
        finally:
            api.close()
        return 1 if claude_down else 0


if __name__ == "__main__":
    sys.exit(main())
