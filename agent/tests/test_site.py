import re
from pathlib import Path

import pytest

from sualruhaily_agent.site import SitePage, SitePageError, parse_play_page

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_kabair_play_page():
    html = (FIXTURES / "site-play-2898.html").read_text(encoding="utf-8")
    mp3 = re.search(r'src="(https://sualruhaily\.com/upload/[^"]+\.mp3)"', html).group(1)

    assert parse_play_page(html) == SitePage(
        54, "الكبيرة الثالثة والخمسون: لبس الحرير والذهب للرجال", "1448/5/12", mp3
    )


def test_title_without_leading_number_is_rejected():
    html = (FIXTURES / "site-play-2900.html").read_text(encoding="utf-8")

    with pytest.raises(SitePageError):
        parse_play_page(html)


def test_page_without_mp3_is_rejected():
    html = "<title> (3) الكبيرة: س.... ١٤٤٨/٥/١٢ هـ - الشيخ</title>"

    with pytest.raises(SitePageError):
        parse_play_page(html)
