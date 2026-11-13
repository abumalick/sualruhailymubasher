import { describe, expect, it, vi } from 'vitest';
import { isCancel, shareHint, shareMessage, shareMethod } from '../src/logic/share';
import { shareApp, type ShareEnv } from '../src/share';
import { APP_NAME, SITE } from '../src/site';

describe('shareMethod', () => {
  it('the mobile apps use the native share sheet, even where the WebView has Web Share', () => {
    expect(shareMethod({ native: true, webShare: true, clipboard: true })).toBe('native');
    expect(shareMethod({ native: true, webShare: false, clipboard: false })).toBe('native');
  });

  it('the website uses Web Share where the browser has it', () => {
    expect(shareMethod({ native: false, webShare: true, clipboard: true })).toBe('web');
  });

  it('falls back to copying the link, then to nothing', () => {
    expect(shareMethod({ native: false, webShare: false, clipboard: true })).toBe('copy');
    expect(shareMethod({ native: false, webShare: false, clipboard: false })).toBe('none');
  });
});

describe('shareMessage', () => {
  const m = shareMessage();

  it('shares the website, which sends visitors to the right store', () => {
    expect(m.url).toBe(SITE);
    expect(m.title).toBe(APP_NAME);
  });

  it('names the app and what it offers, without repeating the link the share sheet appends', () => {
    expect(m.text).toContain(APP_NAME);
    expect(m.text).toContain('البث المباشر');
    expect(m.text).toContain('الشيخ عبد الرزاق البدر');
    expect(m.text).not.toContain(SITE);
    expect(m.text).not.toContain('albadrmubasher.com');
  });

  it('never calls the app official', () => {
    expect(m.text.replaceAll('غير رسمي', '')).not.toContain('رسمي');
    expect(m.title).not.toContain('رسمي');
  });

  it('stays short enough for a chat message', () => {
    expect(m.text.length).toBeLessThanOrEqual(160);
  });
});

describe('isCancel', () => {
  it('knows a dismissed share sheet on the web and in the apps', () => {
    expect(isCancel(new DOMException('Share canceled', 'AbortError'))).toBe(true);
    expect(isCancel(new Error('Share canceled'))).toBe(true);
  });

  it('treats anything else as a failure', () => {
    expect(isCancel(new DOMException('Must be handling a user gesture', 'NotAllowedError'))).toBe(false);
    expect(isCancel(new Error('Unsupported url'))).toBe(false);
    expect(isCancel(undefined)).toBe(false);
  });
});

describe('shareHint', () => {
  it('says the link was copied, or shows it when nothing worked', () => {
    expect(shareHint('copied')).toContain('نُسخ الرابط');
    expect(shareHint('failed')).toContain('albadrmubasher.com');
  });

  it('says nothing after a share or a dismissed sheet', () => {
    expect(shareHint('shared')).toBeNull();
    expect(shareHint('cancelled')).toBeNull();
  });
});

describe('shareApp', () => {
  const env = (over: Partial<ShareEnv>): ShareEnv => ({ native: false, nativeShare: vi.fn(async () => {}), ...over });

  it('in the apps opens the native share sheet with the message', async () => {
    const e = env({ native: true, webShare: vi.fn(), copy: vi.fn() });
    expect(await shareApp(e)).toBe('shared');
    expect(e.nativeShare).toHaveBeenCalledWith(shareMessage());
    expect(e.webShare).not.toHaveBeenCalled();
    expect(e.copy).not.toHaveBeenCalled();
  });

  it('on the website opens Web Share with the message', async () => {
    const e = env({ webShare: vi.fn(async () => {}), copy: vi.fn() });
    expect(await shareApp(e)).toBe('shared');
    expect(e.webShare).toHaveBeenCalledWith(shareMessage());
    expect(e.nativeShare).not.toHaveBeenCalled();
    expect(e.copy).not.toHaveBeenCalled();
  });

  it('without Web Share copies the link', async () => {
    const e = env({ copy: vi.fn(async () => {}) });
    expect(await shareApp(e)).toBe('copied');
    expect(e.copy).toHaveBeenCalledWith(SITE);
  });

  it('a dismissed sheet is neither copied nor reported', async () => {
    const web = env({ webShare: vi.fn(async () => Promise.reject(new DOMException('', 'AbortError'))), copy: vi.fn() });
    expect(await shareApp(web)).toBe('cancelled');
    expect(web.copy).not.toHaveBeenCalled();
    const app = env({ native: true, nativeShare: vi.fn(async () => Promise.reject(new Error('Share canceled'))), copy: vi.fn() });
    expect(await shareApp(app)).toBe('cancelled');
    expect(app.copy).not.toHaveBeenCalled();
  });

  it('when sharing fails, copies the link instead', async () => {
    const e = env({ webShare: vi.fn(async () => Promise.reject(new DOMException('', 'NotAllowedError'))), copy: vi.fn(async () => {}) });
    expect(await shareApp(e)).toBe('copied');
    expect(e.copy).toHaveBeenCalledWith(SITE);
  });

  it('reports a failure when the clipboard refuses too, or nothing is available', async () => {
    expect(await shareApp(env({ copy: vi.fn(async () => Promise.reject(new Error('denied'))) }))).toBe('failed');
    expect(await shareApp(env({}))).toBe('failed');
    expect(await shareApp(env({ native: true, nativeShare: vi.fn(async () => Promise.reject(new Error('boom'))) }))).toBe('failed');
  });
});
