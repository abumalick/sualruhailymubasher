import type { StateDTO } from '@sualruhaily/shared';

export interface LiveIntent {
  courseId: string | null;
}

// A tapped live notification. A cached state rarely knows the broadcast, so the fresh one decides; if it can't be
// fetched, the notification itself is the evidence.
export function liveIntentAction(intent: LiveIntent, view: StateDTO | null, fresh: boolean, failed: boolean): 'wait' | 'open' | 'drop' {
  if (!fresh) return failed ? 'open' : 'wait';
  return view?.live.isLive && view.live.courseId === intent.courseId ? 'open' : 'drop';
}
