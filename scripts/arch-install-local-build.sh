#!/usr/bin/env bash

VERSION=${VERSION:-"0.0.0"}

# Clean up the tmp directory
rm -rf tmp/* || exit 1;

# Copy the built .deb file and PKGBUILD template to the tmp directory
cp "dist/kulala-desktop_amd64.deb" "tmp/kulala-desktop.deb" || exit 2;
cp "scripts/local/PKGBUILD" "tmp/PKGBUILD" || exit 3;

# Calculate the SHA256 checksum of the .deb file
CHECKSUM=$(sha256sum "tmp//kulala-desktop.deb" | awk '{print $1}')

# Replace placeholders in the PKGBUILD template with the actual version and checksum
sed -i "s/PLACEHOLDER_VERSION/$VERSION/g" "tmp/PKGBUILD" || exit 4;
sed -i "s/PLACEHOLDER_CHECKSUM/$CHECKSUM/g" "tmp/PKGBUILD" || exit 5;

# Change to the tmp directory
cd tmp || exit 6;

# .. and build the package using makepkg
makepkg --syncdeps --install --noconfirm || exit 7;
