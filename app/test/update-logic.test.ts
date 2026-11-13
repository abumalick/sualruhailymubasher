import { describe, expect, it } from 'vitest';
import { updateStatus, updateUrl } from '../src/logic/update';

const policy = { android: { min: '1.0.17', latest: '1.0.19' }, ios: { min: null, latest: '1.0.18' } };
const at = (installed: string | null, extra: Partial<Parameters<typeof updateStatus>[0]> = {}) =>
  updateStatus({ platform: 'android', installed, policy, dismissed: null, ...extra });

describe('updateStatus', () => {
  it('requires an update below the minimum', () => {
    expect(at('1.0.16')).toEqual({ kind: 'required', version: '1.0.19' });
  });

  it('offers an update between the minimum and the latest', () => {
    expect(at('1.0.17')).toEqual({ kind: 'available', version: '1.0.19' });
    expect(at('1.0.18')).toEqual({ kind: 'available', version: '1.0.19' });
  });

  it('asks nothing of the latest version, or of a newer one the store has not caught up with', () => {
    expect(at('1.0.19')).toEqual({ kind: 'none', version: null });
    expect(at('1.0.20')).toEqual({ kind: 'none', version: null });
  });

  it('reads each platform on its own', () => {
    expect(at('1.0.16', { platform: 'ios' })).toEqual({ kind: 'available', version: '1.0.18' });
  });

  it('stays quiet once the listener closed the notice for that version, and comes back for a newer one', () => {
    expect(at('1.0.17', { dismissed: '1.0.19' }).kind).toBe('none');
    expect(at('1.0.17', { dismissed: '1.0.18' }).kind).toBe('available');
  });

  it('never lets a dismissal hide a required update', () => {
    expect(at('1.0.16', { dismissed: '1.0.19' }).kind).toBe('required');
  });

  it('fails open on anything it cannot read', () => {
    expect(at('1.0.16', { platform: 'web' }).kind).toBe('none');
    expect(at(null).kind).toBe('none');
    expect(at('dev').kind).toBe('none');
    expect(at('1.0.16', { policy: null }).kind).toBe('none');
    expect(at('1.0.16', { policy: {} }).kind).toBe('none');
    expect(at('1.0.16', { policy: { android: { min: null, latest: null } } }).kind).toBe('none');
  });
});

describe('updateUrl', () => {
  it('opens each platform store', () => {
    expect(updateUrl('android')).toBe('https://play.google.com/store/apps/details?id=com.albadrmubasher.app');
    expect(updateUrl('ios')).toBe('https://apps.apple.com/app/id6832876968');
  });

  it('opens the build-time link instead in the sideloaded APK', () => {
    expect(updateUrl('android', 'https://example.com/latest')).toBe('https://example.com/latest');
    expect(updateUrl('ios', 'https://example.com/latest')).toBe('https://apps.apple.com/app/id6832876968');
  });
});
