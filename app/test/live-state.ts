import type { StateDTO } from '@albadr/shared';
import { FIXTURE_STATE } from '../src/dev/fixture-state';

const [tafsir, tawhid] = FIXTURE_STATE.courses;

// Shaped like production: Tafsir has no in-app book and names its printed edition instead.
export const TAFSIR = {
  ...tafsir,
  pdfUrls: [],
  edition: 'طبعة دار ابن الجوزي',
  next: { ...tafsir.next!, number: 461, startPoint: 'تفسير سورة التوبة: من الآية (8) ﴿كَيْفَ وَإِنْ يَظْهَرُوا عَلَيْكُمْ﴾', startPage: 628 },
};
export const TAWHID = {
  ...tawhid,
  next: { ...tawhid.next!, number: 15, startPoint: 'من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…', startPage: 280 },
};

export const liveState = (courseId: string | null): StateDTO => ({
  ...FIXTURE_STATE,
  courses: [TAFSIR, TAWHID],
  live: { ...FIXTURE_STATE.live, embedUrl: 'about:blank#mixlr', isLive: true, courseId, startedAt: '2026-11-02T15:10:00Z' },
});
