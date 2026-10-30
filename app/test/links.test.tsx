import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { Links } from '../src/ui/Links';

afterEach(cleanup);

describe('Links', () => {
  it('lists every link as an external anchor', () => {
    render(<Links state={FIXTURE_STATE} />);
    const anchors = screen.getAllByRole('link');
    expect(anchors).toHaveLength(FIXTURE_STATE.links.length);
    anchors.forEach((a, i) => {
      expect(a.getAttribute('href')).toBe(FIXTURE_STATE.links[i].url);
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    });
    expect(screen.getByText('قناة التلغرام')).toBeTruthy();
  });

  it('renders nothing but the header without state', () => {
    render(<Links state={null} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
