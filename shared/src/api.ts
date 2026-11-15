import type { UpdatePolicy } from './update';
export type Slot = 'fajr' | 'asr' | 'maghrib';
export type ExceptionKind = 'cancel' | 'pause' | 'extra' | 'move';

export interface LessonDTO {
  number: number; hijriDate: string; startPoint: string;
  section: string; sectionNumber: number | null; label: string;  // label: how the sheikh names it, e.g. "كتاب القضاء – الدرس ٥"
  dateFlag: boolean;                                    // the caption's date looks wrong
  pdfIndex: number | null; startPage: number | null;
  endPoint: string | null; endPage: number | null; endPdfIndex: number | null;  // endPdfIndex null = same volume as pdfIndex
  recordingUrl: string | null; detailPath: string;
}
export interface NextPassageDTO {
  date: string; time: string;                           // Medina date of the next lesson
  startPoint: string | null;                            // previous lesson's endPoint when known
  pdfIndex: number | null; startPage: number | null; estEndPage: number | null;
  estimated: boolean;                                   // true unless start came from a transcribed endPoint/endPage
}
export interface ExceptionDTO { id: number; courseId: string | null; kind: ExceptionKind; dateFrom: string; dateTo: string | null; time: string | null; note: string; }
export interface CourseDTO {
  id: string; title: string; lessonWord: string; slot: Slot; place: string; weekdays: number[]; time: string;  // lesson time on the next lesson date (prayer time + offset)
  unpublished: number;                                  // lessons held after the newest one and not yet published
  pdfUrls: string[]; latest: LessonDTO[];               // newest first, max 5
  pageOffsets?: number[];                               // per volume: printed page = PDF page - offset; absent or missing entry = 0
  edition: string | null;                               // edition the page numbers refer to, shown when the book is not linked
  next: NextPassageDTO | null; exceptions: ExceptionDTO[];  // upcoming only
}
export interface LiveDTO { isLive: boolean; mode: 'embed' | 'direct'; embedUrl: string; streamUrl: string | null; courseId: string | null; startedAt: string | null; }
export interface StateDTO { generatedAt: string; live: LiveDTO; courses: CourseDTO[]; links: { title: string; url: string }[]; update?: UpdatePolicy; }

// admin writes
export interface CourseInput { title: string; slot: Slot; place: string; weekdays: number[]; offsetMin: number; seriesId: number; pdfUrls: string[]; active: boolean; edition?: string | null; pageOffsets?: number[]; }  // offsetMin: minutes after Fajr / Asr / sunset, 0..120
export interface LessonPatch {                          // null clears a field
  startPoint?: string; pdfIndex?: number | null; startPage?: number | null;
  endPoint?: string | null; endPage?: number | null; endPdfIndex?: number | null;
}
export interface ExceptionInput { courseId: string | null; kind: ExceptionKind; dateFrom: string; dateTo?: string | null; time?: string | null; note?: string; }
export interface PendingTranscription {
  courseId: string; number: number; recordingUrl: string; startPoint: string; pdfUrls: string[];
  nextStartPoint: string | null;                        // published start point of the next lesson in sequence, when scraped
  prevNumber: number | null;                            // number of the previous lesson in sequence
  startPage: number | null; pdfIndex: number | null;    // the lesson's own chained start, when known
}

export interface LessonInput {
  courseId: string; section: string; sectionNumber: number;
  hijriDate: string;                                    // as written in the caption, e.g. "٢٧/ ٥/ ١٤٤٨" or "1448/5/20"
  startPoint: string; recordingUrl: string | null; sourceRef: string;
}
export interface LessonUpsertResult { number: number; created: boolean; dateFlag: boolean; pushed: boolean; }
