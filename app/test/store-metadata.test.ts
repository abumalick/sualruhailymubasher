// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const meta = fileURLToPath(new URL('../../fastlane/metadata/', import.meta.url));
const read = (path: string) => readFileSync(meta + path, 'utf8').trim();
const chars = (s: string) => [...s].length;
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

const LISTINGS = [
  { store: 'ios', lang: 'ar-SA', limits: { 'name.txt': 30, 'subtitle.txt': 30, 'description.txt': 4000 } },
  { store: 'ios', lang: 'en-US', limits: { 'name.txt': 30, 'subtitle.txt': 30, 'description.txt': 4000 } },
  { store: 'android', lang: 'ar', limits: { 'title.txt': 30, 'short_description.txt': 80, 'full_description.txt': 4000 } },
  { store: 'android', lang: 'en-US', limits: { 'title.txt': 30, 'short_description.txt': 80, 'full_description.txt': 4000 } },
] as const;

const DESCRIPTION = { ios: 'description.txt', android: 'full_description.txt' } as const;

describe.each(LISTINGS)('$store $lang listing', ({ store, lang, limits }) => {
  it.each(Object.entries(limits))('%s fits the store limit of %i characters', (file, limit) => {
    const text = read(`${store}/${lang}/${file}`);
    expect(text).not.toBe('');
    expect(chars(text)).toBeLessThanOrEqual(limit);
  });

  it('uses no emoji', () => {
    for (const file of Object.keys(limits)) expect(read(`${store}/${lang}/${file}`)).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('says the app is unofficial and never calls it official', () => {
    const text = read(`${store}/${lang}/${DESCRIPTION[store]}`);
    const [unofficial, official] = lang.startsWith('ar') ? [/غير رسمي/g, /رسمي/g] : [/unofficial/gi, /official/gi];
    const said = text.match(unofficial)?.length ?? 0;
    expect(said).toBeGreaterThan(0);
    expect(text.match(official)?.length).toBe(said);
  });
});

describe.each(['ar-SA', 'en-US'])('ios %s keywords', (lang) => {
  const keywords = read(`ios/${lang}/keywords.txt`);

  it('fit in 100 bytes', () => {
    expect(bytes(keywords)).toBeLessThanOrEqual(100);
  });

  it('are comma-separated, with no spaces around the commas, no empty or repeated entry', () => {
    expect(keywords).not.toMatch(/\s,|,\s/);
    const list = keywords.split(',');
    expect(list.every((k) => k.trim() === k && k !== '')).toBe(true);
    expect(new Set(list).size).toBe(list.length);
  });
});
