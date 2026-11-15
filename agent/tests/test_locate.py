import json
import subprocess

import pytest

from sualruhaily_agent.api import Pending
from sualruhaily_agent.locate import (
    ClaudeUnavailable, LocateResult, accept, build_prompt, candidate_pages, clip, find_page, locate,
)
from sualruhaily_agent.transcribe import Segment

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


def test_timeouts_and_error_exits_on_every_attempt_mean_claude_is_unavailable():
    def failing(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, 1)

    with pytest.raises(ClaudeUnavailable):
        locate("p", run=failing)
    bad = lambda cmd, **kw: subprocess.CompletedProcess(cmd, 1, stdout="", stderr="boom")  # noqa: E731
    with pytest.raises(ClaudeUnavailable):
        locate("p", run=bad)


def test_one_error_exit_then_an_answer_is_fine():
    run = fake_run(json.dumps({"result": json.dumps(GOOD, ensure_ascii=False)}))
    outputs = iter([subprocess.CompletedProcess([], 1, stdout="", stderr="x"), None])

    def flaky(cmd, **kw):
        out = next(outputs)
        return out if out is not None else run(cmd, **kw)

    assert locate("p", run=flaky).end_page == GOOD["end_page"]


def test_missing_claude_cli_raises_without_retrying():
    calls = []

    def missing(cmd, **kwargs):
        calls.append(cmd)
        raise FileNotFoundError("claude")

    with pytest.raises(ClaudeUnavailable):
        locate("p", run=missing)
    assert len(calls) == 1


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


def test_long_end_point_is_cut_on_a_word_and_cli_flags_set():
    long = {**GOOD, "end_point": "من قوله: " + "كلمتان " * 40}
    run = fake_run(json.dumps({"result": json.dumps(long, ensure_ascii=False)}))
    got = locate("p", run=run)
    assert len(got.end_point) <= 80 and got.end_point.endswith("كلمتان…")
    cmd, kwargs = run.calls[0]
    assert "--tools" in cmd and "--no-session-persistence" in cmd and kwargs["timeout"] == 300


def test_end_point_without_prefix_is_normalized():
    bare = {**GOOD, "end_point": "فمن كانت أعماله أنقص"}
    got = locate("p", run=fake_run(json.dumps({"result": json.dumps(bare, ensure_ascii=False)})))
    assert got.end_point == "من قوله: فمن كانت أعماله أنقص"
    assert accept(got, [(0, n, "") for n in range(10, 15)])


def test_prompt_hints_the_next_lesson_start_when_known():
    hinted = PENDING.model_copy(update={"next_start_point": "من قوله: عن عبادة بن الصامت"})
    assert "الدرس التالي يبدأ بـ: من قوله: عن عبادة بن الصامت" in build_prompt(hinted, [], PAGES)
    assert "الدرس التالي" not in build_prompt(PENDING, [], PAGES)


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


def test_candidates_without_previous_end_stay_in_the_named_surah():
    point = PENDING.model_copy(update={"start_point": "تفسير سورة الأنفال: من الآية (60) ﴿وَأَعِدُّوا لَهُمْ مَا اسْتَطَعْتُمْ مِنْ قُوَّةٍ﴾"})
    pages = [
        (0, 1, "سورة البقرة وأعدوا لهم ما استطعتم من قوة ومن رباط الخيل"),
        (0, 2, "سورة الأنفال (55-59) كلام آخر"),
        (0, 3, "سورة الأنفال (60) وأعدوا لهم"),
    ]
    assert [n for _, n, _ in candidate_pages(point, pages, None)] == [2, 3]


def test_tafsir_label_is_not_matched_as_book_text():
    from sualruhaily_agent.locate import match_score
    point = "تفسير سورة الأنفال: من الآية (60) ﴿وَأَعِدُّوا لَهُمْ مَا اسْتَطَعْتُمْ﴾"
    assert match_score(point, "وأعدوا لهم ما استطعتم") == 1.0


def test_clip_never_cuts_a_word_or_leaves_a_bracket_open():
    assert clip("قصير") == "قصير"
    cut = clip("من قوله: ﴿وَأَعِدُّوا لَهُمْ مَا اسْتَطَعْتُمْ مِنْ قُوَّةٍ وَمِنْ رِبَاطِ الْخَيْلِ تُرْهِبُونَ بِهِ عَدُوَّ اللَّهِ﴾")
    assert cut.endswith("…﴾") and len(cut) <= 80
    assert all(w in "وَأَعِدُّوا لَهُمْ مَا اسْتَطَعْتُمْ مِنْ قُوَّةٍ وَمِنْ رِبَاطِ الْخَيْلِ تُرْهِبُونَ بِهِ عَدُوَّ" for w in cut[10:-2].split())
    assert clip("من قوله: «" + "قال " * 30 + "»").endswith("قال…»")


def test_prompt_asks_for_the_next_ayah_only_for_tafsir_lessons():
    tafsir = PENDING.model_copy(update={"start_point": "تفسير سورة التوبة: من الآية (٥) ﴿فَإِذَا انْسَلَخَ...﴾"})
    assert "next_ayah_words" in build_prompt(tafsir, [], PAGES)
    assert "next_ayah" not in build_prompt(PENDING, [], PAGES) and "3ب" not in build_prompt(PENDING, [], PAGES)


def test_clip_closes_a_short_quote_and_nested_brackets_innermost_first():
    assert clip("من قوله: ﴿وَأَعِدُّوا لَهُمْ") == "من قوله: ﴿وَأَعِدُّوا لَهُمْ﴾"
    assert clip("من قوله: «قال ﴿كذا") == "من قوله: «قال ﴿كذا﴾»"
    assert len(clip("من قوله: «قال ﴿" + "كذا " * 40)) <= 80


@pytest.mark.parametrize("value,expected", [("٨", 8), ("8", 8), (8, 8), ("8-10", None), (8.5, None), (None, None)])
def test_an_odd_next_ayah_does_not_sink_the_reply(value, expected):
    reply = {**GOOD, "next_surah": 9, "next_ayah": value, "next_ayah_words": ["x"]}
    got = locate("p", run=fake_run(json.dumps({"result": json.dumps(reply, ensure_ascii=False)})))
    assert (got.end_page, got.next_ayah, got.next_surah, got.next_ayah_words) == (13, expected, None, None)
