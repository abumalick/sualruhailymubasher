// The `update` field of /api/state. Its name and shape must never change: every installed app reads it to know
// whether it may still run, including copies that can no longer read anything else the server sends.
export type UpdatePlatform = 'android' | 'ios';
export interface PlatformUpdate { min: string | null; latest: string | null; }
export type UpdatePolicy = Partial<Record<UpdatePlatform, PlatformUpdate>>;

export const UPDATE_PLATFORMS: UpdatePlatform[] = ['android', 'ios'];
const VERSION = /^\d+(\.\d+){0,3}$/;

export const isVersion = (v: unknown): v is string => typeof v === 'string' && VERSION.test(v);

// Version names, never build numbers: iOS build numbers start over with each version.
export function compareVersions(a: string, b: string): number | null {
  if (!isVersion(a) || !isVersion(b)) return null;
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Reads whatever the app received; anything unreadable becomes null, which means "no update asked".
export function parseUpdatePolicy(raw: unknown): UpdatePolicy | null {
  if (!isRecord(raw)) return null;
  const policy: UpdatePolicy = {};
  for (const p of UPDATE_PLATFORMS) {
    const v = raw[p];
    if (isRecord(v)) policy[p] = { min: isVersion(v.min) ? v.min : null, latest: isVersion(v.latest) ? v.latest : null };
  }
  return policy;
}

// What the admin may store. A minimum needs a latest at least as high, so a typo can't lock everyone out
// of a version that doesn't exist yet.
export function updatePolicyProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return 'expected an object';
  for (const key of Object.keys(raw)) {
    if (!UPDATE_PLATFORMS.includes(key as UpdatePlatform)) return `unknown platform ${key}`;
    const v = raw[key];
    if (!isRecord(v)) return `${key}: expected { min, latest }`;
    for (const f of ['min', 'latest'] as const) {
      if (v[f] !== null && !isVersion(v[f])) return `${key}.${f}: expected a version name or null`;
    }
    if (v.min !== null && (v.latest === null || compareVersions(v.min as string, v.latest as string)! > 0)) {
      return `${key}: min must not exceed latest`;
    }
  }
  return null;
}
