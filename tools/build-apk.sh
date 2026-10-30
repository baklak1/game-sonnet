#!/usr/bin/env bash
# Збирає веб-бандл, кладе його в assets і збирає підписаний release APK.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
npm run build
mkdir -p android/app/src/main/assets/www
cp dist/index.html android/app/src/main/assets/www/index.html
python3 tools/gen-icons.py
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
GRADLE=${GRADLE:-gradle}
if [ -x android/gradlew ]; then GRADLE="./gradlew"; fi
(cd android && $GRADLE assembleRelease --no-daemon --console=plain)
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk "release/DTEK-Svitlo-Ye-$VERSION.apk"
echo "APK: release/DTEK-Svitlo-Ye-$VERSION.apk"
