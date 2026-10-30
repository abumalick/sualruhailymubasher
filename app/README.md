# app

Capacitor 8 + Preact. Bundle id `net.h2.albadrlessons`.

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

## iOS release (macOS, Xcode)

    pnpm install && pnpm --filter app build
    cd app && npx cap sync ios
    cd ios/App
    xcodebuild -scheme App -configuration Release -destination 'generic/platform=iOS' \
      -archivePath build/App.xcarchive -allowProvisioningUpdates \
      DEVELOPMENT_TEAM=<team id> archive

Then export/upload the archive from Xcode Organizer (or `xcodebuild -exportArchive`) to App Store Connect / TestFlight.
