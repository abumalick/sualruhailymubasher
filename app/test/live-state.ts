import type { StateDTO } from '@albadr/shared';
import { FIXTURE_STATE } from '../src/dev/fixture-state';

const [tafsir, tawhid] = FIXTURE_STATE.courses;

// Start texts, pages and edition as served by /api/state for these two courses (tafsir lesson 460, tawhid lesson 15).
export const TAFSIR = {
  ...tafsir,
  pdfUrls: [],
  edition: 'طبعة دار ابن الجوزي',
  next: {
    ...tafsir.next!,
    number: 460,
    startPoint: 'تفسير سورة التوبة: من الآية (٨) ﴿كَيْفَ وَإِنْ يَظْهَرُوا عَلَيْكُمْ لَا يَرْقُبُوا فِيكُمْ إِلًّا وَلَا ذِمَّةً...﴾',
    startPage: 636,
  },
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
