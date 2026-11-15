# app

Capacitor 8 + Preact. iOS bundle id `com.sualruhailymubasher.app` (Apple team H8JDJQSJ7M); Android application id: see `applicationId` in `android/app/build.gradle`.

## Web build

    pnpm --filter app build
    cd app && npx cap sync android   # or ios

Untracked config required: `app/android/app/google-services.json`, `app/ios/App/App/GoogleService-Info.plist`.

## Android release

Signing reads `SUALRUHAILY_KEYSTORE`, `SUALRUHAILY_KEYSTORE_PASSWORD`, `SUALRUHAILY_KEY_ALIAS`, `SUALRUHAILY_KEY_PASSWORD` from the environment. A release build (`assembleRelease`, `bundleRelease`) fails without them rather than produce an unsigned app; debug builds do not need them.

    set -a; source ~/.config/sualruhailymubasher/env; set +a
    cd app/android && ./gradlew assembleRelease
    apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
    adb install -r app/build/outputs/apk/release/app-release.apk

`google-services.json` must contain a client for `com.sualruhailymubasher.app`: without one the google-services
plugin fails the build, and without the file it is skipped and push silently stops working. The current
file is `~/.config/sualruhailymubasher/google-services.com.sualruhailymubasher.app.json`.

## Google Play (fastlane)

Everything Play-side goes through fastlane, run from the repo root. The listing (texts, icon, feature
graphic, screenshots, changelogs) is in `fastlane/metadata/android/`. Secrets stay in
`~/.config/sualruhailymubasher/`: `env` (upload key, read by the `build` lane) and `play-service-account.json`
(Play API key; override with `SUALRUHAILY_PLAY_JSON_KEY`). Play App Signing re-signs the bundle.

Releases normally go through `scripts/release.sh` (see "Releases" in the root `CLAUDE.md`): `bump` raises
`versionCode` and `versionName` together and writes the changelogs from `changes/`. The lanes below are what
it runs, and still work by hand.

    fastlane android build                 # signed bundle only
    fastlane android validate_credentials  # the key reaches the Play Console
    fastlane android upload_metadata       # listing and images, no release
    fastlane android internal              # build + upload the bundle and its changelogs to internal testing
    fastlane android production validate_only:true   # check the promotion without sending it
    fastlane android production            # promote the internal release to production review

`production` promotes the internal release whose versionCode is in `build.gradle`. While the app has never
been published, Play accepts only draft releases (`fastlane android internal status:draft`, `fastlane
android production status:draft`); finish those in the console (roll out, or Publishing overview → send
for review). Store settings (category, contact details) and countries are set in the console too. Content rating, target audience, data safety, ads and app
access have no API: they are answered in the console (answers in `docs/store/google-play.md`).

## Sideloaded APK (GitHub releases, Obtainium)

Besides Play, each release is published as an APK on the public, releases-only repository
[abumalick/sualruhailymubasher](https://github.com/abumalick/sualruhailymubasher) (no source there), which
[Obtainium](https://github.com/ImranR98/Obtainium) follows. `scripts/release.sh` publishes it with every
version bump, before the Play internal upload. On its own, or to retry a failed publish:

    fastlane android github_apk   # web build + cap sync, signed release APK, checks, GitHub release
    node scripts/github-apk.mjs check   # only the GitHub check: is v<versionName> still free?

It needs `gh` logged in with write access to the repository, and the SDK build-tools (`aapt2`,
`apksigner`) under `$ANDROID_HOME` (default `~/Android/Sdk`).

The APK is signed by its own key, not the Play upload key: `~/.config/sualruhailymubasher/obtainium-apk.env`
(override with `SUALRUHAILY_GITHUB_APK_SIGNING_ENV`) and `obtainium-apk.jks` beside it, both backed up in Bitwarden
("Sualruhaily Mubasher Obtainium APK signing key"). The lane overrides any signing variables already in the
environment. Losing this key means Obtainium users must uninstall and reinstall; a Play install and an
Obtainium install cannot update each other.

`scripts/github-apk.mjs` refuses to publish unless the APK's package and versions match `build.gradle` and
its only signer is the certificate pinned in `SIGNER_SHA256`. The release is tagged `v<versionName>`
(Obtainium compares it with the installed versionName), carries one asset, `sualruhaily-mubasher.apk`, with the
notes `scripts/release.sh` wrote to `.tmp/release-notes/github/` (the Android entries since the previous
GitHub release), and is marked latest. A tag that already exists is never replaced, so raise
`versionName` together with `versionCode` for every release.

## iOS release (macOS, fastlane)

Everything goes through fastlane, from the repository root on the Mac (`fastlane/Fastfile.ios`):

    fastlane ios beta build_number:<versionCode>   # web build + cap sync, archive, export, checks, upload to TestFlight
    fastlane ios build build_number:<versionCode>  # the same without the upload (IPA in .tmp/ios-build)
    fastlane ios metadata    # listing (fastlane/metadata/ios), age rating, review notes, screenshots
    fastlane ios privacy     # App Privacy answers (fastlane/app_privacy_details.json), Apple ID login, see below
    fastlane ios store_setup # once, for the first release: free, every territory
    fastlane ios submit      # latest TestFlight build of MARKETING_VERSION to App Review, released on approval
    fastlane ios build_status

Screenshots come from the web build with real lessons from the production API:
`scripts/store-screenshots.sh ios` writes `fastlane/screenshots/ios/ar-SA/` (1320x2868, the 6.9-inch
iPhone); `android` writes Play's `fastlane/metadata/android/ar/images/phoneScreenshots/` (1080x1920).

The build number is Android's `versionCode`, passed as `build_number:` (`release.sh` reads it, since the
Mac's copy has no `app/android/`), so both platforms built from one commit carry the same version and
build number. The lane refuses a number TestFlight already has for `MARKETING_VERSION`: when that build
is this commit's (an upload that succeeded before the step could tag it), tag `release/testflight/<version>`
by hand; a build Apple rejected while processing still uses its number, so the version needs a bump. The lane refuses an IPA whose bundle id or version differ from
the project, or that is not signed for production APNs.

Secrets stay outside the repository, in `~/.config/sualruhailymubasher/` on the Mac (copies in Bitwarden):

| File | Content |
| --- | --- |
| `ios.env` | `APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID` of the App Store Connect API key |
| `AuthKey_<APP_STORE_KEY_ID>.p8` | that API key |
| `GoogleService-Info.com.sualruhailymubasher.app.plist` | Firebase iOS app config; the lane copies it into `app/ios/App/App/` |
| `review-contact.env` | `FIRST_NAME`, `LAST_NAME`, `PHONE_NUMBER`, `EMAIL_ADDRESS` for App Review |

The App Privacy answers are entered by hand in App Store Connect (App Privacy, then Publish), from
`fastlane/app_privacy_details.json`, which stays the source of truth: Apple has no API for them, and the
`privacy` lane's Apple ID login is refused when Apple cannot send it a verification code. Change the JSON
first, then the form, and keep both in line with the privacy page and Play's data-safety form.

Push notifications use the APNs key `HW2PGQ6N8R`, uploaded to the Firebase project `sualruhailymubasher`.
Submitting for review is a decision for the owner: run `submit` only on their go. It declares that the
app shows third-party content, which states that the owner holds the rights to it.
