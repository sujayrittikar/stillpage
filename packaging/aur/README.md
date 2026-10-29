# AUR package: stillpage-bin

Repackages the `.deb` from the matching GitHub release. To publish a new version:

1. Publish the GitHub release (`vX.Y.Z`, with `Stillpage-X.Y.Z-amd64.deb` attached).
2. Here, set `pkgver=X.Y.Z` and `pkgrel=1`, then refresh checksums and metadata:

   ```bash
   updpkgsums
   makepkg --printsrcinfo > .SRCINFO
   ```

3. Copy `PKGBUILD`, `.SRCINFO` and `stillpage.install` into your clone of
   `ssh://aur@aur.archlinux.org/stillpage-bin.git`, commit and push.
