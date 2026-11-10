import { describe, expect, it } from 'vitest';
import { showsNativeUI } from '../src/platform';

describe('showsNativeUI', () => {
  it('shows the apps’ screens in the apps', () => {
    expect(showsNativeUI(true, undefined)).toBe(true);
  });

  it('shows the web’s screens on the web', () => {
    expect(showsNativeUI(false, undefined)).toBe(false);
    expect(showsNativeUI(false, '0')).toBe(false);
  });

  it('shows the apps’ screens in a web build made for store screenshots', () => {
    expect(showsNativeUI(false, '1')).toBe(true);
  });
});
