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


def test_gregorian_title_date_is_rejected():
    html = '<title> (3) الكبيرة: س.... 2026/10/12 هـ - الشيخ</title><source src="https://sualruhaily.com/upload/a.mp3">'

    with pytest.raises(SitePageError):
        parse_play_page(html)


def test_fetch_and_download_send_a_browser_user_agent(tmp_path):
    import httpx

    from sualruhaily_agent.site import USER_AGENT, download, fetch

    agents = []

    def handler(request):
        agents.append(request.headers["user-agent"])
        return httpx.Response(200, text="<html>ok</html>") if request.url.path == "/play/1" else httpx.Response(200, content=b"mp3")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    assert fetch("https://sualruhaily.com/play/1", client) == "<html>ok</html>"
    path = download("https://sualruhaily.com/upload/a.mp3", tmp_path / "1049.mp3", client)
    assert path == tmp_path / "1049.mp3" and path.read_bytes() == b"mp3"
    assert agents == [USER_AGENT, USER_AGENT]
    assert USER_AGENT.startswith("Mozilla/5.0 (X11; Linux x86_64)")


def test_fetch_error_status_raises(tmp_path):
    import httpx

    from sualruhaily_agent.site import fetch

    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(406)))
    with pytest.raises(httpx.HTTPError):
        fetch("https://sualruhaily.com/play/1", client)
