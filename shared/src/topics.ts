export type PushKind = 'live' | 'live-other' | 'rec' | 'prep';

export interface PushData {
  kind: PushKind;
  courseId?: string;
  number: string;
}

export const LIVE_OTHER_TOPIC = 'live-other';

export const courseTopic = (courseId: string, kind: 'live' | 'rec' | 'prep'): string => `c-${courseId}-${kind}`;
