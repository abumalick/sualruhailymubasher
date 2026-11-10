import type { StateDTO } from '@albadr/shared';
import { player } from './player';

export function startLive(state: StateDTO, openSheet: () => void): void {
  const { live } = state;
  if (live.mode === 'direct' && live.streamUrl) {
    const course = state.courses.find((c) => c.id === live.courseId);
    void player.play({ url: live.streamUrl, title: course?.title ?? 'البث المباشر', subtitle: '', kind: 'live', courseId: live.courseId });
    return;
  }
  player.pause();
  openSheet();
}
