export type PushKind = 'live' | 'live-other' | 'rec' | 'prep';

export interface PushData {
  kind: PushKind;
  courseId?: string;
  number: string;
}

export const LIVE_OTHER_TOPIC = 'live-other';

export const courseTopic = (courseId: string, kind: 'live' | 'rec' | 'prep'): string => `c-${courseId}-${kind}`;

// Tray slots: a push replaces the shown notification with the same tag (Android tag, iOS collapse id).
// Live has its own slot so the end-of-broadcast dismiss never removes a newer recording or prep notice.
export const LIVE_TAG = 'live';
export const NOTICE_TAG = 'notice';
export const DISMISS_LIVE = { dismiss: LIVE_TAG } as const;
