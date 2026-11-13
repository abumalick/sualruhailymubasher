import { compareVersions, type UpdatePlatform, type UpdatePolicy } from '@albadr/shared';
import { STORES } from '../site';

export interface UpdateInput {
  platform: UpdatePlatform | 'web';
  installed: string | null;
  policy: UpdatePolicy | null;
  dismissed: string | null; // the latest version the listener closed the notice for
}

export type UpdateStatus = { kind: 'required' | 'available'; version: string } | { kind: 'none'; version: null };

const NONE: UpdateStatus = { kind: 'none', version: null };
const below = (installed: string, v: string | null) => v !== null && (compareVersions(installed, v) ?? 0) < 0;

export function updateStatus({ platform, installed, policy, dismissed }: UpdateInput): UpdateStatus {
  if (platform === 'web' || !installed) return NONE;
  const p = policy?.[platform];
  if (!p?.latest) return NONE;
  if (below(installed, p.min)) return { kind: 'required', version: p.latest };
  if (below(installed, p.latest) && dismissed !== p.latest) return { kind: 'available', version: p.latest };
  return NONE;
}

// The sideloaded APK is signed with its own key, so Play can't update it: its build passes its own link.
export function updateUrl(platform: UpdatePlatform, androidOverride?: string): string {
  if (platform === 'android' && androidOverride) return androidOverride;
  return STORES.find((s) => s.id === (platform === 'android' ? 'play' : 'appstore'))!.url;
}
