"""Which text a located lesson stores as its end point, which the app shows as the next lesson's start."""
from .api import Published
from .locate import LocateResult
from .quran import next_lesson_start, parse_label


def recorded_end_point(start_point: str, next_start_point: str | None, found: LocateResult) -> tuple[str | None, str | None]:
    """(end point or None, why the Tafsir ayah was rejected or None). A Tafsir start is never a book passage:
    without a checked ayah it stays unset, and the app shows its generic «continues from lesson N» line."""
    if next_start_point:
        return next_start_point, None
    if parse_label(start_point) is None:
        return found.end_point, None
    return next_lesson_start(start_point, found.next_surah, found.next_ayah, found.next_ayah_words)


def corrections(latest: list[Published]) -> list[tuple[int, str]]:
    """Tafsir lessons whose end point differs from the next lesson's start point once that one is published."""
    by_number = {lesson.number: lesson for lesson in latest}
    return [
        (lesson.number, following.start_point)
        for lesson in latest
        if (following := by_number.get(lesson.number + 1)) is not None
        and lesson.end_page is not None
        and parse_label(lesson.start_point) is not None
        and following.start_point
        and lesson.end_point != following.start_point
    ]
