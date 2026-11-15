import type {
  CourseInput,
  LessonInput,
  ExceptionDTO,
  ExceptionInput,
  IngestIndex,
  LessonDTO,
  LessonPatch,
  PendingTranscription,
  Slot,
} from '@sualruhaily/shared';
import { lessonLabel } from '@sualruhaily/shared';
import { hijriToMedinaDate, normalizeHijri, weekday } from './time';

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
  lessonWord: string;
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
  lessonWord: (r.lesson_word as string | undefined) ?? 'الدرس',
  active: r.active === 1,
  sort: r.sort as number,
});

const toLesson = (r: Row): LessonDTO => ({
  number: r.number as number,
  hijriDate: r.hijri_date as string,
  startPoint: r.start_point as string,
  section: r.section as string,
  sectionNumber: (r.section_number as number | null) ?? null,
  label: lessonLabel((r.lesson_word as string | undefined) ?? 'الدرس', r.section as string, (r.section_number as number | null) ?? null),
  dateFlag: r.date_flag === 1,
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
}

const toLessonRow = (r: Row): LessonRow => ({
  ...toLesson(r),
  courseId: r.course_id as string,
});

// Sequence order is the sheikh's own: section ord, then section_number. Sections never registered
// (legacy rows, section '') sort first; a NULL section_number sorts after the numbered ones, by number.
const SEQ_ROWS = `SELECT l.*, (SELECT lesson_word FROM courses WHERE id = l.course_id) AS lesson_word, coalesce(s.ord, 0) AS ord, l.section_number IS NULL AS no_sn, coalesce(l.section_number, 0) AS sn
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

export async function listSections(db: D1Database, courseId: string): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT section FROM sections WHERE course_id = ? ORDER BY ord, section')
    .bind(courseId)
    .all<{ section: string }>();
  return results.map((r) => r.section);
}

// `order` must name every registered section exactly once; returns false (and changes nothing) otherwise.
export async function reorderSections(db: D1Database, courseId: string, order: string[]): Promise<boolean> {
  const current = await listSections(db, courseId);
  if (order.length !== current.length || new Set(order).size !== order.length || !current.every((s) => order.includes(s))) return false;
  await db.batch(
    order.map((section, i) => db.prepare('UPDATE sections SET ord = ?1 WHERE course_id = ?2 AND section = ?3').bind(i + 1, courseId, section)),
  );
  for (const section of order) {
    const first = await db
      .prepare(
        `SELECT number FROM lessons WHERE course_id = ? AND section = ?
         ORDER BY section_number IS NULL, coalesce(section_number, 0), number LIMIT 1`,
      )
      .bind(courseId, section)
      .first<{ number: number }>();
    if (first) await fillStartFromPrevious(db, courseId, first.number);
  }
  return true;
}

export const latestLessons = (db: D1Database, courseId: string, limit: number) =>
  lessonsBefore(db, courseId, null, limit);

export async function insertLessonIfNew(
  db: D1Database,
  courseId: string,
  l: Omit<LessonDTO, 'pdfIndex' | 'startPage' | 'endPoint' | 'endPage' | 'endPdfIndex' | 'section' | 'sectionNumber' | 'label' | 'dateFlag'> & {
    section?: string;
    sectionNumber?: number | null;
    sourceRef?: string | null;
    dateFlag?: boolean;
  },
): Promise<boolean> {
  const section = l.section ?? '';
  if (section !== '') await ensureSection(db, courseId, section);
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO lessons (course_id, number, hijri_date, start_point, recording_url, detail_path, created_at, section, section_number, source_ref, date_flag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      courseId, l.number, l.hijriDate, l.startPoint, l.recordingUrl, l.detailPath, new Date().toISOString(),
      section, l.sectionNumber === undefined ? l.number : l.sectionNumber, l.sourceRef ?? null, l.dateFlag ? 1 : 0,
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
  await db
    .prepare(
      `UPDATE lessons SET
         start_page = ?3,
         pdf_index = CASE WHEN start_chained = 1 THEN ?4 ELSE coalesce(pdf_index, ?4) END,
         start_chained = ?3 IS NOT NULL
       WHERE course_id = ?1 AND number = ?2 AND (start_chained = 1 OR start_page IS NULL)`,
    )
    .bind(courseId, number, prev?.endPage ?? null, prev?.endPage == null ? null : (prev.endPdfIndex ?? prev.pdfIndex))
    .run();
}

export interface UpsertResult {
  number: number;
  created: boolean;
  recordingAdded: boolean;
  dateFlag: boolean;
  heldDate: string | null;
}

export class SourceRefConflict extends Error {}

export async function upsertLesson(db: D1Database, input: LessonInput): Promise<UpsertResult> {
  const hijriDate = normalizeHijri(input.hijriDate);
  if (hijriDate === null) throw new Error(`unparseable hijri date: ${input.hijriDate}`);
  const course = (await listCourses(db)).find((c) => c.id === input.courseId);
  if (!course) throw new Error(`unknown course: ${input.courseId}`);
  const held = hijriToMedinaDate(hijriDate);
  const dateFlag = held === null || !course.weekdays.includes(weekday(held));

  const byIdentity = await db
    .prepare('SELECT number, recording_url FROM lessons WHERE course_id = ? AND section = ? AND section_number = ?')
    .bind(input.courseId, input.section, input.sectionNumber)
    .first<{ number: number; recording_url: string | null }>();
  const byRef = await db
    .prepare('SELECT course_id, number, recording_url FROM lessons WHERE source_ref = ?')
    .bind(input.sourceRef)
    .first<{ course_id: string; number: number; recording_url: string | null }>();
  if (byRef && byRef.course_id !== input.courseId) {
    throw new SourceRefConflict(`source_ref ${input.sourceRef} belongs to lesson ${byRef.number} of course ${byRef.course_id}`);
  }
  if (byIdentity && byRef && byIdentity.number !== byRef.number) {
    throw new SourceRefConflict(`source_ref ${input.sourceRef} belongs to lesson ${byRef.number}, not ${byIdentity.number}`);
  }
  const existing = byIdentity ?? byRef;
  // A caption corrected after publication keeps its source_ref but names another identity: the lesson moves there.

  if (existing) {
    const moved = !byIdentity;
    const oldNext = moved ? await nextInSequence(db, input.courseId, existing.number) : null;
    if (moved) await ensureSection(db, input.courseId, input.section);
    const recordingAdded = input.recordingUrl !== null && input.recordingUrl !== existing.recording_url;
    await db
      .prepare(
        `UPDATE lessons SET start_point = ?3, hijri_date = ?4, recording_url = coalesce(?5, recording_url),
           source_ref = ?6, date_flag = ?7, section = ?8, section_number = ?9 WHERE course_id = ?1 AND number = ?2`,
      )
      .bind(input.courseId, existing.number, input.startPoint, hijriDate, input.recordingUrl, input.sourceRef, dateFlag ? 1 : 0, input.section, input.sectionNumber)
      .run();
    if (moved) {
      await fillStartFromPrevious(db, input.courseId, existing.number);
      if (oldNext) await fillStartFromPrevious(db, input.courseId, oldNext.number);
      const newNext = await nextInSequence(db, input.courseId, existing.number);
      if (newNext) await fillStartFromPrevious(db, input.courseId, newNext.number);
    }
    return { number: existing.number, created: false, recordingAdded, dateFlag, heldDate: held };
  }

  const { n } = (await db
    .prepare('SELECT coalesce(max(number), 0) + 1 AS n FROM lessons WHERE course_id = ?')
    .bind(input.courseId)
    .first<{ n: number }>())!;
  const inserted = await insertLessonIfNew(db, input.courseId, {
    number: n,
    section: input.section,
    sectionNumber: input.sectionNumber,
    hijriDate,
    startPoint: input.startPoint,
    recordingUrl: input.recordingUrl,
    detailPath: '',
    sourceRef: input.sourceRef,
    dateFlag,
  });
  if (!inserted) throw new Error(`lesson ${input.courseId}/${n} was created concurrently`);
  return { number: n, created: true, recordingAdded: input.recordingUrl !== null, dateFlag, heldDate: held };
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
  const set = [...entries.map((k) => `${PATCH_COLUMNS[k]} = ?`), ...(p.startPage !== undefined || p.pdfIndex !== undefined ? ['start_chained = 0'] : [])].join(', ');
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

export async function addCancellations(
  db: D1Database,
  courseIds: string[],
  date: string,
  note: string,
  sourceRef: string,
): Promise<number> {
  if (courseIds.length === 0) return 0;
  const results = await db.batch(
    courseIds.map((id) =>
      db
        .prepare("INSERT OR IGNORE INTO exceptions (course_id, kind, date_from, note, source_ref) VALUES (?, 'cancel', ?, ?, ?)")
        .bind(id, date, note, sourceRef),
    ),
  );
  return results.reduce((n, r) => n + r.meta.changes, 0);
}

export async function ingestIndex(db: D1Database): Promise<IngestIndex> {
  const lessons = await db
    .prepare(
      'SELECT source_ref, course_id, section, section_number, recording_url FROM lessons WHERE source_ref IS NOT NULL ORDER BY course_id, number',
    )
    .all<Row>();
  const refs = await db
    .prepare('SELECT DISTINCT source_ref FROM exceptions WHERE source_ref IS NOT NULL ORDER BY source_ref')
    .all<Row>();
  return {
    lessons: lessons.results.map((r) => ({
      sourceRef: r.source_ref as string,
      courseId: r.course_id as string,
      section: r.section as string,
      sectionNumber: r.section_number as number,
      recordingUrl: (r.recording_url as string | null) ?? null,
    })),
    exceptionRefs: refs.results.map((r) => r.source_ref as string),
  };
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

// Lesson days broadcast after the newest lesson was held (and before `on`) that have no published lesson yet:
// lessons arrive after a delay. Days, not uids, so a reconnect that yields a second uid counts once. When the
// held date cannot be derived from the hijri date, the lesson's created_at is the anchor instead.
export async function heldSinceLatest(db: D1Database, courseId: string, on: string): Promise<number> {
  const [last] = await latestLessons(db, courseId, 1);
  if (!last) return 0;
  const created = await db
    .prepare('SELECT created_at FROM lessons WHERE course_id = ? AND number = ?')
    .bind(courseId, last.number)
    .first<{ created_at: string }>();
  const held = hijriToMedinaDate(last.hijriDate);
  const r = await db
    .prepare(
      `SELECT count(DISTINCT date(started_at, '+3 hours')) AS n FROM broadcasts
       WHERE course_id = ?1
         AND date(started_at, '+3 hours') < ?2
         AND (CASE WHEN ?3 IS NOT NULL THEN date(started_at, '+3 hours') > ?3 ELSE started_at > ?4 END)`,
    )
    .bind(courseId, on, held, created?.created_at ?? '')
    .first<{ n: number }>();
  return r!.n;
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
