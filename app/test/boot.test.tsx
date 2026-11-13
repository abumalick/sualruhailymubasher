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
  it('renders an empty RTL shell until the stored choices are read, so nothing flashes', async () => {
    render(<App />);
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.querySelector('.nav')).toBeNull();
    await screen.findByText('نحتاج اتصالًا بالإنترنت لعرض الدروس');
  });
});
