import html as htmllib
import re
from contextlib import nullcontext
from dataclasses import dataclass
from pathlib import Path

import httpx

from sualruhaily_agent.captions import DIGITS, valid_hijri_year

TITLE = re.compile(r"<title>(.*?)</title>", re.DOTALL)
TITLE_PARTS = re.compile(r"^\s*\((\d+)\)\s*(.*?)\s*(\d{4})/(\d+)/(\d+)\s*هـ")
MP3_URL = re.compile(r"https://sualruhaily\.com/upload/[^\"'<>]*?\.mp3(?=[\"'])")
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
TIMEOUT = httpx.Timeout(60)


class SitePageError(Exception):
    pass


@dataclass(frozen=True)
class SitePage:
    number: int
    start_point: str
    hijri_date: str
    mp3_url: str


def parse_play_page(html: str) -> SitePage:
    title = TITLE.search(html)
    parts = title and TITLE_PARTS.match(htmllib.unescape(title.group(1)).translate(DIGITS))
    if not parts or not valid_hijri_year(parts.group(3)):
        raise SitePageError("play page title has no leading (N) and Hijri date")
    mp3 = MP3_URL.search(html)
    if not mp3:
        raise SitePageError("play page has no sualruhaily.com/upload mp3 link")
    number, start_point, year, month, day = parts.groups()
    return SitePage(
        int(number),
        re.sub(r"\s+", " ", start_point).rstrip(". "),
        f"{year}/{int(month)}/{int(day)}",
        mp3.group(0),
    )


def _client(client: httpx.Client | None):
    return nullcontext(client) if client else httpx.Client(timeout=TIMEOUT, follow_redirects=True)


def fetch(url: str, client: httpx.Client | None = None) -> str:
    with _client(client) as c:
        response = c.get(url, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        return response.text


def download(url: str, dest: Path, client: httpx.Client | None = None) -> Path:
    part = dest.with_name(dest.name + ".part")
    with _client(client) as c, c.stream("GET", url, headers={"User-Agent": USER_AGENT}) as response:
        response.raise_for_status()
        with open(part, "wb") as f:
            for chunk in response.iter_bytes():
                f.write(chunk)
    part.replace(dest)
    return dest
