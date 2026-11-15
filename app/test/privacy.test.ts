import { describe, expect, it } from 'vitest';
import { INDEPENDENT_NOTICE } from '@sualruhaily/shared';
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
    expect(attribution('ar')).toBe(
      'Apple وشعار Apple علامتان تجاريتان لشركة Apple Inc.، مسجّلتان في الولايات المتحدة وبلدان ومناطق أخرى. وApp Store علامة خدمة لشركة Apple Inc. Google Play وشعار Google Play علامتان تجاريتان لشركة Google LLC.',
    );
  });
});

describe('privacy page independent-app notice', () => {
  it('carries exactly the shared INDEPENDENT_NOTICE in the Arabic section', () => {
    const paragraphs = [...doc.querySelectorAll('section[lang="ar"] p')].map((p) => p.textContent!.replace(/\s+/g, ' ').trim());
    expect(paragraphs).toContain(INDEPENDENT_NOTICE);
  });
});
