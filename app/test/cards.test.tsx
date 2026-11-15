import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { NextCard, RecordingCard } from '../src/ui/cards';
import { Lesson } from '../src/ui/Lesson';

const [tafsir] = FIXTURE_STATE.courses;
const MON_2110 = new Date('2026-11-02T18:10:00Z');
const noop = () => {};
const none = () => ({ read: new Set<string>(), reviewed: new Set<string>() });

afterEach(cleanup);

function lessonCards() {
  const { container } = render(
    <Lesson course={tafsir} live={FIXTURE_STATE.live} otherLive={null} ticks={none()} now={MON_2110} listening={false} onTick={noop} onPlay={noop} onLive={noop} />,
  );
  const next = container.querySelector('.card.reach:not(.last)')!;
  const html = { next: next.outerHTML, when: next.querySelector('.k')!.textContent!, recording: container.querySelector('.card.reach.last')!.outerHTML };
  cleanup();
  return html;
}

describe('cards shared by the lesson screen and the onboarding', () => {
  it('the lesson screen renders exactly the shared next-lesson and recording cards', () => {
    const inLesson = lessonCards();
    const next = render(<NextCard course={tafsir} next={tafsir.next!} when={inLesson.when} read={false} onTick={noop} />);
    expect(next.container.innerHTML).toBe(inLesson.next);
    cleanup();
    const rec = render(<RecordingCard course={tafsir} lesson={tafsir.latest[0]} reviewed={false} onPlay={noop} onTick={noop} />);
    expect(rec.container.innerHTML).toBe(inLesson.recording);
  });
});
