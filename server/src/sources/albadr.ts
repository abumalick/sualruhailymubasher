export interface SeriesEntry {
  number: number;
  startPoint: string;
  hijriDate: string;
  detailPath: string;
}

const ARABIC_INDIC_ZERO = 0x0660;
const ENTRY_RE = /<a\s+href="(\/detail\/[^"]+)"[^>]*>([^<]*)<\/a>/g;
const TITLE_RE = /^\s*(\d{1,4})\s+(.+?)\s+(\d{2}-\d{2}-\d{4})\s*$/;
const MP3_RE = /https?:\/\/(?:www\.)?al-badr\.net\/download\/[^"' ]+\.mp3/;

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO));

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

export function parseSeriesPage(html: string): SeriesEntry[] {
  const seen = new Set<string>();
  const entries: SeriesEntry[] = [];
  for (const m of html.matchAll(ENTRY_RE)) {
    const detailPath = m[1]!;
    if (seen.has(detailPath)) continue;
    const t = TITLE_RE.exec(toLatinDigits(decodeEntities(m[2]!)));
    if (!t) continue;
    seen.add(detailPath);
    entries.push({ number: Number(t[1]), startPoint: t[2]!, hijriDate: t[3]!, detailPath });
  }
  return entries;
}

export function lastPageOffset(html: string, seriesId: number): number {
  const re = new RegExp(`/sub/${seriesId}/\\?q=(?:&amp;|&)page=(\\d+)`, 'g');
  let max = 0;
  for (const m of html.matchAll(re)) max = Math.max(max, Number(m[1]));
  return max;
}

export function parseDetailMp3(html: string): string | null {
  const m = MP3_RE.exec(html);
  if (!m) return null;
  return m[0].replace(/^http:\/\/(?:www\.)?/, 'https://').replace('://www.', '://');
}

const pageUrl = (seriesId: number, offset: number) =>
  `https://al-badr.net/sub/${seriesId}/?q=&page=${offset}`;

async function fetchPage(seriesId: number, offset: number, f: typeof fetch): Promise<string> {
  const res = await f(pageUrl(seriesId, offset));
  if (!res.ok) throw new Error(`al-badr.net series ${seriesId} page ${offset}: HTTP ${res.status}`);
  return res.text();
}

export async function fetchLatestLessons(seriesId: number, f: typeof fetch): Promise<SeriesEntry[]> {
  const firstHtml = await fetchPage(seriesId, 0, f);
  const last = lastPageOffset(firstHtml, seriesId);
  const byNumber = new Map<number, SeriesEntry>();
  const add = (html: string) => {
    for (const e of parseSeriesPage(html)) byNumber.set(e.number, e);
  };
  if (last === 0) {
    add(firstHtml);
  } else {
    const lastEntries = parseSeriesPage(await fetchPage(seriesId, last, f));
    for (const e of lastEntries) byNumber.set(e.number, e);
    if (lastEntries.length < 5) add(await fetchPage(seriesId, last - 20, f));
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}
