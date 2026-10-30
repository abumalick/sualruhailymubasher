import json
import re
from pathlib import Path

import httpx
import pytest
from fpdf import FPDF
from PIL import Image, ImageDraw

from albadr_agent import books

URL = "https://example.test/book.pdf"


FONT = next(iter(Path("/usr/share/fonts/truetype").rglob("NotoNaskhArabic-Regular.ttf")), None)
needs_font = pytest.mark.skipif(FONT is None, reason="no Arabic font installed")
FIRST = "الحمد لله رب العالمين والصلاة والسلام"
SECOND = "على نبينا محمد وعلى آله وصحبه أجمعين"


def text_pdf() -> bytes:
    pdf = FPDF()
    pdf.add_font("arabic", fname=str(FONT))
    pdf.set_font("arabic", size=14)
    for text in (FIRST, SECOND):
        pdf.add_page()
        pdf.cell(text=text)
    return bytes(pdf.output())


def image_only_pdf(tmp_path: Path) -> bytes:
    image = Image.new("RGB", (800, 400), "white")
    ImageDraw.Draw(image).rectangle((100, 100, 700, 300), fill="black")
    path = tmp_path / "scan.png"
    image.save(path)
    pdf = FPDF()
    pdf.add_page()
    pdf.image(str(path), x=10, y=10, w=180)
    return bytes(pdf.output())


class Fetcher:
    def __init__(self, content: bytes):
        self.content = content
        self.calls = 0

    def __call__(self, url, **kwargs):
        self.calls += 1
        return httpx.Response(200, content=self.content, request=httpx.Request("GET", url))


@needs_font
def test_text_pdf_pages(tmp_path):
    pages = books.book_pages(URL, tmp_path, fetch=Fetcher(text_pdf()))
    assert len(pages) == 2
    assert all(len(re.findall(r"[\u0621-\u064A]", page)) >= 20 for page in pages)
    assert pages[0] != pages[1]


def test_image_only_page_goes_through_ocr(tmp_path, monkeypatch):
    seen = []
    monkeypatch.setattr(books, "_ocr_page", lambda pdf, n: seen.append((pdf.suffix, n)) or "«بسم الله»")
    pages = books.book_pages(URL, tmp_path, fetch=Fetcher(image_only_pdf(tmp_path)))
    assert pages == ["«بسم الله»"]
    assert seen == [(".pdf", 1)]


@needs_font
def test_text_pages_are_not_ocrd(tmp_path, monkeypatch):
    monkeypatch.setattr(books, "_ocr_page", lambda pdf, n: pytest.fail("OCR called"))
    books.book_pages(URL, tmp_path, fetch=Fetcher(text_pdf()))


@needs_font
def test_second_call_uses_cache(tmp_path):
    fetcher = Fetcher(text_pdf())
    first = books.book_pages(URL, tmp_path, fetch=fetcher)
    second = books.book_pages(URL, tmp_path, fetch=fetcher)
    assert second == first
    assert fetcher.calls == 1
    assert json.loads(next(tmp_path.glob("*.json")).read_text()) == first


@needs_font
def test_reindex_reuses_downloaded_pdf(tmp_path):
    fetcher = Fetcher(text_pdf())
    books.book_pages(URL, tmp_path, fetch=fetcher)
    next(tmp_path.glob("*.json")).unlink()
    books.book_pages(URL, tmp_path, fetch=fetcher)
    assert fetcher.calls == 1


def test_download_failure_raises(tmp_path):
    def fetch(url, **kwargs):
        return httpx.Response(404, request=httpx.Request("GET", url))

    with pytest.raises(httpx.HTTPStatusError):
        books.book_pages(URL, tmp_path, fetch=fetch)


def test_garbled_text_layer_goes_through_ocr(tmp_path, monkeypatch):
    monkeypatch.setattr(books, "_page_count", lambda pdf: 1)
    monkeypatch.setattr(books, "_page_text", lambda pdf, n: "K ðK—Nz¿q vKrz»K ¼LN T K K " * 5)
    monkeypatch.setattr(books, "_ocr_page", lambda pdf, n: "شرح كتاب التوحيد")
    assert books.book_pages(URL, tmp_path, fetch=Fetcher(b"%PDF")) == ["شرح كتاب التوحيد"]
