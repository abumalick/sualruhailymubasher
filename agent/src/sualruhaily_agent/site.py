import html as htmllib
import re
from dataclasses import dataclass

from sualruhaily_agent.captions import DIGITS, valid_hijri_year

TITLE = re.compile(r"<title>(.*?)</title>", re.DOTALL)
TITLE_PARTS = re.compile(r"^\s*\((\d+)\)\s*(.*?)\s*(\d{4})/(\d+)/(\d+)\s*هـ")
MP3_URL = re.compile(r"https://sualruhaily\.com/upload/[^\"'<>]*?\.mp3(?=[\"'])")


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
