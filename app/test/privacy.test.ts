import { describe, expect, it } from 'vitest';
import html from '../public/privacy.html?raw';

const doc = new DOMParser().parseFromString(html, 'text/html');
const attribution = (lang: string) => {
  const legal = [...doc.querySelectorAll(`section[lang="${lang}"] > .legal`)];
  expect(legal.at(-1)).toBe(doc.querySelector(`section[lang="${lang}"]`)!.lastElementChild);
  return legal.map((p) => p.textContent!.replace(/\s+/g, ' ').trim()).join(' ');
};

describe('privacy page trademark attribution (store badges)', () => {
  it('ends the English section with the Apple and Google wording', () => {
    const text = attribution('en');
    expect(text).toContain(
      'Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries and regions. App Store is a service mark of Apple Inc.',
    );
    expect(text).toContain('Google Play and the Google Play logo are trademarks of Google LLC.');
  });

  it('ends the Arabic section with the same attribution in Arabic', () => {
    const text = attribution('ar');
    expect(text).toContain('Apple Inc.');
    expect(text).toContain('App Store');
    expect(text).toContain('Google LLC');
    expect(text).toContain('Google Play');
    expect(text).toMatch(/علامتان تجاريتان/);
  });
});
