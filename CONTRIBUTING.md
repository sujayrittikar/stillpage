# Contributing to Stillpage

Thanks for helping. A few things keep the project easy to work on.

## The one rule

Stillpage exists to reduce distraction. Before adding something, ask whether it makes reading or note-taking calmer. New UI should stay hidden until someone asks for it, and nothing should move, blink or notify on its own.

## Getting started

```bash
npm install
npm run dev
```

`npm run typecheck` and `npm run lint` should pass before you open a pull request.

## Adding a file format

1. Map the extension in `src/lib/formats.ts`.
2. Add a parser in `src/lib/parse/` that returns sanitised HTML (use `clean()` from `src/lib/sanitize.ts`) or one of the structured `Rendered` shapes in `src/lib/types.ts`.
3. Wire it into `src/lib/render.ts` with a dynamic `import()`, so it only loads when someone opens that format.

## Design tokens

Colours live as CSS variables at the top of `src/styles.css`, with one block per theme. Use the variables rather than literal colours so every theme keeps working.

## Releases

Pushing a tag such as `v0.2.0` makes GitHub Actions build the `.deb` and AppImage and attach them to a draft release.
