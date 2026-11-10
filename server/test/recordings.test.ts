import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sub481 from './fixtures/sub481.html?raw';
import detail from './fixtures/detail-tawhid-002.html?raw';
import { runRecordingIngest } from '../src/jobs/recordings';
import { latestLessons, listCourses } from '../src/repo';
import { parseSeriesPage } from '../src/sources/albadr';
import type { Fcm } from '../src/fcm';

const TAWHID = 'kitab-tawhid';
const TAWHID_TITLE = 'التعليق على شرح كتاب التوحيد من تقريرات الشيخ محمد بن إبراهيم';
const SERIES_481 = 'https://al-badr.net/sub/481/?q=&page=0';
const SERIES_456 = 'https://al-badr.net/sub/456/?q=&page=0';
const EMPTY_SERIES = '<html></html>';
const MP3 = 'https://al-badr.net/download/esound/choroohat/taohid/taqrirat-ala-kitab-tauhid/002.mp3';

const entries = parseSeriesPage(sub481);
const maxNumber = Math.max(...entries.map((e) => e.number));
const newNumber = maxNumber + 1;
const newPath = '/detail/newentry00001';
const newEntryHtml = `<h3><a href="${newPath}" title="">${String(newNumber).padStart(3, '0')} بداية جديدة 01-01-1448</a></h3>`;
const withMp3 = (n: number) => `<audio src="http://www.al-badr.net/download/x/${n}.mp3"></audio>`;

function fakeFetch(pages: Record<string, string>, calls: string[] = []) {
  return (async (url: string) => {
    calls.push(url);
    const body = pages[url];
    return body === undefined ? new Response('no', { status: 404 }) : new Response(body);
  }) as unknown as typeof fetch;
}

function setup(pages: Record<string, string>) {
  const calls: string[] = [];
  const sendToTopic = vi.fn().mockResolvedValue(undefined);
  const deps = { db: env.DB, fetch: fakeFetch(pages, calls), fcm: { sendToTopic } as unknown as Fcm, now: new Date() };
  return { deps, calls, sendToTopic };
}

const detailPages = Object.fromEntries(entries.map((e) => [`https://al-badr.net${e.detailPath}`, detail]));

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sent_notifications');
  await env.DB.exec('DELETE FROM lessons');
  await env.DB.exec('UPDATE courses SET active = 1, series_id = CASE id WHEN \'kitab-tawhid\' THEN 481 ELSE 456 END');
});

describe('runRecordingIngest', () => {
  const base = { [SERIES_481]: sub481, [SERIES_456]: EMPTY_SERIES, ...detailPages };

  it('backfills silently, then notifies once for a new latest lesson', async () => {
    const first = setup(base);
    await runRecordingIngest(first.deps);
    const stored = await latestLessons(env.DB, TAWHID, 100);
    expect(stored).toHaveLength(entries.length);
    expect(stored.every((l) => l.recordingUrl === MP3)).toBe(true);
    expect(first.sendToTopic).not.toHaveBeenCalled();

    const second = setup({
      ...base,
      [SERIES_481]: sub481.replace('</body>', `${newEntryHtml}</body>`),
      [`https://al-badr.net${newPath}`]: withMp3(newNumber),
    });
    await runRecordingIngest(second.deps);
    const [latest] = await latestLessons(env.DB, TAWHID, 1);
    expect(latest).toMatchObject({ number: newNumber, recordingUrl: `https://al-badr.net/download/x/${newNumber}.mp3` });
    expect(second.sendToTopic).toHaveBeenCalledTimes(1);
    expect(second.sendToTopic).toHaveBeenCalledWith('c-kitab-tawhid-rec', {
      title: 'التسجيل متاح · راجع الدرس',
      body: `${TAWHID_TITLE} · الدرس ${String(newNumber).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])}`,
      data: { kind: 'rec', courseId: TAWHID, number: String(newNumber) },
      tag: 'notice',
      ttlSec: 86400,
    });

    const third = setup({ ...base, [SERIES_481]: sub481.replace('</body>', `${newEntryHtml}</body>`) });
    await runRecordingIngest(third.deps);
    expect(third.sendToTopic).not.toHaveBeenCalled();
  });

  it('leaves recording_url null and sends nothing when the detail page has no mp3', async () => {
    await runRecordingIngest(setup(base).deps);
    const run = setup({
      ...base,
      [SERIES_481]: sub481.replace('</body>', `${newEntryHtml}</body>`),
      [`https://al-badr.net${newPath}`]: '<html>coming soon</html>',
    });
    await runRecordingIngest(run.deps);
    const [latest] = await latestLessons(env.DB, TAWHID, 1);
    expect(latest).toMatchObject({ number: newNumber, recordingUrl: null });
    expect(run.sendToTopic).not.toHaveBeenCalled();
  });

  it('does not notify for an older lesson that gets its recording late', async () => {
    await runRecordingIngest(setup(base).deps);
    await env.DB.exec(`UPDATE lessons SET recording_url = NULL WHERE number = ${maxNumber - 1}`);
    const run = setup(base);
    await runRecordingIngest(run.deps);
    expect(run.sendToTopic).not.toHaveBeenCalled();
    const lessons = await latestLessons(env.DB, TAWHID, 100);
    expect(lessons.find((l) => l.number === maxNumber - 1)?.recordingUrl).toBe(MP3);
  });

  it('fetches at most 8 detail pages per course per run, newest first', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `<h3><a href="/detail/m${i + 1}" title="">${String(i + 1).padStart(3, '0')} نقطة ${i + 1} 01-01-1448</a></h3>`).join('');
    const run = setup({ [SERIES_481]: many, [SERIES_456]: EMPTY_SERIES });
    await runRecordingIngest(run.deps);
    const detailCalls = run.calls.filter((u) => u.includes('/detail/'));
    expect(detailCalls).toEqual(Array.from({ length: 8 }, (_, i) => `https://al-badr.net/detail/m${12 - i}`));
  });

  it('keeps processing the other course when one fetch throws', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = setup({ ...base, [SERIES_456]: undefined as unknown as string });
    const f = run.deps.fetch;
    run.deps.fetch = (async (url: string) => {
      if (url === SERIES_456) throw new Error('boom');
      return f(url);
    }) as unknown as typeof fetch;
    await runRecordingIngest(run.deps);
    expect(errors).toHaveBeenCalled();
    expect(await latestLessons(env.DB, TAWHID, 100)).toHaveLength(entries.length);
    errors.mockRestore();
  });

  it('logs a push failure and does not retry it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runRecordingIngest(setup(base).deps);
    const pages = {
      ...base,
      [SERIES_481]: sub481.replace('</body>', `${newEntryHtml}</body>`),
      [`https://al-badr.net${newPath}`]: withMp3(newNumber),
    };
    const failing = setup(pages);
    failing.sendToTopic.mockRejectedValue(new Error('fcm down'));
    await runRecordingIngest(failing.deps);
    expect(errors).toHaveBeenCalled();
    const retry = setup(pages);
    await runRecordingIngest(retry.deps);
    expect(retry.sendToTopic).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('skips courses without a series id', async () => {
    await env.DB.exec('UPDATE courses SET series_id = 0');
    const run = setup(base);
    await runRecordingIngest(run.deps);
    expect(run.calls).toEqual([]);
    expect((await listCourses(env.DB)).length).toBeGreaterThan(0);
  });
});
