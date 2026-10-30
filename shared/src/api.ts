export type Slot = 'fajr' | 'maghrib';
export type ExceptionKind = 'cancel' | 'pause' | 'extra' | 'move';

export interface LessonDTO {
  number: number; hijriDate: string; startPoint: string;
  pdfIndex: number | null; startPage: number | null;
  endPoint: string | null; endPage: number | null; endPdfIndex: number | null;  // endPdfIndex null = same volume as pdfIndex
  recordingUrl: string | null; detailPath: string;
}
export interface NextPassageDTO {
  date: string; time: string; number: number;          // Medina date of the next lesson
  startPoint: string | null;                            // previous lesson's endPoint when known
  pdfIndex: number | null; startPage: number | null; estEndPage: number | null;
  estimated: boolean;                                   // true unless start came from a transcribed endPoint/endPage
}
export interface ExceptionDTO { id: number; courseId: string | null; kind: ExceptionKind; dateFrom: string; dateTo: string | null; time: string | null; note: string; }
export interface CourseDTO {
  id: string; title: string; slot: Slot; weekdays: number[]; time: string;  // lesson time on the next lesson date (prayer time + offset)
  pdfUrls: string[]; latest: LessonDTO[];               // newest first, max 5
  next: NextPassageDTO | null; exceptions: ExceptionDTO[];  // upcoming only
}
export interface LiveDTO { isLive: boolean; mode: 'embed' | 'direct'; embedUrl: string; streamUrl: string | null; courseId: string | null; startedAt: string | null; }
export interface StateDTO { generatedAt: string; live: LiveDTO; courses: CourseDTO[]; links: { title: string; url: string }[]; }

// admin writes
export interface CourseInput { title: string; slot: Slot; weekdays: number[]; offsetMin: number; seriesId: number; pdfUrls: string[]; active: boolean; }  // offsetMin: minutes after Fajr / sunset, 0..120
export interface LessonPatch {                          // null clears a field
  startPoint?: string; pdfIndex?: number | null; startPage?: number | null;
  endPoint?: string | null; endPage?: number | null; endPdfIndex?: number | null;
}
export interface ExceptionInput { courseId: string | null; kind: ExceptionKind; dateFrom: string; dateTo?: string | null; time?: string | null; note?: string; }
export interface PendingTranscription { courseId: string; number: number; recordingUrl: string; startPoint: string; pdfUrls: string[]; }
