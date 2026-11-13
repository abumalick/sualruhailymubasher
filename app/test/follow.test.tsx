import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseDTO, StateDTO } from '@albadr/shared';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
    keys: async () => ({ keys: [...store.keys()] }),
  },
}));
vi.mock('@capgo/capacitor-media-session', () => ({
  MediaSession: { setMetadata: async () => {}, setPlaybackState: async () => {}, setPositionState: async () => {}, setActionHandler: async () => {} },
}));
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn(async () => []) }));

import * as api from '../src/api';
import { player } from '../src/audio/player';
import { App } from '../src/App';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { filterState, followOnly, followsNone, noticeFor, parseFollow, reconcile, summary, unfollowed } from '../src/logic/follow';
import { launchTopics, routeForPush, syncPlan, topicsFor } from '../src/logic/topics';

const [fajr, maghrib] = FIXTURE_STATE.courses;
const MON_2110 = new Date('2026-11-02T18:10:00Z');
const evening2: CourseDTO = { ...maghrib, id: 'usul-thalatha', title: 'شرح الأصول الثلاثة' };
const morning2: CourseDTO = { ...fajr, id: 'bulugh', title: 'بلوغ المرام' };

describe('follow model', () => {
  const courses = FIXTURE_STATE.courses;

  it('names the choice plainly', () => {
    expect(summary(courses, [fajr.id])).toBe('درس الفجر فقط');
    expect(summary(courses, [maghrib.id])).toBe('درس المغرب فقط');
    expect(summary(courses, [fajr.id, maghrib.id])).toBe('الدرسان كلاهما');
    expect(summary([...courses, morning2], [maghrib.id])).toBe('درس المغرب فقط');
    expect(summary([...courses, evening2], [fajr.id, maghrib.id])).toBe(`درس الفجر و${maghrib.title}`);
  });

  it('a new course in a followed slot is followed; in another slot it is only announced', () => {
    const evening = followOnly(courses, [maghrib.id]);
    const book = reconcile(evening, [fajr, evening2]);
    expect(book.ids).toEqual([maghrib.id, evening2.id]);
    expect(book.fresh).toEqual([]);

    const morning = followOnly(courses, [fajr.id]);
    const added = reconcile(morning, [fajr, evening2]);
    expect(added.ids).toEqual([fajr.id]);
    expect(added.fresh).toEqual([evening2.id]);
    expect(reconcile(added, [fajr, evening2])).toBe(added);
  });

  it('several new courses: only those in a followed slot are followed', () => {
    const evening = followOnly(courses, [maghrib.id]);
    const next = reconcile(evening, [...courses, morning2, evening2]);
    expect(next.ids).toEqual([maghrib.id, evening2.id]);
    expect(next.fresh).toEqual([morning2.id]);
    expect(next.known).toMatchObject({ [morning2.id]: 'fajr', [evening2.id]: 'maghrib' });
  });

  it('an empty choice (no courses listed at first launch) announces every course that appears', () => {
    const next = reconcile(followOnly([], []), courses);
    expect(next.ids).toEqual([]);
    expect(next.fresh).toEqual([fajr.id, maghrib.id]);
  });

  it('tells whether a playing course is no longer followed', () => {
    const f = followOnly(courses, [fajr.id]);
    expect(unfollowed(maghrib.id, f)).toBe(true);
    expect(unfollowed(fajr.id, f)).toBe(false);
    expect(unfollowed(null, f)).toBe(false);
    expect(unfollowed(undefined, f)).toBe(false);
  });

  it('a followed course missing from the list for a while stays followed when the choice changes', () => {
    const morning = followOnly(courses, [fajr.id]);
    const onBreak = { ...FIXTURE_STATE, courses: [maghrib] };
    expect(followsNone(onBreak, morning)).toBe(true);
    expect(followsNone(FIXTURE_STATE, morning)).toBe(false);
    const both = followOnly(onBreak.courses, [maghrib.id], false, morning);
    expect(both.ids).toEqual([maghrib.id, fajr.id]);
    expect(reconcile(both, courses)).toBe(both);
  });

  it('filters courses and the live of an unfollowed course, but not other broadcasts', () => {
    const f = followOnly(courses, [fajr.id]);
    const live = (courseId: string | null): StateDTO => ({ ...FIXTURE_STATE, live: { ...FIXTURE_STATE.live, isLive: true, courseId } });
    expect(filterState(FIXTURE_STATE, f).courses.map((c) => c.id)).toEqual([fajr.id]);
    expect(filterState(live(maghrib.id), f).live.isLive).toBe(false);
    expect(filterState(live(fajr.id), f).live.isLive).toBe(true);
    expect(filterState(live(null), f).live.isLive).toBe(true);
    expect(filterState(live('not-listed'), f).live.isLive).toBe(true);
  });

  it('drops the topics of an unfollowed course and restores its defaults when followed again', () => {
    const all = topicsFor([fajr.id, maghrib.id]).filter((t) => t !== `c-${fajr.id}-rec`);
    const only = launchTopics({ topics: all, courses: [fajr.id, maghrib.id] }, [fajr.id]);
    expect(only.sort()).toEqual([`c-${fajr.id}-live`, `c-${fajr.id}-prep`, 'live-other']);
    const back = launchTopics({ topics: only, courses: [fajr.id] }, [fajr.id, maghrib.id]);
    expect(back).toEqual(expect.arrayContaining([`c-${maghrib.id}-live`, `c-${maghrib.id}-rec`, `c-${maghrib.id}-prep`]));
    expect(back).not.toContain(`c-${fajr.id}-rec`);
  });

  it('picks the one line that tells the listener what is hidden', () => {
    const morning = followOnly(courses, [fajr.id]);
    expect(noticeFor(FIXTURE_STATE, { ...morning, hint: true }, false)).toEqual({ kind: 'hint' });
    expect(noticeFor({ ...FIXTURE_STATE, courses: [maghrib] }, morning, false)).toEqual({ kind: 'none-listed' });
    expect(noticeFor(FIXTURE_STATE, { ...morning, fresh: [maghrib.id] }, false)).toEqual({ kind: 'fresh', course: maghrib });
    expect(noticeFor(FIXTURE_STATE, morning, false)).toEqual({ kind: 'followed', summary: 'درس الفجر فقط', hidden: null });
    expect(noticeFor(FIXTURE_STATE, morning, true)).toEqual({ kind: 'followed', summary: 'درس الفجر فقط', hidden: 'درس المغرب' });
    const both = followOnly(courses, [fajr.id, maghrib.id]);
    expect(noticeFor(FIXTURE_STATE, both, false)).toBeNull();
    expect(noticeFor(FIXTURE_STATE, both, true)).toEqual({ kind: 'followed', summary: 'الدرسان كلاهما', hidden: null });
  });

  it('reads back a saved choice and rejects anything else', () => {
    const f = followOnly(courses, [fajr.id]);
    expect(parseFollow(JSON.stringify(f))).toEqual(f);
    expect(parseFollow(null)).toBeNull();
    expect(parseFollow('not json')).toBeNull();
    expect(parseFollow(JSON.stringify({ ids: [fajr.id] }))).toBeNull();
    expect(parseFollow(JSON.stringify({ ids: [], fresh: [], known: null }))).toBeNull();
  });

  it('plans the topic sync: wanted topics in, every other course out', () => {
    const all = [fajr.id, maghrib.id];
    const first = syncPlan(null, all, [fajr.id]);
    expect(first.sub).toEqual(topicsFor([fajr.id]));
    expect(first.unsub.sort()).toEqual(topicsFor([maghrib.id]).filter((t) => t !== 'live-other').sort());
    expect(first.courses).toEqual([fajr.id]);

    const stored = { topics: topicsFor(all), courses: all };
    const drop = syncPlan(stored, all, [maghrib.id]);
    expect(drop.unsub).toEqual(expect.arrayContaining([`c-${fajr.id}-live`, `c-${fajr.id}-rec`, `c-${fajr.id}-prep`]));
    expect(drop.coursesIfFailed).toEqual([maghrib.id]);

    const added = syncPlan({ topics: topicsFor([fajr.id]), courses: [fajr.id] }, all, all);
    expect(added.sub).toEqual(expect.arrayContaining([`c-${maghrib.id}-live`, `c-${maghrib.id}-rec`, `c-${maghrib.id}-prep`]));
    expect(added.coursesIfFailed).toEqual([fajr.id]);

    expect(syncPlan(null, [], [])).toEqual({ sub: ['live-other'], unsub: [], courses: [], coursesIfFailed: [] });

    const gone = syncPlan(stored, [maghrib.id], all);
    expect(gone.sub).not.toContain(`c-${fajr.id}-live`);
    expect(gone.courses).toEqual([maghrib.id]);
  });

  it('a push for an unfollowed course opens home', () => {
    const view = filterState(FIXTURE_STATE, followOnly(courses, [fajr.id]));
    expect(routeForPush({ kind: 'rec', courseId: maghrib.id, number: '1' }, view)).toBe('#/');
    expect(routeForPush({ kind: 'rec', courseId: fajr.id, number: '1' }, view)).toBe(`#/course/${fajr.id}`);
    expect(routeForPush({ kind: 'prep', courseId: maghrib.id, number: '1' }, view)).toBe('#/');
    expect(routeForPush({ kind: 'live', courseId: maghrib.id, number: '1' }, view)).toBe('#/');
  });
});

describe('App with a course choice', () => {
  beforeEach(() => {
    store.clear();
    location.hash = '#/';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MON_2110);
    vi.mocked(api.fetchState).mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('first launch asks which lessons, then shows only the chosen one', async () => {
    vi.mocked(api.loadCachedState).mockResolvedValue(null);
    render(<App />);
    const go = await screen.findByRole('button', { name: 'اختر درسًا واحدًا على الأقل' });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('الرئيسية')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /درس المغرب/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'متابعة · درس المغرب فقط' }));
    await screen.findByText('دروسك: درس المغرب فقط');
    expect(JSON.parse(store.get('follow')!).ids).toEqual([maghrib.id]);
    expect(screen.queryByText(fajr.title)).toBeNull();
    expect(screen.queryByText(/الفجر/)).toBeNull();
  });

  it('first launch with no course listed lets the listener in with an empty choice', async () => {
    const empty: StateDTO = { ...FIXTURE_STATE, courses: [] };
    vi.mocked(api.loadCachedState).mockResolvedValue(null);
    vi.mocked(api.fetchState).mockResolvedValue({ state: empty, fresh: true });
    render(<App />);
    await screen.findByText('لا توجد دروس حاليًا، وسيظهر لك كل درس جديد هنا.');
    fireEvent.click(screen.getByRole('button', { name: 'متابعة' }));
    await screen.findByText('لا توجد دروس حالية');
    expect(JSON.parse(store.get('follow')!).ids).toEqual([]);
  });

  it('dropping the course that is playing stops its audio', async () => {
    store.set('follow', JSON.stringify(followOnly(FIXTURE_STATE.courses, [fajr.id, maghrib.id])));
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    location.hash = '#/follow';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /درس الفجر/ }).getAttribute('aria-checked')).toBe('true'));
    await player.play({ url: 'https://x/443.mp3', title: 't', subtitle: '', kind: 'recording', courseId: fajr.id });
    expect(player.state.src?.courseId).toBe(fajr.id);
    fireEvent.click(screen.getByRole('checkbox', { name: /درس الفجر/ }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ · درس المغرب فقط' }));
    await waitFor(() => expect(player.state.src).toBeNull());
  });

  it('first launch offline waits for the course list', async () => {
    vi.mocked(api.loadCachedState).mockResolvedValue(null);
    vi.mocked(api.fetchState).mockRejectedValue(new Error('offline'));
    render(<App />);
    await screen.findByText('نحتاج اتصالًا بالإنترنت لعرض الدروس');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy();
  });

  it('a cached state alone does not make a new install look like an existing user', async () => {
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    render(<App />);
    await screen.findByRole('button', { name: 'اختر درسًا واحدًا على الأقل' });
  });

  it('an existing user keeps both courses and is offered the choice once', async () => {
    store.set('topics', JSON.stringify(['live-other']));
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    render(<App />);
    await screen.findByText('جديد: يمكنك اختيار الدروس التي تتابعها');
    expect(screen.getByRole('button', { name: 'قرأتُه' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء' }));
    await waitFor(() => expect(screen.queryByText('جديد: يمكنك اختيار الدروس التي تتابعها')).toBeNull());
    expect(JSON.parse(store.get('follow')!)).toMatchObject({ ids: [fajr.id, maghrib.id], hint: false });
  });

  it('switching drops morning and adds evening at once, and a dropped course page says so', async () => {
    store.set('follow', JSON.stringify(followOnly(FIXTURE_STATE.courses, [fajr.id])));
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    render(<App />);
    fireEvent.click(await screen.findByText('دروسك: درس الفجر فقط'));
    await waitFor(() => expect(location.hash).toBe('#/follow'));
    fireEvent.click(await screen.findByRole('checkbox', { name: /درس الفجر/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /درس المغرب/ }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ · درس المغرب فقط' }));
    await screen.findByText('دروسك: درس المغرب فقط');
    location.hash = `#/course/${fajr.id}`;
    await screen.findByText('لا تتابع هذا الدرس');
    location.hash = `#/book/${fajr.id}/0/1`;
    await screen.findByText('لا تتابع هذا الدرس');
  });

  it('the chooser ignores a followed course that left the list, so it cannot save an empty choice', async () => {
    store.set('follow', JSON.stringify(followOnly(FIXTURE_STATE.courses, [fajr.id, maghrib.id])));
    const onlyEvening = { ...FIXTURE_STATE, courses: [maghrib] };
    vi.mocked(api.loadCachedState).mockResolvedValue(onlyEvening);
    vi.mocked(api.fetchState).mockResolvedValue({ state: onlyEvening, fresh: true });
    location.hash = '#/follow';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /درس المغرب/ }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(screen.getByRole('checkbox', { name: /درس المغرب/ }));
    const save = await screen.findByRole('button', { name: 'اختر درسًا واحدًا على الأقل' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it('nothing followed in the list shows a line, not a blocking screen', async () => {
    store.set('follow', JSON.stringify(followOnly(FIXTURE_STATE.courses, [fajr.id])));
    const onlyEvening = { ...FIXTURE_STATE, courses: [maghrib] };
    vi.mocked(api.loadCachedState).mockResolvedValue(onlyEvening);
    vi.mocked(api.fetchState).mockResolvedValue({ state: onlyEvening, fresh: true });
    render(<App />);
    await screen.findByText('لا يُعرض لك أي درس حاليًا');
    expect(screen.getByText('لا تتابع أي درس')).toBeTruthy();
    expect([...document.querySelectorAll('.nav a')].map((a) => a.textContent)).toEqual(['المزيد']);
  });

  it('a live lesson of an unfollowed course shows no live card', async () => {
    const liveEvening: StateDTO = { ...FIXTURE_STATE, live: { ...FIXTURE_STATE.live, isLive: true, courseId: maghrib.id } };
    store.set('follow', JSON.stringify(followOnly(FIXTURE_STATE.courses, [fajr.id])));
    vi.mocked(api.loadCachedState).mockResolvedValue(liveEvening);
    vi.mocked(api.fetchState).mockResolvedValue({ state: liveEvening, fresh: true });
    render(<App />);
    await screen.findByText('دروسك: درس الفجر فقط');
    expect(screen.queryByText(/مباشر الآن/)).toBeNull();
  });
});
