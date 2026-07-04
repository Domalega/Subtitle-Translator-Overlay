# Notes

## User preference

- Practical fixes over large rewrites.
- Minimal file reads and low OpenRouter spend.
- Do not show long file lists unless requested.
- Do not run git/build/tests unless requested.

## Useful commands

Only run when explicitly requested:

```bash
npm start
npm run build
```

## Current package scripts

- `npm start` — `electron .`
- `npm run build` — `electron-builder --win portable`
- `npm run dist` — `electron-builder --win`
