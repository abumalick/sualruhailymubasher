import json
import subprocess

from albadr_agent.api import Pending
from albadr_agent.locate import LocateResult, accept, build_prompt, candidate_pages, find_page, locate
from albadr_agent.transcribe import Segment

PENDING = Pending(
    course_id="kitab-tawhid", number=2, recording_url="https://x/2.mp3",
    start_point="من قوله: باب فضل التوحيد", pdf_urls=["https://x/1.pdf"],
)
PAGES = [(0, n, f"نص الصفحة {n}") for n in range(10, 15)]
GOOD = {
    "start_page": 11, "end_page": 13, "pdf_index": 0, "end_pdf_index": 0,
    "end_point": "من قوله: باب الدعاء إلى شهادة", "confidence": 0.9,
}


def result(**changes) -> LocateResult:
    return LocateResult(**{**GOOD, **changes})


def fake_run(*outputs):
    calls = []

    def run(cmd, **kwargs):
        calls.append((cmd, kwargs))
        out = outputs[min(len(calls), len(outputs)) - 1]
        return subprocess.CompletedProcess(cmd, 0, stdout=out, stderr="")

    run.calls = calls
    return run


def test_prompt_has_headers_start_point_and_stamped_transcript():
    prompt = build_prompt(PENDING, [Segment(start=75.2, end=80, text="كلام الشيخ")], PAGES)
    for _, n, _ in PAGES:
        assert f"=== ملف 0 صفحة {n} ===" in prompt
    assert PENDING.start_point in prompt
    assert "[01:15] كلام الشيخ" in prompt


def test_locate_parses_result_and_sends_prompt_on_stdin():
    run = fake_run(json.dumps({"result": json.dumps(GOOD)}))
    assert locate("PROMPT", run=run) == result()
    cmd, kwargs = run.calls[0]
    assert cmd[:2] == ["claude", "-p"] and "sonnet" in cmd and "json" in cmd
    assert kwargs["input"] == "PROMPT"


def test_locate_reads_event_array_output():
    events = [{"type": "system"}, {"type": "result", "result": json.dumps(GOOD)}]
    assert locate("p", run=fake_run(json.dumps(events))) == result()


def test_locate_accepts_fenced_json():
    fenced = "```json\n" + json.dumps(GOOD) + "\n```"
    assert locate("p", run=fake_run(json.dumps({"result": fenced}))) == result()


def test_prose_is_retried_once_then_none():
    run = fake_run(json.dumps({"result": "لا أستطيع تحديد ذلك"}))
    assert locate("p", run=run) is None
    assert len(run.calls) == 2


def test_broken_outer_json_then_success_on_retry():
    run = fake_run("not json", json.dumps({"result": json.dumps(GOOD)}))
    assert locate("p", run=run) == result()
    assert len(run.calls) == 2


def test_nonzero_exit_and_timeout_do_not_raise():
    def failing(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, 1)

    assert locate("p", run=failing) is None
    bad = lambda cmd, **kw: subprocess.CompletedProcess(cmd, 1, stdout="", stderr="boom")  # noqa: E731
    assert locate("p", run=bad) is None


def test_accept_rules():
    assert accept(result(), PAGES)
    assert not accept(result(confidence=0.4), PAGES)
    assert not accept(result(start_page=13, end_page=12), PAGES)
    assert not accept(result(start_page=9), PAGES)
    assert not accept(result(end_page=15), PAGES)
    assert not accept(result(pdf_index=1), PAGES)
    assert not accept(result(end_point="باب الدعاء"), PAGES)


def test_candidates_follow_previous_end():
    pages = [(0, n, f"صفحة {n}") for n in range(1, 40)]
    got = candidate_pages(PENDING, pages, (0, 10))
    assert [n for _, n, _ in got] == list(range(9, 21))


def test_candidates_clip_at_book_start():
    pages = [(0, n, f"صفحة {n}") for n in range(1, 40)]
    assert [n for _, n, _ in candidate_pages(PENDING, pages, (0, 1))][:2] == [1, 2]


def test_candidates_without_previous_end_search_by_start_point():
    pages = [(0, n, "كلام آخر تماما") for n in range(1, 40)]
    pages[19] = (0, 20, "هذا الباب في فَضْلِ التَّوْحِيدِ وما يُكَفِّرُ")
    got = candidate_pages(PENDING, pages, None)
    assert got[0][1] == 19 and len(got) == 12


def test_candidates_empty_when_nothing_matches():
    assert candidate_pages(PENDING, [(0, 1, "zzz")], None) == []


def test_long_end_point_is_truncated_and_cli_flags_set():
    long = {**GOOD, "end_point": "من قوله: " + "ك" * 200}
    run = fake_run(json.dumps({"result": json.dumps(long, ensure_ascii=False)}))
    got = locate("p", run=run)
    assert len(got.end_point) == 80
    cmd, kwargs = run.calls[0]
    assert "--tools" in cmd and "--no-session-persistence" in cmd and kwargs["timeout"] == 300


def _book(*specials):
    pages = [(0, n, "كلام عام") for n in range(1, 61)]
    for n, text in specials:
        pages[n - 1] = (0, n, text)
    return pages


def test_find_page_prefers_a_near_match_within_the_span_over_a_better_far_one():
    pages = _book((8, "عن عبادة قال رسول"), (50, "عن عبادة بن الصامت قال رسول"))
    assert find_page("من قوله: عن عبادة بن الصامت قال رسول", pages, 2, span=24) == 7


def test_find_page_ignores_pages_beyond_the_span():
    pages = _book((50, "عن عبادة بن الصامت قال رسول"))
    assert find_page("من قوله: عن عبادة بن الصامت قال رسول", pages, 2, span=24) is None


def test_find_page_floor():
    pages = _book((8, "عن عبادة قال رسول"))
    assert find_page("من قوله: عن عبادة بن الصامت قال رسول", pages, 2, span=24, floor=0.8) is None
    assert find_page("من قوله: عن عبادة بن الصامت قال رسول", pages, 2, span=24, floor=0.6) == 7


def test_find_page_none_when_nothing_matches():
    assert find_page("من قوله: عن عبادة بن الصامت", _book(), 2, span=24) is None
