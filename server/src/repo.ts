import type {
  CourseInput,
  ExceptionDTO,
  ExceptionInput,
  LessonDTO,
  LessonPatch,
  PendingTranscription,
  Slot,
} from '@sualruhaily/shared';
import { hijriToMedinaDate } from './time';

export interface CourseRow {
  id: string;
  title: string;
  slot: Slot;
  place: string;
  weekdays: number[];
  offsetMin: number;
  seriesId: number;
  pdfUrls: string[];
  edition: string | null;
  pageOffsets: number[];
  active: boolean;
  sort: number;
}

export interface LiveRow {
  isLive: boolean;
  broadcastUid: string | null;
  streamUrl: string | null;
  courseId: string | null;
  startedAt: string | null;
}

type Row = Record<string, unknown>;

const toCourse = (r: Row): CourseRow => ({
  id: r.id as string,
  title: r.title as string,
  slot: r.slot as Slot,
  place: r.place as string,
  weekdays: JSON.parse(r.weekdays as string),
  offsetMin: r.offset_min as number,
  seriesId: r.series_id as number,
  pdfUrls: JSON.parse(r.pdf_urls as string),
  edition: (r.edition as string | null) ?? null,
  pageOffsets: JSON.parse((r.page_offsets as string | undefined) ?? '[]'),
  active: r.active === 1,
  sort: r.sort as number,
});

const toLesson = (r: Row): LessonDTO => ({
  number: r.number as number,
  hijriDate: r.hijri_date as string,
  startPoint: r.start_point as string,
  pdfIndex: r.pdf_index as number | null,
  startPage: r.start_page as number | null,
  endPoint: r.end_point as string | null,
  endPage: r.end_page as number | null,
  endPdfIndex: r.end_pdf_index as number | null,
  recordingUrl: r.recording_url as string | null,
  detailPath: r.detail_path as string,
});

export interface LessonRow extends LessonDTO {
  courseId: string;
  section: string;
  sectionNumber: number | null;
}

const toLessonRow = (r: Row): LessonRow => ({
  ...toLesson(r),
  courseId: r.course_id as string,
  section: r.section as string,
  sectionNumber: (r.section_number as number | null) ?? null,
});

// Sequence order is the sheikh's own: section ord, then section_number. Sections never registered
// (legacy rows, section '') sort first; a NULL section_number sorts after the numbered ones, by number.
const SEQ_ROWS = `SELECT l.*, coalesce(s.ord, 0) AS ord, l.section_number IS NULL AS no_sn, coalesce(l.section_number, 0) AS sn
  FROM lessons l LEFT JOIN sections s ON s.course_id = l.course_id AND s.section = l.section`;
const SEQ = `seq AS (${SEQ_ROWS} WHERE l.course_id = ?1)`;
const SEQ_COLS = 'ord, no_sn, sn, number';
const SEQ_KEY = `(${SEQ_COLS})`;
const SEQ_ASC = 'ord, no_sn, sn, number';
const SEQ_DESC = 'ord DESC, no_sn DESC, sn DESC, number DESC';

const toException = (r: Row): ExceptionDTO => ({
  id: r.id as number,
  courseId: r.course_id as string | null,
  kind: r.kind as ExceptionDTO['kind'],
  dateFrom: r.date_from as string,
  dateTo: r.date_to as string | null,
  time: r.time as string | null,
  note: r.note as string,
});

export async function listCourses(db: D1Database, opts: { activeOnly?: boolean } = {}): Promise<CourseRow[]> {
  const where = opts.activeOnly ? 'WHERE active = 1' : '';
  const { results } = await db.prepare(`SELECT * FROM courses ${where} ORDER BY sort, id`).all<Row>();
  return results.map(toCourse);
}

export async function upsertCourse(db: D1Database, id: string, input: CourseInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO courses (id, title, slot, weekdays, offset_min, series_id, pdf_urls, active, edition, page_offsets, place, sort)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, coalesce(?10, '[]'), ?11, (SELECT coalesce(max(sort), -1) + 1 FROM courses))
       ON CONFLICT(id) DO UPDATE SET title = ?2, slot = ?3, weekdays = ?4, offset_min = ?5,
         series_id = ?6, pdf_urls = ?7, active = ?8, edition = ?9, page_offsets = coalesce(?10, page_offsets), place = ?11`,
    )
    .bind(
      id,
      input.title,
      input.slot,
      JSON.stringify(input.weekdays),
      input.offsetMin,
      input.seriesId,
      JSON.stringify(input.pdfUrls),
      input.active ? 1 : 0,
      input.edition?.trim() || null,
      input.pageOffsets === undefined ? null : JSON.stringify(input.pageOffsets),
      input.place.trim(),
    )
    .run();
}

export async function lessonsBefore(
  db: D1Database,
  courseId: string,
  before: number | null,
  limit: number,
): Promise<LessonDTO[]> {
  const { results } = await db
    .prepare(
      `WITH ${SEQ}
       SELECT * FROM seq
       WHERE ?2 IS NULL OR ${SEQ_KEY} < (SELECT ${SEQ_COLS} FROM seq WHERE number = ?2)
       ORDER BY ${SEQ_DESC} LIMIT ?3`,
    )
    .bind(courseId, before, limit)
    .all<Row>();
  return results.map(toLesson);
}

export async function previousInSequence(db: D1Database, courseId: string, number: number): Promise<LessonRow | null> {
  const r = await db
    .prepare(
      `WITH ${SEQ}
       SELECT * FROM seq WHERE ${SEQ_KEY} < (SELECT ${SEQ_COLS} FROM seq WHERE number = ?2)
       ORDER BY ${SEQ_DESC} LIMIT 1`,
    )
    .bind(courseId, number)
    .first<Row>();
  return r ? toLessonRow(r) : null;
}

export async function nextInSequence(db: D1Database, courseId: string, number: number): Promise<LessonRow | null> {
  const r = await db
    .prepare(
      `WITH ${SEQ}
       SELECT * FROM seq WHERE ${SEQ_KEY} > (SELECT ${SEQ_COLS} FROM seq WHERE number = ?2)
       ORDER BY ${SEQ_ASC} LIMIT 1`,
    )
    .bind(courseId, number)
    .first<Row>();
  return r ? toLessonRow(r) : null;
}

export async function ensureSection(db: D1Database, courseId: string, section: string): Promise<number> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO sections (course_id, section, ord)
       VALUES (?1, ?2, (SELECT coalesce(max(ord), 0) + 1 FROM sections WHERE course_id = ?1))`,
    )
    .bind(courseId, section)
    .run();
  const r = await db
    .prepare('SELECT ord FROM sections WHERE course_id = ? AND section = ?')
    .bind(courseId, section)
    .first<{ ord: number }>();
  return r!.ord;
}

export const latestLessons = (db: D1Database, courseId: string, limit: number) =>
  lessonsBefore(db, courseId, null, limit);

export async function insertLessonIfNew(
  db: D1Database,
  courseId: string,
  l: Omit<LessonDTO, 'pdfIndex' | 'startPage' | 'endPoint' | 'endPage' | 'endPdfIndex'> & {
    section?: string;
    sectionNumber?: number | null;
  },
): Promise<boolean> {
  const section = l.section ?? '';
  if (section !== '') await ensureSection(db, courseId, section);
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO lessons (course_id, number, hijri_date, start_point, recording_url, detail_path, created_at, section, section_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      courseId, l.number, l.hijriDate, l.startPoint, l.recordingUrl, l.detailPath, new Date().toISOString(),
      section, l.sectionNumber === undefined ? l.number : l.sectionNumber,
    )
    .run();
  if (res.meta.changes === 0) return false;
  await fillStartFromPrevious(db, courseId, l.number);
  const next = await nextInSequence(db, courseId, l.number);
  if (next) await fillStartFromPrevious(db, courseId, next.number);
  return true;
}

// A start filled from the predecessor is marked start_chained and follows it; a start set by hand or by the agent is never overwritten.
async function fillStartFromPrevious(db: D1Database, courseId: string, number: number): Promise<void> {
  const prev = await previousInSequence(db, courseId, number);
  if (!prev) return;
  await db
    .prepare(
      `UPDATE lessons SET
         start_page = ?3,
         pdf_index = CASE WHEN start_chained = 1 THEN ?4 ELSE coalesce(pdf_index, ?4) END,
         start_chained = ?3 IS NOT NULL
       WHERE course_id = ?1 AND number = ?2 AND (start_chained = 1 OR start_page IS NULL)`,
    )
    .bind(courseId, number, prev.endPage, prev.endPage === null ? null : (prev.endPdfIndex ?? prev.pdfIndex))
    .run();
}

export async function setRecordingUrl(db: D1Database, courseId: string, number: number, url: string): Promise<void> {
  await db
    .prepare('UPDATE lessons SET recording_url = ? WHERE course_id = ? AND number = ?')
    .bind(url, courseId, number)
    .run();
}

const PATCH_COLUMNS: Record<keyof LessonPatch, string> = {
  startPoint: 'start_point',
  pdfIndex: 'pdf_index',
  startPage: 'start_page',
  endPoint: 'end_point',
  endPage: 'end_page',
  endPdfIndex: 'end_pdf_index',
};

export async function patchLesson(db: D1Database, courseId: string, number: number, p: LessonPatch): Promise<boolean> {
  const entries = (Object.keys(PATCH_COLUMNS) as (keyof LessonPatch)[]).filter((k) => p[k] !== undefined);
  if (entries.length === 0) {
    const row = await db
      .prepare('SELECT 1 AS x FROM lessons WHERE course_id = ? AND number = ?')
      .bind(courseId, number)
      .first();
    return row !== null;
  }
  const set = [...entries.map((k) => `${PATCH_COLUMNS[k]} = ?`), ...(p.startPage !== undefined ? ['start_chained = 0'] : [])].join(', ');
  const res = await db
    .prepare(`UPDATE lessons SET ${set} WHERE course_id = ? AND number = ?`)
    .bind(...entries.map((k) => p[k]), courseId, number)
    .run();
  if (res.meta.changes === 0) return false;
  if (p.endPage !== undefined || p.endPdfIndex !== undefined) {
    const next = await nextInSequence(db, courseId, number);
    if (next) await fillStartFromPrevious(db, courseId, next.number);
  }
  return true;
}

export async function listExceptions(db: D1Database, fromDate: string): Promise<ExceptionDTO[]> {
  const { results } = await db
    .prepare('SELECT * FROM exceptions WHERE coalesce(date_to, date_from) >= ? ORDER BY date_from, id')
    .bind(fromDate)
    .all<Row>();
  return results.map(toException);
}

export async function addException(db: D1Database, e: ExceptionInput): Promise<number> {
  const res = await db
    .prepare('INSERT INTO exceptions (course_id, kind, date_from, date_to, time, note) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(e.courseId, e.kind, e.dateFrom, e.dateTo ?? null, e.time ?? null, e.note ?? '')
    .run();
  return res.meta.last_row_id;
}

export async function deleteException(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM exceptions WHERE id = ?').bind(id).run();
  return res.meta.changes > 0;
}

export async function getLive(db: D1Database): Promise<LiveRow> {
  const r = await db.prepare('SELECT * FROM live_state WHERE id = 1').first<Row>();
  return {
    isLive: r?.is_live === 1,
    broadcastUid: (r?.broadcast_uid as string | null) ?? null,
    streamUrl: (r?.stream_url as string | null) ?? null,
    courseId: (r?.course_id as string | null) ?? null,
    startedAt: (r?.started_at as string | null) ?? null,
  };
}

export async function setLive(db: D1Database, s: LiveRow): Promise<void> {
  await db
    .prepare(
      'UPDATE live_state SET is_live = ?, broadcast_uid = ?, stream_url = ?, course_id = ?, started_at = ? WHERE id = 1',
    )
    .bind(s.isLive ? 1 : 0, s.broadcastUid, s.streamUrl, s.courseId, s.startedAt)
    .run();
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const r = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2')
    .bind(key, value)
    .run();
}

export async function markSent(db: D1Database, key: string): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO sent_notifications (key, sent_at) VALUES (?, ?)')
    .bind(key, new Date().toISOString())
    .run();
  return res.meta.changes > 0;
}

export async function unmarkSent(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM sent_notifications WHERE key = ?').bind(key).run();
}

export async function recordBroadcast(
  db: D1Database,
  uid: string,
  courseId: string | null,
  startedAt: string,
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO broadcasts (uid, course_id, started_at) VALUES (?, ?, ?)')
    .bind(uid, courseId, startedAt)
    .run();
}

// Number of the lesson held on Medina date `on`: lessons arrive after a delay, so lesson days
// broadcast after the latest scraped lesson was held (and before `on`) are counted too.
// Days, not uids, so a reconnect that yields a second uid counts once. When the held date cannot be
// derived from the hijri date, the lesson's created_at is the anchor instead.
export async function expectedNextNumber(db: D1Database, courseId: string, on: string, now: Date): Promise<number> {
  const [last] = await latestLessons(db, courseId, 1);
  const created = last
    ? await db
        .prepare('SELECT created_at FROM lessons WHERE course_id = ? AND number = ?')
        .bind(courseId, last.number)
        .first<{ created_at: string }>()
    : null;
  const held = last ? hijriToMedinaDate(last.hijriDate, now) : null;
  const r = await db
    .prepare(
      `SELECT count(DISTINCT date(started_at, '+3 hours')) AS n FROM broadcasts
       WHERE course_id = ?1
         AND date(started_at, '+3 hours') < ?2
         AND (CASE WHEN ?3 IS NOT NULL THEN date(started_at, '+3 hours') > ?3 ELSE started_at > ?4 END)`,
    )
    .bind(courseId, on, held, created?.created_at ?? '')
    .first<{ n: number }>();
  return (last?.number ?? 0) + 1 + r!.n;
}

export async function pendingTranscriptions(db: D1Database): Promise<PendingTranscription[]> {
  const { results } = await db
    .prepare(
      `WITH seq AS (
         SELECT l.*, coalesce(s.ord, 0) AS ord, l.section_number IS NULL AS no_sn, coalesce(l.section_number, 0) AS sn
         FROM lessons l LEFT JOIN sections s ON s.course_id = l.course_id AND s.section = l.section),
       pos AS (
         SELECT *, row_number() OVER (PARTITION BY course_id ORDER BY ${SEQ_ASC}) AS idx,
                row_number() OVER (PARTITION BY course_id ORDER BY ${SEQ_DESC}) AS rank
         FROM seq)
       SELECT l.course_id, l.number, l.recording_url, l.start_point, l.start_page, l.pdf_index, c.pdf_urls,
              n.start_point AS next_start_point, p.number AS prev_number
       FROM pos l
       JOIN courses c ON c.id = l.course_id
       LEFT JOIN pos n ON n.course_id = l.course_id AND n.idx = l.idx + 1
       LEFT JOIN pos p ON p.course_id = l.course_id AND p.idx = l.idx - 1
       WHERE l.rank <= 3 AND l.recording_url IS NOT NULL AND l.end_page IS NULL
       ORDER BY l.course_id, l.idx`,
    )
    .all<Row>();
  return results.map((r) => ({
    courseId: r.course_id as string,
    number: r.number as number,
    recordingUrl: r.recording_url as string,
    startPoint: r.start_point as string,
    pdfUrls: JSON.parse(r.pdf_urls as string),
    nextStartPoint: (r.next_start_point as string | null) ?? null,
    prevNumber: (r.prev_number as number | null) ?? null,
    startPage: (r.start_page as number | null) ?? null,
    pdfIndex: (r.pdf_index as number | null) ?? null,
  }));
}
