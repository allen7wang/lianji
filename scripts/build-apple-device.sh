#!/bin/bash
# Local signed build; certificates stay in the user's macOS Keychain.
set -euo pipefail
cd "$(dirname "$0")/.."
platform="${1:-}"
if [[ "$platform" != ios && "$platform" != watchos ]]; then
  echo 'Usage: bash scripts/build-apple-device.sh ios|watchos' >&2; exit 2
fi
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'A Mac with Xcode is required.' >&2; exit 2
fi
: "${LIANJI_TEAM_ID:?Set LIANJI_TEAM_ID to the existing signing Team ID}"
: "${LIANJI_DEVICE_UDID:?Set LIANJI_DEVICE_UDID to the physical iPhone or Watch destination ID shown by Xcode}"
xcodebuild -version
if [[ "$platform" == ios ]]; then
  npm ci --no-audit --no-fund
  npx expo prebuild --platform ios --no-install --no-clean
  pod install --project-directory=ios
  export NODE_BINARY="$(command -v node)"
  project=(-workspace ios/app.xcworkspace -scheme app)
  sdk=iphoneos
else
  project=(-project apple/LianjiApple.xcodeproj -scheme LianjiWatch)
  sdk=watchos
fi
# Release bundles JS for iOS and requires no Metro server. Do not override Bundle IDs.
xcodebuild "${project[@]}" -configuration Release -sdk "$sdk" \
  -destination "id=$LIANJI_DEVICE_UDID" -derivedDataPath "device-build/$platform" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  CODE_SIGN_STYLE=Automatic "DEVELOPMENT_TEAM=$LIANJI_TEAM_ID" CODE_SIGNING_ALLOWED=YES build
printf 'Signed build completed. Install/run through Xcode using the same Team and Bundle ID; see docs/apple-device-testing.md.\n'
