import hashlib
import json
import re
import subprocess
from pathlib import Path

import httpx

DEFAULT_CACHE = Path.home() / ".cache" / "albadr-agent" / "books"
MIN_ARABIC_LETTERS = 20
ARABIC_LETTER = re.compile(r"[\u0621-\u064A]")


def _page_count(pdf: Path) -> int:
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))


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


def _download(url: str, pdf: Path, fetch) -> None:
    response = fetch(url, follow_redirects=True, timeout=300)
    response.raise_for_status()
    pdf.write_bytes(response.content)


def book_pages(pdf_url: str, cache_dir: Path = DEFAULT_CACHE, fetch=httpx.get) -> list[str]:
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(pdf_url.encode()).hexdigest()
    index, pdf = cache_dir / f"{key}.json", cache_dir / f"{key}.pdf"
    if index.exists():
        return json.loads(index.read_text())
    if not pdf.exists():
        _download(pdf_url, pdf, fetch)
    pages = []
    for n in range(1, _page_count(pdf) + 1):
        text = _page_text(pdf, n)
        if len(ARABIC_LETTER.findall(text)) < MIN_ARABIC_LETTERS:
            text = _ocr_page(pdf, n)
        pages.append(text)
    index.write_text(json.dumps(pages, ensure_ascii=False))
    return pages
