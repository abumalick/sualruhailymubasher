import type {
  CourseInput,
  ExceptionDTO,
  ExceptionInput,
  LessonDTO,
  LessonPatch,
  PendingTranscription,
  Slot,
} from '@albadr/shared';

export interface CourseRow {
  id: string;
  title: string;
  slot: Slot;
  weekdays: number[];
  offsetMin: number;
  seriesId: number;
  pdfUrls: string[];
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
  weekdays: JSON.parse(r.weekdays as string),
  offsetMin: r.offset_min as number,
  seriesId: r.series_id as number,
  pdfUrls: JSON.parse(r.pdf_urls as string),
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
  recordingUrl: r.recording_url as string | null,
  detailPath: r.detail_path as string,
});

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
      `INSERT INTO courses (id, title, slot, weekdays, offset_min, series_id, pdf_urls, active, sort)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, (SELECT coalesce(max(sort), -1) + 1 FROM courses))
       ON CONFLICT(id) DO UPDATE SET title = ?2, slot = ?3, weekdays = ?4, offset_min = ?5,
         series_id = ?6, pdf_urls = ?7, active = ?8`,
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
    .prepare('SELECT * FROM lessons WHERE course_id = ?1 AND (?2 IS NULL OR number < ?2) ORDER BY number DESC LIMIT ?3')
    .bind(courseId, before, limit)
    .all<Row>();
  return results.map(toLesson);
}

export const latestLessons = (db: D1Database, courseId: string, limit: number) =>
  lessonsBefore(db, courseId, null, limit);

export async function insertLessonIfNew(
  db: D1Database,
  courseId: string,
  l: Omit<LessonDTO, 'pdfIndex' | 'startPage' | 'endPoint' | 'endPage'>,
): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO lessons (course_id, number, hijri_date, start_point, recording_url, detail_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(courseId, l.number, l.hijriDate, l.startPoint, l.recordingUrl, l.detailPath, new Date().toISOString())
    .run();
  return res.meta.changes > 0;
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
  const set = entries.map((k) => `${PATCH_COLUMNS[k]} = ?`).join(', ');
  const res = await db
    .prepare(`UPDATE lessons SET ${set} WHERE course_id = ? AND number = ?`)
    .bind(...entries.map((k) => p[k]), courseId, number)
    .run();
  return res.meta.changes > 0;
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

export async function pendingTranscriptions(db: D1Database): Promise<PendingTranscription[]> {
  const { results } = await db
    .prepare(
      `SELECT l.course_id, l.number, l.recording_url, l.start_point, c.pdf_urls
       FROM lessons l JOIN courses c ON c.id = l.course_id
       WHERE l.recording_url IS NOT NULL AND l.end_page IS NULL
       ORDER BY l.course_id, l.number`,
    )
    .all<Row>();
  return results.map((r) => ({
    courseId: r.course_id as string,
    number: r.number as number,
    recordingUrl: r.recording_url as string,
    startPoint: r.start_point as string,
    pdfUrls: JSON.parse(r.pdf_urls as string),
  }));
}
