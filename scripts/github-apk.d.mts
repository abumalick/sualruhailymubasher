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
export interface GithubApkIo {
  gradle(): string;
  badging(apk: string): string;
  signers(apk: string): string;
  releaseExists(tag: string): boolean;
  changelog(locale: string): string;
  stage(apk: string, notes: string): { asset: string; notesFile: string };
  createRelease(args: string[]): void;
  log(line: string): void;
}
export declare const realIo: GithubApkIo;
export declare function isReleaseNotFound(stderr: string): boolean;
export declare function verify(apk: string, io?: GithubApkIo): Badging;
export declare function check(io?: GithubApkIo): string;
export declare function publish(apk: string, io?: GithubApkIo): void;
