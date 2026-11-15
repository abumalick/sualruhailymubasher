import { describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { routeForPush, tapNavigation, topicsFor } from '../src/logic/topics';

describe('topics', () => {
  it('subscribes to every default topic', () => {
    const all = topicsFor(['kitab-tawhid', 'kabair']);
    expect(all).toHaveLength(7);
    expect(all).toContain('c-kitab-tawhid-prep');
    expect(all).toContain('live-other');
  });
});

describe('routeForPush', () => {
  const state = structuredClone(FIXTURE_STATE);
  const course = state.courses[0];

  it('live and rec open the lesson tab, live-other stays where the listener is', () => {
    expect(routeForPush({ kind: 'live', courseId: course.id, number: '1' }, state)).toBe(`#/course/${course.id}`);
    expect(routeForPush({ kind: 'live', courseId: course.id, number: '1' }, null)).toBe(`#/course/${course.id}`);
    expect(routeForPush({ kind: 'live-other', number: '0' }, state)).toBeNull();
    expect(routeForPush({ kind: 'rec', courseId: course.id, number: '1' }, state)).toBe(`#/course/${course.id}`);
  });

  it('a course the listener no longer follows opens home', () => {
    const other = { ...state, courses: state.courses.filter((c) => c.id !== course.id) };
    expect(routeForPush({ kind: 'live', courseId: course.id, number: '1' }, other)).toBe('#/');
  });

  it('prep opens the book at the next passage with the marker', () => {
    course.next = { ...course.next!, pdfIndex: 1, startPage: 12 };
    expect(routeForPush({ kind: 'prep', courseId: course.id, number: '2' }, state)).toBe(`#/book/${course.id}/1/12?marker=1`);
  });

  it('prep with unknown pdf index uses volume 0', () => {
    course.next = { ...course.next!, pdfIndex: null, startPage: 12 };
    expect(routeForPush({ kind: 'prep', courseId: course.id, number: '2' }, state)).toBe(`#/book/${course.id}/0/12?marker=1`);
  });

  it('prep with an unknown page opens page 1 of the volume without the marker', () => {
    course.next = { ...course.next!, pdfIndex: null, startPage: null };
    expect(routeForPush({ kind: 'prep', courseId: course.id, number: '2' }, state)).toBe(`#/book/${course.id}/0/1`);
  });

  it('prep falls back to the course page without PDFs or state', () => {
    const noPdf = { ...state, courses: [{ ...course, pdfUrls: [], next: { ...course.next!, startPage: 12 } }] };
    expect(routeForPush({ kind: 'prep', courseId: course.id, number: '2' }, noPdf)).toBe(`#/course/${course.id}`);
    expect(routeForPush({ kind: 'prep', courseId: course.id, number: '2' }, null)).toBe(`#/course/${course.id}`);
  });
});

describe('tapNavigation', () => {
  const course = FIXTURE_STATE.courses[0];

  it('outside the tour, a tap pushes its page and live-other stays put', () => {
    expect(tapNavigation({ kind: 'rec', courseId: course.id, number: '1' }, FIXTURE_STATE, false)).toEqual({ path: `#/course/${course.id}`, replace: false });
    expect(tapNavigation({ kind: 'live-other', number: '0' }, FIXTURE_STATE, false)).toBeNull();
  });

  it('during the tour, any tap closes it: live-other goes home, and the tour leaves the history', () => {
    expect(tapNavigation({ kind: 'live-other', number: '0' }, FIXTURE_STATE, true)).toEqual({ path: '#/', replace: true });
    expect(tapNavigation({ kind: 'live', courseId: course.id, number: '1' }, FIXTURE_STATE, true)).toEqual({ path: `#/course/${course.id}`, replace: true });
  });
});
