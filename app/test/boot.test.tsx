import { render } from '@testing-library/preact';
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
  it('renders the RTL shell with only المزيد before any state', () => {
    render(<App />);
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect([...document.querySelectorAll('.nav a')].map((a) => a.textContent)).toEqual(['المزيد']);
  });
});
