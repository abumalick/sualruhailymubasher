import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PlayerState } from '../src/audio/player';

const fake = vi.hoisted(() => {
  const listeners = new Set<(s: PlayerState) => void>();
  const p = {
    state: null as unknown as PlayerState,
    seek: vi.fn(),
    skip: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(async () => {}),
    onChange: (cb: (s: PlayerState) => void) => (listeners.add(cb), () => void listeners.delete(cb)),
    emit: (patch: Partial<PlayerState>) => {
      p.state = { ...p.state, ...patch };
      listeners.forEach((l) => l(p.state));
    },
  };
  return p;
});
vi.mock('../src/audio/player', () => ({ player: fake }));

import { MiniPlayer } from '../src/ui/MiniPlayer';

const REC = { kind: 'recording' as const, url: 'https://x/459.mp3', title: 'شرح كتاب التوحيد · الدرس ٤٥٩', subtitle: 'تفسير سورة التوبة: من الآية (١)' };
const LIVE = { kind: 'live' as const, url: 'https://x/live', title: 'شرح كتاب الكبائر للذهبي', subtitle: '' };
const RAIL = { left: 100, width: 200 };

beforeEach(() => {
  fake.state = { src: REC, playing: true, position: 120, duration: 3600, error: null };
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...RAIL, right: 300, top: 0, bottom: 44, height: 44, x: 100, y: 0, toJSON() {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const slider = () => screen.getByRole('slider');
const elapsed = () => document.querySelector('.seek time span')!.textContent;

it('shows the elapsed time and the duration in Arabic digits', () => {
  render(<MiniPlayer />);
  expect([...document.querySelectorAll('.seek time')].map((t) => t.firstElementChild!.textContent)).toEqual(['٠:٠٢:٠٠', '١:٠٠:٠٠']);
  expect(slider().getAttribute('aria-valuetext')).toBe('٠:٠٢:٠٠ من ١:٠٠:٠٠');
  expect(slider().getAttribute('aria-valuenow')).toBe('120');
  expect(slider().getAttribute('aria-valuemax')).toBe('3600');
});

it('fills the bar with the position and follows the player', () => {
  render(<MiniPlayer />);
  const fill = document.querySelector<HTMLElement>('.rail .prog')!;
  expect(fill.style.width).toBe(`${(120 / 3600) * 100}%`);
  act(() => fake.emit({ position: 1800 }));
  expect(fill.style.width).toBe('50%');
  expect(elapsed()).toBe('٠:٣٠:٠٠');
});

it('the 15 second buttons skip back and forward', () => {
  render(<MiniPlayer />);
  fireEvent.click(screen.getByRole('button', { name: 'رجوع ١٥ ثانية' }));
  fireEvent.click(screen.getByRole('button', { name: 'تقديم ١٥ ثانية' }));
  expect(fake.skip.mock.calls).toEqual([[-15], [15]]);
});

it('a tap on the bar jumps there', () => {
  render(<MiniPlayer />);
  fireEvent.pointerDown(slider(), { clientX: 250, pointerId: 1 });
  fireEvent.pointerUp(slider(), { clientX: 250, pointerId: 1 });
  expect(fake.seek.mock.calls).toEqual([[2700]]);
});

it('a drag moves the shown time and seeks once, on release', () => {
  render(<MiniPlayer />);
  fireEvent.pointerDown(slider(), { clientX: 120, pointerId: 1 });
  fireEvent.pointerMove(slider(), { clientX: 150, pointerId: 1 });
  fireEvent.pointerMove(slider(), { clientX: 200, pointerId: 1 });
  expect(elapsed()).toBe('٠:٣٠:٠٠');
  act(() => fake.emit({ position: 121 }));
  expect(elapsed()).toBe('٠:٣٠:٠٠');
  expect(fake.seek).not.toHaveBeenCalled();
  fireEvent.pointerMove(slider(), { clientX: 900, pointerId: 1 });
  fireEvent.pointerUp(slider(), { clientX: 900, pointerId: 1 });
  expect(fake.seek.mock.calls).toEqual([[3600]]);
});

it('a moved pointer without a press does nothing', () => {
  render(<MiniPlayer />);
  fireEvent.pointerMove(slider(), { clientX: 200, pointerId: 1 });
  fireEvent.pointerUp(slider(), { clientX: 200, pointerId: 1 });
  expect(elapsed()).toBe('٠:٠٢:٠٠');
  expect(fake.seek).not.toHaveBeenCalled();
});

it('a second finger on the bar neither moves nor ends the drag of the first', () => {
  render(<MiniPlayer />);
  fireEvent.pointerDown(slider(), { clientX: 150, pointerId: 1, isPrimary: true });
  fireEvent.pointerDown(slider(), { clientX: 280, pointerId: 2, isPrimary: false });
  fireEvent.pointerMove(slider(), { clientX: 280, pointerId: 2, isPrimary: false });
  fireEvent.pointerUp(slider(), { clientX: 280, pointerId: 2, isPrimary: false });
  expect(fake.seek).not.toHaveBeenCalled();
  fireEvent.pointerMove(slider(), { clientX: 200, pointerId: 1, isPrimary: true });
  fireEvent.pointerUp(slider(), { clientX: 200, pointerId: 1, isPrimary: true });
  expect(fake.seek.mock.calls).toEqual([[1800]]);
});

it('a right click does not start a drag', () => {
  render(<MiniPlayer />);
  fireEvent.pointerDown(slider(), { clientX: 200, pointerId: 1, button: 2 });
  fireEvent.pointerUp(slider(), { clientX: 200, pointerId: 1, button: 2 });
  expect(fake.seek).not.toHaveBeenCalled();
});

it('a drag whose pointer capture is lost ends without seeking', () => {
  render(<MiniPlayer />);
  fireEvent.pointerDown(slider(), { clientX: 200, pointerId: 1 });
  fireEvent(slider(), new PointerEvent('lostpointercapture', { pointerId: 1 }));
  fireEvent.pointerMove(slider(), { clientX: 250, pointerId: 1 });
  fireEvent.pointerUp(slider(), { clientX: 250, pointerId: 1 });
  expect(elapsed()).toBe('٠:٠٢:٠٠');
  expect(fake.seek).not.toHaveBeenCalled();
});

it('a drag in progress does not carry over to the next recording', () => {
  render(<MiniPlayer />);
  fireEvent.pointerDown(slider(), { clientX: 200, pointerId: 1 });
  act(() => fake.emit({ src: { ...REC, url: 'https://x/460.mp3' }, position: 0 }));
  expect(elapsed()).toBe('٠:٠٠:٠٠');
  fireEvent.pointerUp(slider(), { clientX: 250, pointerId: 1 });
  expect(fake.seek).not.toHaveBeenCalled();
});

it('a cancelled drag goes back to the playing position without seeking', () => {
  render(<MiniPlayer />);
  fireEvent.pointerDown(slider(), { clientX: 200, pointerId: 1 });
  fireEvent.pointerCancel(slider(), { pointerId: 1 });
  expect(elapsed()).toBe('٠:٠٢:٠٠');
  expect(fake.seek).not.toHaveBeenCalled();
});

it('the arrow keys move 15 seconds the way the bar fills', () => {
  render(<MiniPlayer />);
  fireEvent.keyDown(slider(), { key: 'ArrowRight' });
  fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
  fireEvent.keyDown(slider(), { key: 'End' });
  fireEvent.keyDown(slider(), { key: 'a' });
  expect(fake.seek.mock.calls).toEqual([[135], [105], [3600]]);
});

it('stays still while the duration is not known yet', () => {
  fake.state = { ...fake.state, position: 0, duration: 0 };
  render(<MiniPlayer />);
  expect(slider().getAttribute('aria-disabled')).toBe('true');
  expect(elapsed()).toBe('٠:٠٠');
  expect(document.querySelectorAll('.seek time')[1].firstElementChild!.textContent).toBe('--:--');
  fireEvent.pointerDown(slider(), { clientX: 200, pointerId: 1 });
  fireEvent.pointerUp(slider(), { clientX: 200, pointerId: 1 });
  fireEvent.keyDown(slider(), { key: 'End' });
  expect(fake.seek).not.toHaveBeenCalled();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'تقديم ١٥ ثانية' }).disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'رجوع ١٥ ثانية' }).disabled).toBe(true);
});

it('the play button still pauses and resumes', () => {
  render(<MiniPlayer />);
  fireEvent.click(screen.getByRole('button', { name: 'إيقاف مؤقت' }));
  expect(fake.pause).toHaveBeenCalled();
});

it('the live stream keeps its one-row player, without a bar or skip buttons', () => {
  fake.state = { src: LIVE, playing: true, position: 40, duration: 0, error: null };
  const { container } = render(<MiniPlayer />);
  expect(screen.queryByRole('slider')).toBeNull();
  expect(container.innerHTML).toBe(
    '<div class="mp"><button class="mini" aria-label="إيقاف مؤقت"><svg aria-hidden="true"><use href="#i-pause"></use></svg></button><div class="t"><span class="b">شرح كتاب الكبائر للذهبي</span><span class="m">بث مباشر</span></div></div>',
  );
});
