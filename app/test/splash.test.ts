// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from '../capacitor.config';
import { launchHideCanBeLost } from '../src/logic/splash';

describe('launchHideCanBeLost', () => {
  it('is false when the plugin hides the launch splash itself', () => {
    expect(launchHideCanBeLost({ launchAutoHide: true })).toBe(false);
    expect(launchHideCanBeLost({})).toBe(false);
  });

  it('is true for a manual hide with the default 200 ms launch fade-out', () => {
    expect(launchHideCanBeLost({ launchAutoHide: false })).toBe(true);
    expect(launchHideCanBeLost({ launchAutoHide: false, launchFadeOutDuration: 200 })).toBe(true);
  });

  it('is false for a manual hide without a launch fade-out', () => {
    expect(launchHideCanBeLost({ launchAutoHide: false, launchFadeOutDuration: 0 })).toBe(false);
  });
});

describe('capacitor SplashScreen config', () => {
  it('cannot drop the hide the app sends once its data is ready', () => {
    expect(launchHideCanBeLost(config.plugins!.SplashScreen as object)).toBe(false);
  });
});
