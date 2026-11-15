import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
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
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.on, getPlatform: () => (native.on ? 'android' : 'web') } }));
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
    getInfo: async () => ({ version: '1.0.16', build: '16' }),
    addListener: (_: string, h: (e: { canGoBack: boolean }) => void) => {
      back.handler = h;
      return Promise.resolve({ remove: async () => {} });
    },
  },
}));
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(async () => null), fetchState: vi.fn(), fetchLessons: vi.fn(async () => []) }));

vi.mock('../src/site', async (importOriginal) => {
  const site = await importOriginal<typeof import('../src/site')>();
  return { ...site, STORES: [...(await import('./listed-stores')).LISTED_STORES] };
});

import { NOTICE_TITLE } from '@sualruhaily/shared';
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
const LIVE = 'نبّهني عند بدء البث';
const INVITE = 'التنبيهات في تطبيق الجوال';
const ON_SITE = 'متابعة على الموقع';
const REC = 'نبّهني عند نشر التسجيل';
const PREP = 'ذكّرني بالتحضير';
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
    expect(screen.getByRole('checkbox', { name: /درس العصر/ }).getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.nav')).toBeNull();
  });

  it('cannot continue with no lesson ticked', async () => {
    await start();
    fireEvent.click(screen.getByRole('checkbox', { name: /درس الفجر/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /درس العصر/ }));
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
  it('shows a picture of the live notification, worded as the server sends it, that opens the live player', async () => {
    await toLive();
    const pv = document.querySelector('.pv')!;
    expect(pv.textContent).toContain('مثال: هكذا يصلك التنبيه');
    expect(pv.querySelector('.pv-banner b')!.textContent).toBe(NOTICE_TITLE.live);
    expect(pv.querySelector('.pv-banner .bd')!.textContent).toBe(`${fajr.title} · ${fajr.place}`);
    expect(pv.getAttribute('data-to')).toBe('live');
    expect(screen.getByText(/يصلك تنبيه عند بدء البث، فيفتح مشغّل البث المباشر/)).toBeTruthy();
  });

  it('each step starts its own picture, so it never paints the last frame of the step before', async () => {
    await toLive();
    const live = document.querySelector('.pv');
    next();
    await heading('راجع الدرس');
    const rec = document.querySelector('.pv')!;
    expect(rec).not.toBe(live);
    expect(rec.getAttribute('data-banner')).toBe('hidden');
  });

  it('never shows the big red play button, the one a listener tried to tap', async () => {
    await toLive();
    expect(document.querySelector('.disc')).toBeNull();
    expect(document.querySelector('.go-live')).toBeNull();
  });

  it('has one switch for every ticked lesson, on, and none per lesson or for other broadcasts', async () => {
    await toLive();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(switchOf(LIVE).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('درس الفجر ودرس العصر')).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'بث مباشر آخر' })).toBeNull();
  });

  it('keeps the switch in its own block, outside the example card', async () => {
    await toLive();
    const block = switchOf(LIVE).closest('.notifs')!;
    expect(block.closest('.pv')).toBeNull();
    expect(block.contains(document.querySelector('.pv'))).toBe(false);
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

  it('with the live switch off, the ask moves to the revision step', async () => {
    await toLive();
    fireEvent.click(switchOf(LIVE));
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
    expect(switchOf(REC)).toBeTruthy();
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
    const frame = document.querySelector('.pv')!;
    expect(frame.hasAttribute('inert')).toBe(true);
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { hidden: true, name: 'راجعتُه' }));
    const link = frame.querySelector('a')!;
    const before = location.hash;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(location.hash).toBe(before);
    expect([...store.keys()].some((k) => k.startsWith('reviewed:'))).toBe(false);
  });
});

describe('the whole flow', () => {
  it('ends on the lessons with the choices saved, each switch applied to every ticked lesson', async () => {
    await toLive();
    next();
    await heading('راجع الدرس');
    expect(screen.getByText(/الدرس ٤٤٣ · التسجيل متاح/)).toBeTruthy();
    fireEvent.click(switchOf(REC));
    next();
    await heading('حضّر للدرس القادم');
    expect(screen.getByText(`${fajr.title} · ${fajr.place}`)).toBeTruthy();
    expect(screen.getByText(/الفجر: مساء اليوم السابق/)).toBeTruthy();
    expect(screen.getByText(/العصر: قبل الدرس بثلاث ساعات/)).toBeTruthy();
    expect(switchOf(PREP).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    await waitFor(() => expect(tabLabels()).toEqual(['الفجر', 'العصر', 'المزيد']));
    expect(store.get('onboarded')).toBe('1');
    expect(saved().wanted.sort()).toEqual(topicsFor([fajr.id, maghrib.id]).filter((t) => !t.endsWith('-rec')).sort());
  });

  it('other broadcasts follow the live switch, even with only Fajr ticked', async () => {
    await start();
    fireEvent.click(screen.getByRole('checkbox', { name: /درس العصر/ }));
    next();
    await heading('استمع مباشرةً');
    fireEvent.click(switchOf(LIVE));
    for (const title of ['راجع الدرس', 'حضّر للدرس القادم']) {
      next();
      await heading(title);
    }
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    await waitFor(() => expect(store.get('onboarded')).toBe('1'));
    expect(saved().wanted.sort()).toEqual([`c-${fajr.id}-prep`, `c-${fajr.id}-rec`]);
  });

  it('an unticked lesson has no switches and no notifications, yet its tab stays', async () => {
    await start();
    fireEvent.click(screen.getByRole('checkbox', { name: /درس العصر/ }));
    next();
    await heading('استمع مباشرةً');
    expect(within(document.querySelector<HTMLElement>('.notifs')!).getByText('درس الفجر')).toBeTruthy();
    expect(screen.queryByText(/درس العصر/)).toBeNull();
    next();
    await heading('راجع الدرس');
    next();
    await heading('حضّر للدرس القادم');
    expect(screen.getByText('مساء اليوم السابق · ٩:٠٠ م')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    await waitFor(() => expect(tabLabels()).toEqual(['الفجر', 'العصر', 'المزيد']));
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
    next();
    await heading(INVITE);
    fireEvent.click(screen.getByRole('button', { name: ON_SITE }));
    await waitFor(() => expect(store.get('onboarded')).toBe('1'));
    expect(saved().wanted.filter((t: string) => t.startsWith('c-')).sort()).toEqual(topicsFor([maghrib.id]).filter((t) => t !== 'live-other').sort());
    expect(fm.requestPermissions).not.toHaveBeenCalled();
  });

  it('an existing listener starts from their own choices', async () => {
    store.set('follow', JSON.stringify({ ids: [fajr.id], known: { [fajr.id]: 'fajr', [maghrib.id]: 'asr' }, fresh: [], hint: false }));
    store.set('topics', JSON.stringify([`c-${fajr.id}-rec`]));
    await start();
    expect(screen.getByRole('checkbox', { name: /درس الفجر/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: /درس العصر/ }).getAttribute('aria-checked')).toBe('false');
    next();
    await heading('استمع مباشرةً');
    expect(switchOf(LIVE).getAttribute('aria-checked')).toBe('false');
  });
});

// A finger on the step: moves through `points` ([dx, dy] from where it starts), `ms` apart, then lifts.
function drag(on: Element, points: [number, number][], ms = 40) {
  const step = on.closest('.ob')!.querySelector('.obstep')!;
  const at = (x: number, y: number) => ({ clientX: 200 + x, clientY: 400 + y, identifier: 0, target: on });
  let t = 1000;
  const fire = (type: string, x: number, y: number, lifted = false) => {
    const touch = at(x, y);
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { touches: lifted ? [] : [touch], changedTouches: [touch] });
    Object.defineProperty(event, 'timeStamp', { value: t });
    on.dispatchEvent(event);
    t += ms;
  };
  fire('touchstart', 0, 0);
  for (const [x, y] of points) fire('touchmove', x, y);
  const [x, y] = points.at(-1) ?? [0, 0];
  fire('touchend', x, y, true);
  return step;
}
const swipeForward = () => drag(document.querySelector('.obstep h3')!, [[20, 2], [60, 4], [140, 6]]);
const swipeBack = () => drag(document.querySelector('.obstep h3')!, [[-20, 2], [-60, 4], [-140, 6]]);

describe('swiping between steps', () => {
  it('a finger moving from left to right goes to the next step, which comes in from the left; right to left comes back', async () => {
    await start();
    swipeForward();
    await heading('استمع مباشرةً');
    expect(document.querySelector('.obstep')!.className).toBe('obstep in-fwd');
    swipeBack();
    await heading('أيَّ الدروس تحضر؟');
    expect(document.querySelector('.obstep')!.className).toBe('obstep in-back');
  });

  it('the page dots follow the step', async () => {
    await start();
    const dots = () => [...document.querySelectorAll('.dots i')].map((i) => i.className);
    expect(dots()).toEqual(['on', '', '', '']);
    swipeForward();
    await heading('استمع مباشرةً');
    expect(dots()).toEqual(['', 'on', '', '']);
  });

  it('asks the notification permission where continue would, once', async () => {
    await toLive();
    swipeForward();
    await heading('راجع الدرس');
    expect(fm.requestPermissions).toHaveBeenCalledOnce();
    swipeForward();
    await heading('حضّر للدرس القادم');
    expect(fm.requestPermissions).toHaveBeenCalledOnce();
  });

  it('cannot go forward from the first screen with no lesson ticked, as continue cannot', async () => {
    await start();
    fireEvent.click(screen.getByRole('checkbox', { name: /درس الفجر/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /درس العصر/ }));
    swipeForward();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { name: 'أيَّ الدروس تحضر؟' })).toBeTruthy();
  });

  it('cannot go back from the first screen at first launch, where there is no back button', async () => {
    await start();
    swipeBack();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { name: 'أيَّ الدروس تحضر؟' })).toBeTruthy();
  });

  it('on the last step finishes as «ابدأ» does', async () => {
    await toLive();
    for (const title of ['راجع الدرس', 'حضّر للدرس القادم']) {
      next();
      await heading(title);
    }
    swipeForward();
    await waitFor(() => expect(store.get('onboarded')).toBe('1'));
  });

  it('a vertical scroll, even one that drifts sideways later, changes nothing', async () => {
    await toLive();
    drag(document.querySelector('.obstep h3')!, [[2, 20], [10, 60], [160, 80]]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { name: 'استمع مباشرةً' })).toBeTruthy();
  });

  it('a short slow drag snaps back to the same step', async () => {
    await toLive();
    const step = drag(document.querySelector('.obstep h3')!, [[15, 0], [30, 0], [40, 0]], 300);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { name: 'استمع مباشرةً' })).toBeTruthy();
    expect((step as HTMLElement).style.transform).toBe('');
  });

  it('the step follows the finger while it drags, and less where it cannot go', async () => {
    await start();
    const step = document.querySelector<HTMLElement>('.obstep')!;
    const h3 = step.querySelector('h3')!;
    const fire = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true });
      const touch = { clientX: 200 + x, clientY: 400, identifier: 0, target: h3 };
      Object.assign(event, { touches: [touch], changedTouches: [touch] });
      h3.dispatchEvent(event);
    };
    fire('touchstart', 0);
    fire('touchmove', 30);
    await waitFor(() => expect(step.style.transform).toBe('translateX(30px)'));
    fire('touchmove', -40);
    await waitFor(() => expect(step.style.transform).toBe('translateX(-10px)'));
  });

  it('a tap on the switch toggles it and moves nowhere', async () => {
    await toLive();
    const sw = switchOf(LIVE);
    drag(sw, []);
    fireEvent.click(sw);
    expect(switchOf(LIVE).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('heading', { name: 'استمع مباشرةً' })).toBeTruthy();
  });

  it('a tap on a lesson checkbox unticks it and moves nowhere', async () => {
    await start();
    const box = screen.getByRole('checkbox', { name: /درس الفجر/ });
    drag(box, [[3, 2]]);
    fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('heading', { name: 'أيَّ الدروس تحضر؟' })).toBeTruthy();
  });

  it('two fingers (a pinch) are not a swipe', async () => {
    await toLive();
    const h3 = document.querySelector('.obstep h3')!;
    const fire = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true });
      const a = { clientX: 200 + x, clientY: 400, identifier: 0, target: h3 };
      const b = { clientX: 100 - x, clientY: 400, identifier: 1, target: h3 };
      Object.assign(event, { touches: type === 'touchend' ? [] : [a, b], changedTouches: [a, b] });
      h3.dispatchEvent(event);
    };
    fire('touchstart', 0);
    fire('touchmove', 150);
    fire('touchend', 150);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { name: 'استمع مباشرةً' })).toBeTruthy();
  });

  it('with reduced motion the step changes at once, with no slide and no drag', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      await start();
      swipeForward();
      await heading('استمع مباشرةً');
      expect(document.querySelector('.obstep')!.className).toBe('obstep');
      expect(document.querySelector<HTMLElement>('.obstep')!.style.transform).toBe('');
    } finally {
      window.matchMedia = real;
    }
  });

  it('a swipe anywhere on the screen counts, also on the page dots above the step', async () => {
    await toLive();
    drag(document.querySelector('.dots')!, [[-20, 2], [-60, 4], [-140, 6]]);
    await heading('أيَّ الدروس تحضر؟');
  });

  it('the back button also slides the step in from the right', async () => {
    await toLive();
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
    await heading('أيَّ الدروس تحضر؟');
    expect(document.querySelector('.obstep')!.className).toBe('obstep in-back');
  });
});

describe('on the web', () => {
  beforeEach(() => {
    native.on = false;
    localStorage.clear();
  });
  async function toInvite() {
    await start();
    for (const h of ['استمع مباشرةً', 'راجع الدرس', 'حضّر للدرس القادم', INVITE]) {
      next();
      await heading(h);
    }
  }

  it('the previews show no notification, the steps have no switch, and there are five steps', async () => {
    await toLive();
    expect(document.querySelector('.pv-banner')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(document.querySelectorAll('.dots i')).toHaveLength(5);
  });

  it('the big red play button appears only inside the picture, which ignores taps', async () => {
    await toLive();
    const discs = [...document.querySelectorAll('.disc')];
    expect(discs.length).toBeGreaterThan(0);
    expect(discs.every((d) => d.closest('.pv[inert]'))).toBe(true);
    expect([...document.querySelectorAll('.go-live')].every((d) => d.closest('.pv[inert]'))).toBe(true);
  });

  it('the last step invites to the app, with its notification and the store badges', async () => {
    await toInvite();
    expect(screen.getByText(/لا تصل التنبيهات على الموقع/)).toBeTruthy();
    expect(document.querySelector('.pv-banner b')!.textContent).toBe(NOTICE_TITLE.live);
    expect(document.querySelectorAll('.obstores a')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'ابدأ' })).toBeNull();
  });

  it('«متابعة على الموقع» finishes, saves the lessons, and the install banner stays hidden for this visit', async () => {
    await toInvite();
    fireEvent.click(screen.getByRole('button', { name: ON_SITE }));
    await waitFor(() => expect(store.get('onboarded')).toBe('1'));
    await waitFor(() => expect(document.querySelector('.nav')).not.toBeNull());
    expect(document.querySelector('aside.install')).toBeNull();
    expect(localStorage.getItem('install-banner-dismissed')).toBeNull();
    expect(fm.requestPermissions).not.toHaveBeenCalled();
  });

  it('with no lesson listed, the invite has the text, the badges and the button, without a picture', async () => {
    const api = await import('../src/api');
    vi.mocked(api.fetchState).mockResolvedValue({ state: { ...FIXTURE_STATE, courses: [] }, fresh: true });
    await toInvite();
    expect(document.querySelector('.pv')).toBeNull();
    expect(document.querySelectorAll('.obstores a')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: ON_SITE }));
    await waitFor(() => expect(store.get('onboarded')).toBe('1'));
  });

  it('a replay from المزيد reaches the invite, and finishing pops back as in the apps', async () => {
    seedPrefs(store, FIXTURE_STATE.courses);
    store.set('onboarded', '1');
    history.replaceState(null, '', '#/more');
    render(<App />);
    fireEvent.click(await screen.findByRole('link', { name: /كيف يعمل التطبيق/ }));
    await heading('أيَّ الدروس تحضر؟');
    const replace = vi.spyOn(location, 'replace');
    for (const h of ['استمع مباشرةً', 'راجع الدرس', 'حضّر للدرس القادم', INVITE]) {
      next();
      await heading(h);
    }
    fireEvent.click(screen.getByRole('button', { name: ON_SITE }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('#/'));
    replace.mockRestore();
  });
});

describe('in the apps', () => {
  it('there are four steps, no invite, and «ابدأ» on preparation', async () => {
    await start();
    expect(document.querySelectorAll('.dots i')).toHaveLength(4);
    for (const h of ['استمع مباشرةً', 'راجع الدرس', 'حضّر للدرس القادم']) {
      next();
      await heading(h);
    }
    expect(screen.getByRole('button', { name: 'ابدأ' })).toBeTruthy();
  });
});

describe('with no lesson listed', () => {
  it('only the live step has a switch, for other broadcasts; revision and preparation have none', async () => {
    const api = await import('../src/api');
    vi.mocked(api.fetchState).mockResolvedValue({ state: { ...FIXTURE_STATE, courses: [] }, fresh: true });
    await start();
    next();
    await heading('استمع مباشرةً');
    expect(switchOf(LIVE).getAttribute('aria-checked')).toBe('true');
    next();
    await heading('راجع الدرس');
    expect(screen.queryByRole('switch')).toBeNull();
    next();
    await heading('حضّر للدرس القادم');
    expect(screen.queryByRole('switch')).toBeNull();
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
    expect(screen.getByRole('checkbox', { name: /درس العصر/ }).getAttribute('aria-checked')).toBe('false');
    next();
    await heading('استمع مباشرةً');
    fireEvent.click(switchOf(LIVE));
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
    await heading('أيَّ الدروس تحضر؟');
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
    await waitFor(() => expect(location.hash).toBe('#/more'));
    expect(store.get('prefs')).toBe(before);
  });

  it('keeps the per-lesson detail set in Notifications when the tour is finished untouched', async () => {
    seedPrefs(store, FIXTURE_STATE.courses);
    const mixed = { wanted: [`c-${fajr.id}-live`, `c-${fajr.id}-rec`, `c-${maghrib.id}-prep`], known: FIXTURE_STATE.courses.map((c) => [c.id, c.slot]) };
    store.set('prefs', JSON.stringify(mixed));
    history.replaceState(null, '', '#/more');
    render(<App />);
    fireEvent.click(await screen.findByRole('link', { name: /كيف يعمل التطبيق/ }));
    await heading('أيَّ الدروس تحضر؟');
    for (const [title, name] of [['استمع مباشرةً', LIVE], ['راجع الدرس', REC], ['حضّر للدرس القادم', PREP]]) {
      next();
      await heading(title);
      expect(switchOf(name).getAttribute('aria-checked')).toBe('true');
    }
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    await waitFor(() => expect(location.hash).toMatch(/^#\/course\//));
    expect(saved().wanted.sort()).toEqual([...mixed.wanted].sort());
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
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /درس العصر/ }).getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByRole('checkbox', { name: /درس الفجر/ }).getAttribute('aria-checked')).toBe('false');
  });
});

describe('a notification tapped before the onboarding is done', () => {
  const legacy = () => store.set('follow', JSON.stringify({ ids: [fajr.id, maghrib.id], known: { [fajr.id]: 'fajr', [maghrib.id]: 'asr' }, fresh: [], hint: false }));
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
    expect(tabLabels()).toEqual(['الفجر', 'العصر', 'المزيد']);
    expect(store.has('onboarded')).toBe(false);
  });
});

