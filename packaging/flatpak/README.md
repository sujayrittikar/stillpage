# Flatpak: io.github.sujayrittikar.stillpage

Repackages the `.deb` from the matching GitHub release on top of the Electron
base app. The Flathub copy of this manifest lives in
`github.com/flathub/io.github.sujayrittikar.stillpage`.

To publish a new version:

1. Publish the GitHub release (`vX.Y.Z`, with `Stillpage-X.Y.Z-amd64.deb` attached).
2. Add a `<release>` entry to `io.github.sujayrittikar.stillpage.metainfo.xml`.
3. In the Flathub repository, update the `.deb` URL and `sha256` in the
   manifest and copy over the metainfo file. Flathub's bot also opens this
   pull request by itself a few hours after a release, from `x-checker-data`.

The Flatpak runs under X11 (XWayland on Wayland sessions) so that spanning
across monitors works, and it cannot run LibreOffice from the host, so the
original-layout view and the older formats that need LibreOffice are
unavailable there.
