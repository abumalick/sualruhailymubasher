# app

Capacitor 8 + Preact. iOS bundle id `com.albadrmubasher.app` (Apple team H8JDJQSJ7M); Android application id: see `applicationId` in `android/app/build.gradle`.

## Web build

    pnpm --filter app build
    cd app && npx cap sync android   # or ios

Untracked config required: `app/android/app/google-services.json`, `app/ios/App/App/GoogleService-Info.plist`.

## Android release

Signing reads `ALBADR_KEYSTORE`, `ALBADR_KEYSTORE_PASSWORD`, `ALBADR_KEY_ALIAS`, `ALBADR_KEY_PASSWORD` from the environment; without them the release APK is unsigned.

    set -a; source ~/.config/albadr-lessons/env; set +a
    cd app/android && ./gradlew assembleRelease
    apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
    adb install -r app/build/outputs/apk/release/app-release.apk

For Google Play, build the bundle instead (upload key; Play App Signing re-signs it). Raise `versionCode`
in `android/app/build.gradle` first: Play refuses a code it has already seen.

    cd app/android && ./gradlew bundleRelease
    keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab

## iOS release (macOS, fastlane)

Everything goes through fastlane, from the repository root on the Mac (`fastlane/Fastfile.ios`):

    fastlane ios beta        # web build + cap sync, archive, export, checks, upload to TestFlight
    fastlane ios build       # the same without the upload (IPA in .tmp/ios-build)
    fastlane ios metadata    # listing (fastlane/metadata/ios), age rating, review notes, screenshots
    fastlane ios privacy     # App Privacy answers (fastlane/app_privacy_details.json), Apple ID login, see below
    fastlane ios store_setup # once, for the first release: free, every territory
    fastlane ios build_status

Screenshots come from the web build with real lessons from the production API:
`scripts/store-screenshots.sh ios` writes `fastlane/screenshots/ios/ar-SA/` (1320x2868, the 6.9-inch
iPhone); `android` writes Play's `fastlane/metadata/android/ar/images/phoneScreenshots/` (1080x1920).

The build number is the latest TestFlight build of `MARKETING_VERSION` plus one, so only
`MARKETING_VERSION` is bumped by hand. The lane refuses an IPA whose bundle id or version differ from
the project, or that is not signed for production APNs.

Secrets stay outside the repository, in `~/.config/albadr-lessons/` on the Mac (copies in Bitwarden):

| File | Content |
| --- | --- |
| `ios.env` | `APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID` of the App Store Connect API key |
| `AuthKey_<APP_STORE_KEY_ID>.p8` | that API key |
| `GoogleService-Info.com.albadrmubasher.app.plist` | Firebase iOS app config; the lane copies it into `app/ios/App/App/` |
| `review-contact.env` | `FIRST_NAME`, `LAST_NAME`, `PHONE_NUMBER`, `EMAIL_ADDRESS` for App Review |

The App Privacy answers are entered by hand in App Store Connect (App Privacy, then Publish), from
`fastlane/app_privacy_details.json`, which stays the source of truth: Apple has no API for them, and the
`privacy` lane's Apple ID login is refused when Apple cannot send it a verification code. Change the JSON
first, then the form, and keep both in line with the privacy page and Play's data-safety form.

Push notifications use the APNs key `HW2PGQ6N8R`, uploaded to the Firebase project `albadr-lessons`.
Submitting for review stays a manual decision: no lane submits.
