<p align="center">
  <img src="build/icon.png" width="96" alt="">
</p>

<h1 align="center">Stillpage</h1>

<p align="center">
  A calm desktop reader and notebook for Linux.<br>
  Open a PDF, a Word file, a deck or a spreadsheet, write notes beside it, and keep your music playing. All in one window.
</p>

<p align="center">
  <img src="docs/split.png" alt="A PDF on the left and a Markdown note on the right, in Stillpage's Stone theme">
</p>

## Why

Studying usually means one app for the PDF, another for notes, a browser tab for music, and a lot of alt-tabbing. Stillpage puts all of that in one quiet window. Stretch it across two monitors, split it into panes, and drag tabs wherever you need them. You never leave the page.

## What it does

- **Reads almost anything**: PDF, Word, PowerPoint and Excel, LibreOffice documents, presentations and spreadsheets (`.odt`, `.odp`, `.ods`, and the flat `.fodt`/`.fodp`/`.fods`), CSV and TSV, EPUB, Markdown, Jupyter notebooks, RTF, HTML, plain text, images, and source code in about 50 languages. Headings, lists, footnotes, tables, links and speaker notes all come through.
- **Reading view or the original pages**: Word, PowerPoint and LibreOffice files open reflowed in your theme and text size. One click on **Original** shows the pages exactly as the author laid them out, and you can still select and quote from them. If [LibreOffice](https://www.libreoffice.org) is installed, Stillpage also opens old `.doc` and `.ppt` files, drawings (`.odg`), Visio, Publisher, WordPerfect, Pages and Keynote files the same way. Without it, those files tell you the one command that installs it.
- **Two screens, one window**: `Ctrl Shift S` turns Stillpage into one full-screen window across every monitor, with the pane divider on the bezel. Press it again to go back.
- **Split panes with tabs**: up to four side-by-side panes, each with its own tabs. Drag tabs between panes, resize the dividers, and drop files from your file manager straight into a pane.
- **Notes beside the source**: write the way you read. Type `# ` for a heading, `- ` for a list, `[ ] ` for a checklist or `**bold**`, and it turns into the real thing with no symbols left behind. Select text for a small formatting bar. Notes save as you type (as Markdown underneath) and export to PDF or Markdown. Select a passage in any document and choose **Add to note** to quote it, page number included.
- **Zen mode** (`Ctrl .`): the chrome fades away and only the text remains. Move the pointer to the top edge to get the toolbar back.
- **Typography you control**: Literata or Figtree, text size, line length and spacing. Four themes: Stone, Linen, Mist and Dusk, a soft dim theme that is not pitch black. PDF pages can take on the theme's paper tone.
- **Spotify built in**: paste a playlist link into the small pill in the corner and it plays inside the app. With Premium you can also connect Spotify and control it on your phone or desktop.
- **Focus timer**: 15, 25, 50 or 90 minutes, ending with a soft chime.
- **Private by design**: everything stays on your computer. No accounts, no telemetry. The only network calls go to Spotify, and only if you connect it.

<table>
  <tr>
    <td><img src="docs/zen.png" alt="Zen mode"></td>
    <td><img src="docs/slides.png" alt="A PowerPoint deck shown as readable slides"></td>
  </tr>
  <tr>
    <td><img src="docs/dusk.png" alt="Dusk theme with a tinted PDF"></td>
    <td><img src="docs/settings.png" alt="Reading settings"></td>
  </tr>
</table>

## Install

Download the latest `.deb` or `.AppImage` from [Releases](https://github.com/sujayrittikar/stillpage/releases/latest).

**Ubuntu, Debian, Mint, Pop!_OS** (recommended). From the folder you downloaded it to:

```bash
sudo apt install ./Stillpage-*-amd64.deb
```

Stillpage then shows up in your app launcher, and "Open with Stillpage" appears in your file manager for PDFs, Office files, EPUBs and Markdown.

**Any other distro**: use the AppImage.

```bash
chmod +x Stillpage-*-x86_64.AppImage
./Stillpage-*-x86_64.AppImage
```

> On Ubuntu 24.04 and newer, AppArmor blocks the Chromium sandbox for AppImages. If the AppImage exits straight away, run it with `--no-sandbox`, or use the `.deb`, which installs the right AppArmor profile for you.

## Music

The quickest way needs no setup:

1. In Spotify, open a playlist and choose **Share → Copy link to playlist**.
2. In Stillpage, open the music pill (bottom right), paste the link and choose **Play**.
3. Choose **Sign in for full songs** once. Until you do, Spotify plays 30-second previews.

### Controlling Spotify with Premium (optional)

To see what's playing, pick from your playlists and control Spotify on your phone or desktop, connect a Spotify developer app. Spotify requires every app to have its own Client ID. It takes about two minutes:

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Add the redirect URI `http://127.0.0.1:43117/callback`.
3. Tick **Web API** and **Web Playback SDK**.
4. In Stillpage, open the music pill, expand **Control Spotify with Premium**, paste the Client ID and choose **Connect**.

Good to know:

- Spotify only allows playback control for **Premium** accounts. Pasted links work on any account.
- New Spotify apps start in development mode, which is limited to the accounts you add under *User Management* in the dashboard.
- Stillpage uses the PKCE flow, so there is no client secret. Tokens are stored locally and nowhere else.
- Release builds use [castlabs Electron](https://github.com/castlabs/electron-releases), which includes the Widevine module Spotify needs to stream audio. If Widevine is unavailable, Stillpage falls back to controlling another Spotify device.

## Keyboard

| Keys | Action |
| --- | --- |
| `Ctrl O` | Open files |
| `Alt N` | New note beside the current document |
| `Ctrl \` | Split the workspace |
| `Ctrl .` | Zen mode (`Esc` to leave) |
| `Ctrl +`, `Ctrl -`, `Ctrl 0` | Bigger, smaller, default text. In a PDF, zoom. `Ctrl` + scroll works too |
| `Ctrl Shift S` | Span all screens, or go back to one |
| `F11` | Full screen |
| `Alt W` | Close tab |
| `Ctrl Tab` | Next tab in the pane |
| `Alt 1`–`4` | Jump to a pane |
| `Ctrl B`, `Ctrl I`, `Ctrl U` | Bold, italic, underline in notes |
| `Ctrl` + scroll | Zoom a PDF |

## Develop

You need Node.js 20 or newer.

```bash
git clone https://github.com/sujayrittikar/stillpage.git
cd stillpage
npm install
npm run dev        # Vite + Electron with hot reload
npm run dist       # builds release/*.deb and release/*.AppImage
```

The project layout:

```
electron/          main process: window, app:// protocol, "Open with", Spotify login window
src/lib/parse/     one small parser per format, loaded on demand
src/lib/render.ts  picks a parser and caches the result so panes share it
src/components/    panes, viewers, notes editor, music dock
```

Every document is parsed in the renderer and sanitised with DOMPurify before display. Documents never get to run scripts or bring their own styles, so everything reads in Stillpage's typography.

## Roadmap

- Highlights and annotations stored per document
- Search across the whole library
- Math (KaTeX) in Markdown notes
- Flatpak and `.rpm` builds
- Folder of notes on disk, for syncing with Git or Syncthing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Stillpage is not affiliated with Spotify.
