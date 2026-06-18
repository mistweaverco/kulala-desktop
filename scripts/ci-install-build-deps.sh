#!/usr/bin/env bash
set -euo pipefail

PLATFORM="${1:-}"

install_linux_common() {
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends \
    build-essential \
    libarchive-tools \
    libfuse2 \
    rpm
}

case "$PLATFORM" in
  linux)
    install_linux_common
    ;;
  linux-arm64)
    install_linux_common
    sudo apt-get install -y --no-install-recommends ruby ruby-dev rubygems
    sudo gem install --no-document fpm
    echo "USE_SYSTEM_FPM=true" >> "${GITHUB_ENV:-/dev/null}"
    ;;
  windows)
    # Native modules (sqlite3) are rebuilt via electron-builder install-app-deps.
    # windows-latest includes MSVC; ilammy/msvc-dev-cmd is wired in the workflow.
    ;;
  macos)
    brew install bash
    ;;
  *)
    echo "Error: unsupported CI platform for dependency install: $PLATFORM" >&2
    exit 1
    ;;
esac
