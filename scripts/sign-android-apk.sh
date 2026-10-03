#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 2 ]]; then
  printf 'Usage: %s <built-apk> <signed-output-apk>\n' "$0" >&2
  exit 1
fi

input_apk=$1
output_apk=$2
sdk_root=${ANDROID_HOME:?Set ANDROID_HOME to the installed Android SDK}
build_tools=${LIANJI_ANDROID_BUILD_TOOLS:-35.0.0}
tools_dir="$sdk_root/build-tools/$build_tools"
keystore=${LIANJI_ANDROID_KEYSTORE:-$HOME/Library/Application Support/Lianji/Signing/Android/lianji-release.jks}
password_file=${LIANJI_ANDROID_PASSWORD_FILE:-$HOME/Library/Application Support/Lianji/Signing/Android/keystore-password.txt}
key_alias=${LIANJI_ANDROID_KEY_ALIAS:-lianji}

for required in "$input_apk" "$keystore" "$password_file"; do
  [[ -f "$required" ]] || { printf 'Missing required file: %s\n' "$required" >&2; exit 1; }
done
[[ ! -e "$output_apk" ]] || { printf 'Output already exists: %s\n' "$output_apk" >&2; exit 1; }

# Keep the existing publishing identity; this script never creates a new key.
"$tools_dir/zipalign" -c -P 16 4 "$input_apk"
mkdir -p "$(dirname "$output_apk")"
"$tools_dir/apksigner" sign \
  --ks "$keystore" \
  --ks-key-alias "$key_alias" \
  --ks-pass "file:$password_file" \
  --out "$output_apk" \
  "$input_apk"
"$tools_dir/zipalign" -c -P 16 4 "$output_apk"
"$tools_dir/apksigner" verify --verbose --print-certs "$output_apk"
