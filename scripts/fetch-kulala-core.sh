#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$ROOT_DIR/resources/kulala-core"
DEFAULT_VERSION="$(sed -n 's/^export const DEFAULT_CORE_VERSION = "\(.*\)";$/\1/p' "$ROOT_DIR/src/main/kulala-core/constants.ts")"
VERSION="${KULALA_CORE_VERSION:-$DEFAULT_VERSION}"
TARGET_PLATFORM="${TARGET_PLATFORM:-${PLATFORM:-}}"
BASE_URL="https://github.com/mistweaverco/kulala-core/releases/download/v${VERSION}"

if [ -z "$TARGET_PLATFORM" ]; then
  echo "Error: TARGET_PLATFORM is not set" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

file_size_bytes() {
  stat -c%s "$1" 2>/dev/null || stat -f%z "$1"
}

download_asset() {
  local asset="$1"
  local dest="$DEST_DIR/$asset"
  local url="$BASE_URL/$asset"

  echo "Downloading $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$dest" "$url"
  else
    echo "Error: curl or wget is required to download kulala-core" >&2
    exit 1
  fi
}

move_installed_name() {
  local asset="$1"
  local installed="$2"
  mv "$DEST_DIR/$asset" "$DEST_DIR/$installed"
  if [ "${installed##*.}" != "exe" ]; then
    chmod +x "$DEST_DIR/$installed"
  fi
}

chmod_asset() {
  local asset="$1"
  if [ "${asset##*.}" != "exe" ]; then
    chmod +x "$DEST_DIR/$asset"
  fi
}

validate_linux_binary() {
  local bin="$1"
  local min_size="$2"

  if [ ! -f "$bin" ]; then
    return 1
  fi

  local size
  size=$(file_size_bytes "$bin")
  if [ "$size" -lt "$min_size" ]; then
    echo "kulala-core binary too small (${size} bytes, expected at least ${min_size})" >&2
    return 1
  fi

  if ! printf '%s\n' '{"action":"parse","content":"GET https://example.com"}' | "$bin" 2>/dev/null | grep -q '"blocks"'; then
    echo "kulala-core binary failed smoke test (stdin JSON parse)" >&2
    return 1
  fi

  return 0
}

validate_size_only() {
  local bin="$1"
  local min_size="$2"
  [ -f "$bin" ] && [ "$(file_size_bytes "$bin")" -ge "$min_size" ]
}

stage_linux_binary() {
  local asset="$1"
  local min_size="$2"
  local installed="kulala-core"

  if validate_linux_binary "$DEST_DIR/$installed" "$min_size"; then
    echo "kulala-core binary already present and valid: $installed"
    return 0
  fi

  echo "Refreshing kulala-core binary ($installed)"
  rm -f "$DEST_DIR/$installed" "$DEST_DIR/$asset"
  download_asset "$asset"
  chmod_asset "$asset"
  move_installed_name "$asset" "$installed"

  if ! validate_linux_binary "$DEST_DIR/$installed" "$min_size"; then
    echo "Error: downloaded kulala-core failed validation" >&2
    exit 1
  fi
}

stage_windows_binary() {
  local asset="kulala-core-windows-x86_64.exe"
  local installed="kulala-core.exe"
  local min_size=110000000

  if validate_size_only "$DEST_DIR/$installed" "$min_size"; then
    echo "kulala-core binary already present: $installed"
    return 0
  fi

  rm -f "$DEST_DIR/$installed" "$DEST_DIR/$asset"
  download_asset "$asset"
  move_installed_name "$asset" "$installed"

  if ! validate_size_only "$DEST_DIR/$installed" "$min_size"; then
    echo "Error: downloaded kulala-core failed size validation" >&2
    exit 1
  fi
}

stage_macos_binary() {
  local asset="$1"
  local min_size="$2"

  if validate_size_only "$DEST_DIR/$asset" "$min_size"; then
    echo "kulala-core asset already present: $asset"
    return 0
  fi

  rm -f "$DEST_DIR/$asset"
  download_asset "$asset"
  chmod_asset "$asset"

  if ! validate_size_only "$DEST_DIR/$asset" "$min_size"; then
    echo "Error: downloaded $asset failed size validation" >&2
    exit 1
  fi
}

case "$TARGET_PLATFORM" in
  linux|arch-local)
    stage_linux_binary "kulala-core-linux-x86_64" 106000000
    ;;
  linux-arm64)
    stage_linux_binary "kulala-core-linux-aarch64" 97000000
    ;;
  windows)
    stage_windows_binary
    ;;
  macos)
    stage_macos_binary "kulala-core-darwin-arm64" 60000000
    stage_macos_binary "kulala-core-darwin-x86_64" 65000000
    ;;
  *)
    echo "Error: unsupported TARGET_PLATFORM for kulala-core fetch: $TARGET_PLATFORM" >&2
    exit 1
    ;;
esac

echo "Staged kulala-core v${VERSION} for ${TARGET_PLATFORM} in ${DEST_DIR}"
