import { cleanup, render } from '@testing-library/preact';
import type { CourseDTO } from '@sualruhaily/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { liveContext } from '../src/logic/live';
import { startText } from '../src/ui/format';
import { NextCard } from '../src/ui/cards';
import { LiveCard, LiveHero } from '../src/ui/LiveHero';
import { liveDTO, STARTED, TAWHID } from './live-state';

afterEach(cleanup);

// What /api/state serves for a course that has no lesson yet: next.number is the prediction 1, with no start text.
const EMPTY: CourseDTO = { ...TAWHID, latest: [], next: { ...TAWHID.next!, number: 1, startPoint: null, startPage: null, pdfIndex: null, estEndPage: null, estimated: true } };
const noop = () => {};

describe('a course with no lessons yet', () => {
  it('startText gives no continue-from line without a previous lesson', () => {
    expect(startText({ startPoint: null, number: 1 })).toBeNull();
    expect(startText({ startPoint: 'من قوله: باب', number: 1 })).toBe('من قوله: باب');
    expect(startText({ startPoint: null, number: 15 })).toBe('يتابع من حيث توقف الدرس ١٤');
  });

  it('the next card shows the title time but no lesson number and no continue line', () => {
    const { container } = render(<NextCard course={EMPTY} next={EMPTY.next!} when="غدًا بعد العصر · ٤:٠٠ م" read={false} onTick={noop} />);
    const text = container.textContent!;
    expect(text).toContain('غدًا بعد العصر · ٤:٠٠ م');
    expect(text).not.toContain('الدرس');
    expect(text).not.toContain('يتابع');
  });

  it('the live context names no lesson and no continue line', () => {
    const ctx = liveContext(EMPTY, true, STARTED['kabair']);
    expect(ctx.title).toBe(EMPTY.title);
    expect(ctx.header).toBe('البث المباشر');
    expect(ctx.start).toBeNull();
    expect(ctx.status).toEqual({ live: true, text: 'بث مباشر' });
  });

  it('the live hero and the live card show the course title without a lesson number', () => {
    const hero = render(<LiveHero course={EMPTY} live={liveDTO('kabair')} listening={false} onLive={noop} />);
    expect(hero.container.textContent).toContain(EMPTY.title);
    expect(hero.container.textContent).not.toContain('الدرس');
    cleanup();
    const card = render(<LiveCard course={EMPTY} live={liveDTO('kabair')} onLive={noop} />);
    expect(card.container.textContent).toContain(EMPTY.title);
    expect(card.container.textContent).not.toContain('الدرس');
  });
});
