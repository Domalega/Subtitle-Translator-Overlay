# Coding Style

## General

- Preserve the existing simple Electron structure.
- Do not add comments unless requested.
- Keep patches minimal.
- Avoid new dependencies.
- Avoid broad refactoring.
- Preserve current naming style.
- Prefer exact local changes over rewrites.

## JavaScript

- Current files are compact and mostly plain JavaScript.
- Preserve existing browser/Electron APIs.
- Keep IPC channel names stable unless explicitly requested.
- When changing IPC, update both `src/main.js` and `src/preload.js`.

## CSS

- Reuse existing CSS variables.
- Prefer local selector changes.
- Avoid changing unrelated themes.
- Keep overlay and tool window styles separated:
  - main overlay: `src/styles.css`
  - tool windows: `src/tool-window.css`
  - selection overlay: `src/select.css`

## HTML

- Keep markup simple.
- Do not add frameworks.
- Do not add external assets.
