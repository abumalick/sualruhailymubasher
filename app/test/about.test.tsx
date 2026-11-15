import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { INDEPENDENT_NOTICE } from '@sualruhaily/shared';
import { STORES } from '../src/site';
import { About } from '../src/ui/About';

afterEach(cleanup);

describe('About with no store listed', () => {
  it('lists no store', () => {
    expect(STORES).toEqual([]);
  });

  it.each([true, false])('states the independent-app notice (native %s)', (native) => {
    const { container } = render(<About native={native} />);
    expect(container.textContent).toContain(INDEPENDENT_NOTICE);
  });

  it('has no mobile-app section on the web while no store is listed', () => {
    render(<About native={false} />);
    expect(screen.queryByText('تطبيق الجوال')).toBeNull();
    expect(screen.queryByText(/لا تتوفر التنبيهات في نسخة المتصفح/)).toBeNull();
  });
});
