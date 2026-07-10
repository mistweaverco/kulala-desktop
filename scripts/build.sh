#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_PLATFORM="${TARGET_PLATFORM:-${PLATFORM:-}}"
VERSION="${VERSION:-$(jq -r '.version' "$ROOT_DIR/package.json")}"

if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
  echo "Error: VERSION is not set"
  exit 1
fi
if [ -z "$TARGET_PLATFORM" ]; then
  echo "Error: TARGET_PLATFORM is not set"
  exit 1
fi

export VERSION
export TARGET_PLATFORM

update_package_json_version() {
  local tmp
  tmp=$(mktemp)
  jq --arg v "$VERSION" '.version = $v' package.json > "$tmp" && mv "$tmp" package.json
}

fetch_kulala_core() {
  "$ROOT_DIR/scripts/fetch-kulala-core.sh"
}

prepare_build_output() {
  rm -rf "$ROOT_DIR/dist/linux-unpacked" "$ROOT_DIR/dist/"*.deb "$ROOT_DIR/dist/"*.AppImage
}

update_package_json_version

build_windows() {
  prepare_build_output
  fetch_kulala_core
  pnpm run build && pnpm exec electron-builder --win --publish never
}

build_linux() {
  prepare_build_output
  fetch_kulala_core
  pnpm run build && pnpm exec electron-builder --linux deb --publish never && \
    pnpm run build && pnpm exec electron-builder --linux appimage --publish never
}

build_linux_arm64() {
  # NOTE:
  # One might imagine we could use `electron-builder --arm64` here, but
  # it doesn't work as expected.
  # There is an issue when building snap packages.
  # Instead, we build each target individually.
  prepare_build_output
  fetch_kulala_core
  pnpm run build && pnpm exec electron-builder --linux deb --publish never --arm64 && \
    pnpm run build && pnpm exec electron-builder --linux appimage --publish never --arm64
}

build_arch_local() {
  prepare_build_output
  fetch_kulala_core
  pnpm run build && pnpm exec electron-builder --linux deb --publish never
}

build_macos() {
  prepare_build_output
  fetch_kulala_core
  pnpm run build && pnpm exec electron-builder --mac --publish never
}

case $TARGET_PLATFORM in
  "linux")
    build_linux
    ;;
  "linux-arm64")
    build_linux_arm64
    ;;
  "arch-local")
    build_arch_local
    ;;
  "macos")
    build_macos
    ;;
  "windows")
    build_windows
    ;;
  *)
    echo "Error: PLATFORM $TARGET_PLATFORM is not supported"
    exit 1
    ;;
esac
