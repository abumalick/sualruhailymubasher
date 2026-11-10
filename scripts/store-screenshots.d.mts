export interface ScreenshotTarget {
  viewport: { width: number; height: number };
  scale: number;
  dir: string;
}
export declare const TARGETS: Record<'ios' | 'android', ScreenshotTarget>;
