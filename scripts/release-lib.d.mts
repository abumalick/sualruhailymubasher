export interface Version {
  name: string;
  code: number;
}
export type BumpKind = 'patch' | 'minor' | 'major';
export declare const VERSION_FILES: string[];
export declare function readVersions(gradle: string, pbxproj: string): { android: Version; ios: string };
export declare function compareVersions(a: Version, b: Version): -1 | 0 | 1;
export declare function planRelease(input: { changedPaths: string[]; before: Version; after: Version }): string[];
export declare function bumpVersion(input: { gradle: string; pbxproj: string; kind: BumpKind }): {
  gradle: string;
  pbxproj: string;
  version: Version;
};
export type Platform = 'android' | 'ios' | 'web';
export interface Entry {
  file: string;
  platforms: Platform[];
  ar: string;
  en: string;
}
export type Channel = 'github' | 'play-internal' | 'play' | 'testflight' | 'appstore';
export declare function parseEntry(file: string, json: string): Entry;
export declare const FALLBACK_NOTES: { ar: string; en: string };
export declare function composeNotes(entries: Entry[], platform: 'android' | 'ios', lang: 'ar' | 'en', limit: number): string;
export declare const CHANNELS: Record<Channel, { platform: 'android' | 'ios'; cursor: 'github' | 'play' | 'appstore' }>;
export declare function latestTag(tags: string[], cursor: string): string | null;
