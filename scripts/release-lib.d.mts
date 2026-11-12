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
