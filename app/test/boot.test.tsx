import { render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/api', () => ({
  loadCachedState: async () => null,
  fetchState: async () => {
    throw new Error('offline');
  },
  fetchLessons: async () => [],
}));

import { App } from '../src/App';

describe('boot', () => {
  it('renders the RTL shell with the name and the four web tabs', () => {
    render(<App />);
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(screen.getByRole('heading', { name: 'عبد الرزاق البدر' })).toBeTruthy();
    for (const label of ['الرئيسية', 'الدروس', 'عن التطبيق', 'روابط']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
