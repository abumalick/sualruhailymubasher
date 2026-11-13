export interface ScreenshotTarget {
  viewport: { width: number; height: number };
  scale: number;
  dir: string;
}
export declare const TARGETS: Record<'ios' | 'android', ScreenshotTarget>;
export type ShotStep = 'recording' | 'book';
export declare const STEPS: Record<ShotStep, (page: unknown) => Promise<void>>;
export declare const SHOTS: { name: string; route: string; slot?: 'fajr' | 'maghrib'; live?: string; step?: ShotStep }[];
export declare function liveState<S extends { live: object; courses: { id: string; next: { date: string; time: string } | null }[] }>(
  state: S,
  courseId: string,
  minutesIn?: number,
): { state: S & { live: { isLive: true; courseId: string; startedAt: string } }; now: Date };
