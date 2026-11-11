export interface Badging {
  packageName?: string;
  versionCode?: string;
  versionName?: string;
}
export declare const REPO: string;
export declare const PACKAGE: string;
export declare const ASSET_NAME: string;
export declare const SIGNER_SHA256: string;
export declare function releaseTag(versionName: string): string;
export declare function gradleVersion(gradle: string): { versionCode?: string; versionName?: string };
export declare function parseBadging(badging: string): Badging;
export declare function parseSigners(apksigner: string): string[];
export declare function apkProblems(input: { badging: Badging; signers: string[]; expected: { versionCode?: string; versionName?: string } }): string[];
export declare function releaseNotes(changelogs: { ar: string; en: string }): string;
export declare function releaseArgs(input: { tag: string; asset: string; notesFile: string }): string[];
