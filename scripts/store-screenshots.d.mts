export interface ScreenshotTarget {
  viewport: { width: number; height: number };
  scale: number;
  dir: string;
}
export declare const TARGETS: Record<'ios' | 'android', ScreenshotTarget>;
export type ShotStep = 'live' | 'recording' | 'book';
export declare const STEPS: Record<ShotStep, (page: unknown) => Promise<void>>;
export declare const SHOTS: { name: string; route: string; slot?: 'fajr' | 'maghrib'; step?: ShotStep }[];
