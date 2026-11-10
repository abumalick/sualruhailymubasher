import hashlib
import json
import logging
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from .paths import CACHE_ROOT

log = logging.getLogger("albadr_agent")
DEFAULT_CACHE = CACHE_ROOT / "books"
MIN_ARABIC_LETTERS = 20
ARABIC_LETTER = re.compile(r"[\u0621-\u064A]")
WORKERS = 4


def _page_count(pdf: Path) -> int:
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    match = re.search(r"^Pages:\s+(\d+)", info, re.M)
    if not match:
        raise ValueError(f"pdfinfo reported no page count for {pdf}")
    return int(match.group(1))


def _page_text(pdf: Path, page: int) -> str:
    return subprocess.run(
        ["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
        capture_output=True, text=True, check=True,
    ).stdout


def _ocr_page(pdf: Path, page: int) -> str:
    image = subprocess.run(
        ["pdftoppm", "-r", "200", "-png", "-f", str(page), "-l", str(page), str(pdf)],
        capture_output=True, check=True,
    ).stdout
    return subprocess.run(
        ["tesseract", "-", "-", "-l", "ara"], input=image, capture_output=True, check=True
    ).stdout.decode()


def _write_atomic(path: Path, data: bytes) -> None:
    temp = path.with_name(path.name + ".part")
    temp.write_bytes(data)
    temp.replace(path)


def _download(url: str, pdf: Path, fetch) -> None:
    response = fetch(url, follow_redirects=True, timeout=300)
    response.raise_for_status()
    _write_atomic(pdf, response.content)


def _extract(pdf: Path, n: int, saved: Path) -> str:
    page = saved / f"{n}.txt"
    if page.exists():
        return page.read_text()
    text = _page_text(pdf, n)
    if len(ARABIC_LETTER.findall(text)) < MIN_ARABIC_LETTERS:
        text = _ocr_page(pdf, n)
    _write_atomic(page, text.encode())
    return text


def book_pages(pdf_url: str, cache_dir: Path = DEFAULT_CACHE, fetch=httpx.get) -> list[str]:
    """Per-page text of a book, from a URL or a local file path; pages are saved as they are
    extracted so an interrupted OCR of a large scanned book resumes where it stopped."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(pdf_url.encode()).hexdigest()
    index, saved = cache_dir / f"{key}.json", cache_dir / f"{key}.pages"
    if index.exists():
        try:
            return json.loads(index.read_text())
        except ValueError:
            log.warning("corrupt book index %s, rebuilding", index)
    if "://" in pdf_url:
        pdf = cache_dir / f"{key}.pdf"
        try:
            count = _page_count(pdf) if pdf.exists() else None
        except (subprocess.CalledProcessError, ValueError):
            log.warning("corrupt cached PDF %s, downloading again", pdf)
            count = None
        if count is None:
            _download(pdf_url, pdf, fetch)
            count = _page_count(pdf)
    else:
        pdf = Path(pdf_url)
        count = _page_count(pdf)
    saved.mkdir(exist_ok=True)
    pages = []
    with ThreadPoolExecutor(WORKERS) as pool:
        for n, text in enumerate(pool.map(lambda n: _extract(pdf, n, saved), range(1, count + 1)), start=1):
            pages.append(text)
            if n % 50 == 0:
                log.info("indexed %d/%d pages of %s", n, count, pdf_url)
    _write_atomic(index, json.dumps(pages, ensure_ascii=False).encode())
    shutil.rmtree(saved)
    return pages
