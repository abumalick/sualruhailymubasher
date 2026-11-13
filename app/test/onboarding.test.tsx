import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
    keys: async () => ({ keys: [...store.keys()] }),
  },
}));
const native = vi.hoisted(() => ({ on: true }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.on } }));
const fm = vi.hoisted(() => ({
  requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
  checkPermissions: vi.fn(async () => ({ receive: 'prompt' })),
  addListener: vi.fn(async (_: string, _cb: (e: unknown) => Promise<void>) => ({ remove: async () => {} })),
  createChannel: vi.fn(async () => {}),
  subscribeToTopic: vi.fn(async () => {}),
  unsubscribeFromTopic: vi.fn(async () => {}),
  getDeliveredNotifications: vi.fn(async () => ({ notifications: [] })),
}));
vi.mock('@capacitor-firebase/messaging', () => ({ FirebaseMessaging: fm, Importance: { High: 4 } }));
const back = vi.hoisted(() => ({ handler: null as null | ((e: { canGoBack: boolean }) => void) }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (_: string, h: (e: { canGoBack: boolean }) => void) => {
      back.handler = h;
      return Promise.resolve({ remove: async () => {} });
    },
  },
}));
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(async () => null), fetchState: vi.fn(), fetchLessons: vi.fn(async () => []) }));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { topicsFor } from '../src/logic/topics';
import { seedPrefs } from './seed';

const [fajr, maghrib] = FIXTURE_STATE.courses;
const MON_2110 = new Date('2026-11-02T18:10:00Z');
let App: typeof import('../src/App').App;

beforeEach(async () => {
  vi.resetModules();
  const api = await import('../src/api');
  ({ App } = await import('../src/App'));
  store.clear();
  native.on = true;
  history.replaceState(null, '', '#/');
  vi.clearAllMocks();
  fm.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  fm.requestPermissions.mockResolvedValue({ receive: 'granted' });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MON_2110);
  vi.mocked(api.fetchState).mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const next = () => fireEvent.click(screen.getByRole('button', { name: 'متابعة' }));
const heading = (name: string) => screen.findByRole('heading', { name });
const switchOf = (name: string) => screen.getByRole('switch', { name });
const tabLabels = () => [...document.querySelectorAll('.nav a')].map((a) => a.textContent);
const saved = () => JSON.parse(store.get('prefs')!);

async function start() {
  render(<App />);
  await heading('أيَّ الدروس تحضر؟');
}
async function toLive() {
  await start();
  next();
  await heading('استمع مباشرةً');
}

describe('the app screen', () => {
  it('names the two real lessons with their times, both ticked', async () => {
    await start();
    expect(screen.getByText(fajr.title)).toBeTruthy();
    expect(screen.getByText(maghrib.title)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /درس الفجر/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: /درس المغرب/ }).getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.nav')).toBeNull();
  });

  it('cannot continue with no lesson ticked', async () => {
    await start();
    fireEvent.click(screen.getByRole('checkbox', { name: /درس الفجر/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /درس المغرب/ }));
    expect((screen.getByRole('button', { name: 'اختر درسًا واحدًا على الأقل' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offline with nothing cached waits for the lessons', async () => {
    const api = await import('../src/api');
    vi.mocked(api.fetchState).mockRejectedValue(new Error('offline'));
    render(<App />);
    await screen.findByText('نحتاج اتصالًا بالإنترنت لعرض الدروس');
  });
});

describe('the live step', () => {
  it('shows the real live hero of the first lesson, as it will look when the broadcast starts', async () => {
    await toLive();
    expect(screen.getByText('مثال من درس الفجر')).toBeTruthy();
    expect(screen.getByText('عند بدء البث')).toBeTruthy();
    expect(screen.getByText(fajr.title)).toBeTruthy();
    expect(switchOf('درس الفجر').getAttribute('aria-checked')).toBe('true');
    expect(switchOf('درس المغرب').getAttribute('aria-checked')).toBe('true');
    expect(switchOf('بث مباشر آخر').getAttribute('aria-checked')).toBe('true');
  });

  it('asks the system permission once, on continue, and not again later', async () => {
    await toLive();
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    next();
    await heading('راجع الدرس');
    expect(fm.requestPermissions).toHaveBeenCalledOnce();
    fm.checkPermissions.mockResolvedValue({ receive: 'granted' });
    next();
    await heading('حضّر للدرس القادم');
    expect(fm.requestPermissions).toHaveBeenCalledOnce();
  });

  it('with every live switch off, the ask moves to the revision step', async () => {
    await toLive();
    for (const name of ['درس الفجر', 'درس المغرب', 'بث مباشر آخر']) fireEvent.click(switchOf(name));
    next();
    await heading('راجع الدرس');
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    next();
    await heading('حضّر للدرس القادم');
    expect(fm.requestPermissions).toHaveBeenCalledOnce();
  });

  it('a refused permission keeps the switches, says so, and never asks again', async () => {
    fm.requestPermissions.mockResolvedValue({ receive: 'denied' });
    await toLive();
    next();
    await heading('راجع الدرس');
    expect(await screen.findByText(/التنبيهات متوقفة من إعدادات الجهاز/)).toBeTruthy();
    expect(switchOf('درس الفجر')).toBeTruthy();
    next();
    await heading('حضّر للدرس القادم');
    expect(fm.requestPermissions).toHaveBeenCalledOnce();
  });
});

describe('the example cards', () => {
  it('cannot be used: no link followed, no tick saved', async () => {
    await toLive();
    next();
    await heading('راجع الدرس');
    const frame = document.querySelector('.frame')!;
    expect(frame.hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByRole('button', { hidden: true, name: 'راجعتُه' }));
    const link = frame.querySelector('a')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(location.hash).toBe('#/');
    expect([...store.keys()].some((k) => k.startsWith('reviewed:'))).toBe(false);
  });
});

describe('the whole flow', () => {
  it('ends on the lessons with the choices saved', async () => {
    await toLive();
    fireEvent.click(switchOf('بث مباشر آخر'));
    next();
    await heading('راجع الدرس');
    expect(screen.getByText(/الدرس ٤٤٣ · التسجيل متاح/)).toBeTruthy();
    fireEvent.click(switchOf('درس المغرب'));
    next();
    await heading('حضّر للدرس القادم');
    expect(screen.getByText(/الدرس ٤٤٤ ·/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    await waitFor(() => expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']));
    expect(store.get('onboarded')).toBe('1');
    expect(saved().wanted.sort()).toEqual(topicsFor([fajr.id, maghrib.id]).filter((t) => t !== 'live-other' && t !== `c-${maghrib.id}-rec`).sort());
  });

  it('an unticked lesson has no switches and no notifications, yet its tab stays', async () => {
    await start();
    fireEvent.click(screen.getByRole('checkbox', { name: /درس المغرب/ }));
    next();
    await heading('استمع مباشرةً');
    expect(screen.queryByRole('switch', { name: 'درس المغرب' })).toBeNull();
    next();
    await heading('راجع الدرس');
    next();
    await heading('حضّر للدرس القادم');
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    await waitFor(() => expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']));
    expect(saved().wanted.sort()).toEqual(topicsFor([fajr.id]).sort());
  });

  it('رجوع goes back one step', async () => {
    await toLive();
    next();
    await heading('راجع الدرس');
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
    await heading('استمع مباشرةً');
  });

  it("Android's back button steps back inside the onboarding and stays on it", async () => {
    seedPrefs(store, FIXTURE_STATE.courses);
    history.replaceState(null, '', '#/welcome');
    render(<App />);
    await heading('أيَّ الدروس تحضر؟');
    next();
    await heading('استمع مباشرةً');
    next();
    await heading('راجع الدرس');
    back.handler!({ canGoBack: true });
    await heading('استمع مباشرةً');
    expect(location.hash).toBe('#/welcome');
  });

  it("Android's back button does nothing on the first screen at first launch", async () => {
    await start();
    back.handler!({ canGoBack: false });
    await heading('أيَّ الدروس تحضر؟');
  });

  it('closing the app mid-way starts again from the first screen', async () => {
    await toLive();
    cleanup();
    vi.resetModules();
    ({ App } = await import('../src/App'));
    const api = await import('../src/api');
    vi.mocked(api.fetchState).mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
    await start();
    expect(store.has('onboarded')).toBe(false);
  });

  it('on the web shows the steps without switches and still saves the lessons', async () => {
    native.on = false;
    await start();
    fireEvent.click(screen.getByRole('checkbox', { name: /درس الفجر/ }));
    next();
    await heading('استمع مباشرةً');
    expect(screen.queryByRole('switch')).toBeNull();
    next();
    await heading('راجع الدرس');
    next();
    await heading('حضّر للدرس القادم');
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    await waitFor(() => expect(store.get('onboarded')).toBe('1'));
    expect(saved().wanted.filter((t: string) => t.startsWith('c-')).sort()).toEqual(topicsFor([maghrib.id]).filter((t) => t !== 'live-other').sort());
    expect(fm.requestPermissions).not.toHaveBeenCalled();
  });

  it('an existing listener starts from their own choices', async () => {
    store.set('follow', JSON.stringify({ ids: [fajr.id], known: { [fajr.id]: 'fajr', [maghrib.id]: 'maghrib' }, fresh: [], hint: false }));
    store.set('topics', JSON.stringify([`c-${fajr.id}-rec`]));
    await start();
    expect(screen.getByRole('checkbox', { name: /درس الفجر/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: /درس المغرب/ }).getAttribute('aria-checked')).toBe('false');
    next();
    await heading('استمع مباشرةً');
    expect(switchOf('درس الفجر').getAttribute('aria-checked')).toBe('false');
  });
});

describe('replay from المزيد', () => {
  it('leaving or finishing pops back instead of stacking pages, so back never reopens the tour', async () => {
    seedPrefs(store, FIXTURE_STATE.courses);
    history.replaceState(null, '', '#/more');
    render(<App />);
    fireEvent.click(await screen.findByRole('link', { name: /كيف يعمل التطبيق/ }));
    await heading('أيَّ الدروس تحضر؟');
    const depth = history.length;
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
    await screen.findByRole('link', { name: /كيف يعمل التطبيق/ });
    expect(history.length).toBe(depth);
    fireEvent.click(screen.getByRole('link', { name: /كيف يعمل التطبيق/ }));
    await heading('أيَّ الدروس تحضر؟');
    const replace = vi.spyOn(location, 'replace');
    for (const title of ['استمع مباشرةً', 'راجع الدرس', 'حضّر للدرس القادم']) {
      next();
      await heading(title);
    }
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    await waitFor(() => expect(location.hash).toMatch(/^#\/course\//));
    expect(replace).toHaveBeenCalledWith('#/');
    replace.mockRestore();
  });

  it('starts from the saved switches, and leaving from the first screen saves nothing', async () => {
    seedPrefs(store, FIXTURE_STATE.courses, [fajr.id]);
    const before = store.get('prefs');
    history.replaceState(null, '', '#/more');
    render(<App />);
    fireEvent.click(await screen.findByRole('link', { name: /كيف يعمل التطبيق/ }));
    await heading('أيَّ الدروس تحضر؟');
    expect(screen.getByRole('checkbox', { name: /درس المغرب/ }).getAttribute('aria-checked')).toBe('false');
    next();
    await heading('استمع مباشرةً');
    fireEvent.click(switchOf('درس الفجر'));
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
    await heading('أيَّ الدروس تحضر؟');
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
    await waitFor(() => expect(location.hash).toBe('#/more'));
    expect(store.get('prefs')).toBe(before);
  });
});

describe('a new book in the fresh course list', () => {
  it('is ticked when it inherits the choices of the book it replaced', async () => {
    const api = await import('../src/api');
    const b2 = { ...maghrib, id: 'usul-thalatha', title: 'شرح الأصول الثلاثة' };
    seedPrefs(store, FIXTURE_STATE.courses, [maghrib.id]);
    store.delete('onboarded');
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    let arrive: (v: { state: typeof FIXTURE_STATE; fresh: boolean }) => void = () => {};
    vi.mocked(api.fetchState).mockImplementation(() => new Promise((r) => (arrive = r)));
    await start();
    arrive({ state: { ...FIXTURE_STATE, courses: [fajr, b2] }, fresh: true });
    await screen.findByText(b2.title);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /درس المغرب/ }).getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByRole('checkbox', { name: /درس الفجر/ }).getAttribute('aria-checked')).toBe('false');
  });
});

describe('a notification tapped before the onboarding is done', () => {
  const legacy = () => store.set('follow', JSON.stringify({ ids: [fajr.id, maghrib.id], known: { [fajr.id]: 'fajr', [maghrib.id]: 'maghrib' }, fresh: [], hint: false }));
  async function tap(data: Record<string, string>) {
    const { initPush } = await import('../src/push');
    await initPush();
    const [, listener] = fm.addListener.mock.calls.find(([name]) => name === 'notificationActionPerformed')!;
    await listener({ notification: { data } });
  }

  it('goes where the notification leads, even when the onboarding is already up, and the onboarding waits', async () => {
    legacy();
    await start();
    await tap({ kind: 'rec', courseId: fajr.id, number: '443' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'أيَّ الدروس تحضر؟' })).toBeNull());
    expect(location.hash).toBe(`#/course/${fajr.id}`);
    expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']);
    expect(store.has('onboarded')).toBe(false);
  });
});

