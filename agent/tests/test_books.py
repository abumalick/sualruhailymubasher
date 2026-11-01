import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import httpx
import pytest
from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFont, features

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


def has_arabic_ocr() -> bool:
    if not shutil.which("tesseract") or FONT is None or not features.check("raqm"):
        return False
    langs = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True).stdout
    return "ara" in langs.split()


@pytest.mark.skipif(not has_arabic_ocr(), reason="needs tesseract with ara, raqm and an Arabic font")
def test_real_ocr_on_image_only_pdf(tmp_path):
    image = Image.new("RGB", (1600, 400), "white")
    font = ImageFont.truetype(str(FONT), 90)
    ImageDraw.Draw(image).text((1550, 100), FIRST, font=font, fill="black", anchor="ra", direction="rtl")
    png = tmp_path / "scan.png"
    image.save(png)
    pdf = FPDF()
    pdf.add_page()
    pdf.image(str(png), x=5, y=10, w=200)
    path = tmp_path / "scan.pdf"
    path.write_bytes(bytes(pdf.output()))
    text = books._ocr_page(path, 1)
    assert len(re.findall(r"[\u0621-\u064A]", text)) >= 10


@needs_font
def test_corrupt_index_is_rebuilt(tmp_path):
    fetcher = Fetcher(b"")
    key = hashlib.sha1(URL.encode()).hexdigest()
    (tmp_path / f"{key}.json").write_text('["trunc')
    (tmp_path / f"{key}.pdf").write_bytes(text_pdf())
    pages = books.book_pages(URL, tmp_path, fetch=fetcher)
    assert len(pages) == 2
    assert json.loads((tmp_path / f"{key}.json").read_text()) == pages
    assert fetcher.calls == 0


@needs_font
def test_corrupt_pdf_is_downloaded_again(tmp_path):
    fetcher = Fetcher(text_pdf())
    key = hashlib.sha1(URL.encode()).hexdigest()
    (tmp_path / f"{key}.pdf").write_bytes(b"%PDF-1.4 truncated")
    assert len(books.book_pages(URL, tmp_path, fetch=fetcher)) == 2
    assert fetcher.calls == 1
    assert not list(tmp_path.glob("*.part"))


def test_missing_page_count_is_a_clear_error(tmp_path, monkeypatch):
    monkeypatch.setattr(
        books.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0, stdout="Title: x\n")
    )
    with pytest.raises(ValueError, match="no page count"):
        books._page_count(tmp_path / "a.pdf")


@needs_font
def test_local_path_is_read_in_place(tmp_path):
    book = tmp_path / "book.pdf"
    book.write_bytes(text_pdf())
    pages = books.book_pages(str(book), tmp_path / "cache", fetch=lambda *a, **k: pytest.fail("downloaded"))
    assert len(pages) == 2
    assert book.exists() and not list((tmp_path / "cache").glob("*.pdf"))


def test_indexing_resumes_from_saved_pages(tmp_path, monkeypatch):
    monkeypatch.setattr(books, "_page_count", lambda pdf: 3)
    monkeypatch.setattr(books, "_page_text", lambda pdf, n: "")
    seen = []
    monkeypatch.setattr(books, "_ocr_page", lambda pdf, n: seen.append(n) or f"صفحة {n}")
    key = hashlib.sha1(URL.encode()).hexdigest()
    (tmp_path / f"{key}.pdf").write_bytes(b"%PDF")
    saved = tmp_path / f"{key}.pages"
    saved.mkdir()
    (saved / "1.txt").write_text("صفحة 1")
    (saved / "2.txt").write_text("صفحة 2")
    assert books.book_pages(URL, tmp_path, fetch=Fetcher(b"")) == ["صفحة 1", "صفحة 2", "صفحة 3"]
    assert seen == [3]
    assert not saved.exists()
