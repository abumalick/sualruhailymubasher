import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { NextCard, RecordingCard } from '../src/ui/cards';
import { Lesson } from '../src/ui/Lesson';
import { LiveHero } from '../src/ui/LiveHero';

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
  const html = { next: next.outerHTML, when: next.querySelector('.k')!.textContent!.split(' · ').slice(1).join(' · '), recording: container.querySelector('.card.reach.last')!.outerHTML };
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

  it('the live hero has a preview for when nothing is on air', () => {
    render(<LiveHero course={tafsir} live={FIXTURE_STATE.live} listening={false} onLive={noop} preview={{ number: 444 }} />);
    expect(screen.getByText('عند بدء البث')).toBeTruthy();
    expect(screen.getByText(/الدرس ٤٤٤/)).toBeTruthy();
    expect(screen.queryByText(/مباشر الآن/)).toBeNull();
  });
});
