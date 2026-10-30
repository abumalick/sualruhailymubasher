import { describe, expect, it } from 'vitest';
import sub481 from './fixtures/sub481.html?raw';
import sub456First from './fixtures/sub456-first.html?raw';
import detail from './fixtures/detail-tawhid-002.html?raw';
import {
  fetchLatestLessons,
  lastPageOffset,
  parseDetailMp3,
  parseSeriesPage,
} from '../src/sources/albadr';

const link = (path: string, title: string) => `<h3><a href="${path}" title="">${title}</a></h3>`;

describe('parseSeriesPage', () => {
  const entries = parseSeriesPage(sub481);

  it('parses the first lesson', () => {
    expect(entries).toContainEqual({
      number: 1,
      startPoint: 'المقدمة',
      hijriDate: '09-05-1448',
      detailPath: '/detail/xvIUF4gnhtkz',
    });
  });

  it('keeps the ellipsis in the start point', () => {
    const second = entries.find((e) => e.number === 2)!;
    expect(second.startPoint.startsWith('من قوله: الثالث توحيد الألوهية')).toBe(true);
    expect(second.startPoint.endsWith('…')).toBe(true);
  });

  it('dedupes title and play-icon links and skips non-lessons', () => {
    const paths = entries.map((e) => e.detailPath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(entries.some((e) => e.startPoint.includes('وصايا'))).toBe(false);
    expect(entries.every((e) => Number.isInteger(e.number))).toBe(true);
  });

  it('normalizes Arabic-Indic digits in the number and date only', () => {
    const html = link('/detail/abc', '٠٠٣ من الآية ٢٧ إلى ٣٠ ١١-٠٥-١٤٤٨');
    expect(parseSeriesPage(html)).toEqual([
      { number: 3, startPoint: 'من الآية ٢٧ إلى ٣٠', hijriDate: '11-05-1448', detailPath: '/detail/abc' },
    ]);
  });

  it('decodes entities in one pass and keeps an out-of-range one', () => {
    const html = link('/detail/e', '007 &#38;lt; &#99999999; &amp;quot; 03-01-1448');
    expect(parseSeriesPage(html).map((e) => e.startPoint)).toEqual(['&lt; &#99999999; &quot;']);
  });

  it('decodes &nbsp; and numeric entities', () => {
    const html = link('/detail/n', '006&nbsp;قوله&#58; &#x627;لله&#39;s 02-01-1448');
    expect(parseSeriesPage(html)).toEqual([
      { number: 6, startPoint: "قوله: الله's", hijriDate: '02-01-1448', detailPath: '/detail/n' },
    ]);
  });

  it('decodes entities and skips titles without number or date', () => {
    const html =
      link('/detail/a', '004 &quot;س&quot; &amp; ص 01-01-1448') +
      link('/detail/b', 'وصايا وتوجيهات') +
      link('/detail/c', '005 بلا تاريخ');
    expect(parseSeriesPage(html).map((e) => e.startPoint)).toEqual(['"س" & ص']);
  });
});

describe('lastPageOffset', () => {
  it('returns the max page offset for the series', () => {
    expect(lastPageOffset(sub456First, 456)).toBe(440);
  });

  it('ignores other series and returns 0 without pagination', () => {
    expect(lastPageOffset(sub456First, 481)).toBe(0);
    expect(lastPageOffset('<html></html>', 456)).toBe(0);
  });
});

describe('parseDetailMp3', () => {
  it('upgrades to https without www', () => {
    expect(parseDetailMp3(detail)).toBe(
      'https://al-badr.net/download/esound/choroohat/taohid/taqrirat-ala-kitab-tauhid/002.mp3',
    );
  });

  it('returns null when absent', () => {
    expect(parseDetailMp3('<html></html>')).toBeNull();
  });
});

describe('fetchLatestLessons', () => {
  const page = (nums: number[], pages: number[] = []) =>
    nums.map((n) => link(`/detail/d${n}`, `${String(n).padStart(3, '0')} نقطة ${n} 01-01-1448`)).join('') +
    pages.map((p) => `<a href="/sub/9/?q=&amp;page=${p}">x</a>`).join('');

  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  const fakeFetch = (pages: Record<string, string>, calls: string[] = []) =>
    (async (url: string) => {
      calls.push(url);
      const body = pages[url];
      return body === undefined ? new Response('no', { status: 500 }) : new Response(body);
    }) as unknown as typeof fetch;

  it('fetches last page and the previous one when the last is short', async () => {
    const calls: string[] = [];
    const f = fakeFetch(
      {
        'https://al-badr.net/sub/9/?q=&page=0': page(range(1, 20), [20, 40]),
        'https://al-badr.net/sub/9/?q=&page=40': page([41, 42]),
        'https://al-badr.net/sub/9/?q=&page=20': page(range(21, 40)),
      },
      calls,
    );
    const out = await fetchLatestLessons(9, f);
    expect(out.map((e) => e.number)).toEqual([21, ...range(22, 40), 41, 42]);
    expect(calls).toHaveLength(3);
  });

  it('skips the previous page when the last has at least 5 entries', async () => {
    const calls: string[] = [];
    const f = fakeFetch(
      {
        'https://al-badr.net/sub/9/?q=&page=0': page(range(1, 20), [20]),
        'https://al-badr.net/sub/9/?q=&page=20': page(range(21, 26)),
      },
      calls,
    );
    const out = await fetchLatestLessons(9, f);
    expect(out.map((e) => e.number)).toEqual(range(21, 26));
    expect(calls).toHaveLength(2);
  });

  it('uses the first page when there is no pagination', async () => {
    const f = fakeFetch({ 'https://al-badr.net/sub/9/?q=&page=0': page([2, 1]) });
    expect((await fetchLatestLessons(9, f)).map((e) => e.number)).toEqual([1, 2]);
  });

  it('throws on a non-OK response', async () => {
    await expect(fetchLatestLessons(9, fakeFetch({}))).rejects.toThrow();
  });
});
