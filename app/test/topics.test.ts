import { describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { diffTopics, launchTopics, routeForPush, topicsFor } from '../src/logic/topics';

describe('topics', () => {
  it('subscribes to every default topic', () => {
    const all = topicsFor(['tafsir-saadi', 'kitab-tawhid']);
    expect(all).toHaveLength(7);
    expect(all).toContain('c-tafsir-saadi-prep');
    expect(all).toContain('live-other');
  });

  it('turning one topic off unsubscribes only that topic', () => {
    const all = topicsFor(['tafsir-saadi', 'kitab-tawhid']);
    const wanted = all.filter((t) => t !== 'c-kitab-tawhid-live');
    expect(diffTopics(all, wanted)).toEqual({ sub: [], unsub: ['c-kitab-tawhid-live'] });
    expect(diffTopics(wanted, all)).toEqual({ sub: ['c-kitab-tawhid-live'], unsub: [] });
  });

  it('first launch wants everything', () => {
    expect(launchTopics(null, ['a', 'b'])).toEqual(topicsFor(['a', 'b']));
  });

  it('a new course adds its 3 topics and keeps earlier opt-outs', () => {
    const stored = { topics: topicsFor(['a']).filter((t) => t !== 'c-a-rec'), courses: ['a'] };
    const wanted = launchTopics(stored, ['a', 'b']);
    expect(diffTopics(stored.topics, wanted)).toEqual({ sub: ['c-b-live', 'c-b-rec', 'c-b-prep'], unsub: [] });
  });

  it('nothing changes when no course is new', () => {
    const stored = { topics: ['c-a-live'], courses: ['a'] };
    expect(launchTopics(stored, ['a'])).toEqual(['c-a-live']);
  });
});

describe('routeForPush', () => {
  const state = structuredClone(FIXTURE_STATE);
  const course = state.courses[0];

  it('live and live-other open home, rec opens the course', () => {
    expect(routeForPush({ kind: 'live', courseId: course.id, number: '1' }, state)).toBe('#/');
    expect(routeForPush({ kind: 'live-other', number: '0' }, state)).toBe('#/');
    expect(routeForPush({ kind: 'rec', courseId: course.id, number: '1' }, state)).toBe(`#/course/${course.id}`);
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
