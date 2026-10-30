import { render, screen } from '@testing-library/preact';
import { beforeAll, expect, it } from 'vitest';
import { LiveSheet } from '../src/ui/LiveSheet';

beforeAll(() => {
  const { settings } = (window as unknown as { happyDOM: { settings: Record<string, boolean> } }).happyDOM;
  settings.disableIframePageLoading = false;
  settings.enableIframePageLoading = true;
});

it('embeds the Mixlr page with autoplay and the keep-screen-open note', () => {
  const live = { isLive: true, mode: 'embed' as const, embedUrl: 'about:blank#mixlr', streamUrl: null, courseId: null, startedAt: null };
  const { container } = render(<LiveSheet live={live} onClose={() => {}} />);
  const frame = container.querySelector('iframe')!;
  expect(frame.getAttribute('src')).toBe(live.embedUrl);
  expect(frame.getAttribute('allow')).toBe('autoplay');
  expect(screen.getByText('لمواصلة الاستماع أبقِ الشاشة مفتوحة')).toBeTruthy();
});
