# NOFIDA

NOFIDA is a corporate Figma-like design system and editor for internal design teams.

Current version:

- React
- TypeScript
- Vite
- Tailwind
- Zustand
- RU/EN interface
- Canvas tools
- Local editor state
- GitHub Pages deployment

## Local development

```bash
npm install
npm run dev
```

Local app:

```text
http://localhost:5173/
```

## Verification

```bash
npm run typecheck
npm run build
npm run build:github
```

## GitHub Pages deployment

This project is prepared for GitHub Pages under the repository path:

```text
/NOFIDA/
```

The GitHub Pages build uses:

```bash
npm run build:github
```

The workflow publishes the `dist` directory.

Expected public URL:

```text
https://oopsie-star.github.io/NOFIDA/
```

## Required GitHub setting

In the GitHub repository:

1. Open Settings.
2. Open Pages.
3. Set Source to GitHub Actions.
4. Push to `main`.
5. Open the Actions tab and wait for `Deploy NOFIDA to GitHub Pages`.

## Important

If the repository name changes, update the `base` value in `vite.config.ts`.

Current expected base:

```ts
base: "/NOFIDA/"
```

## Product direction

NOFIDA is not a prototype generator.

NOFIDA is a working corporate design environment for designers:

* Figma-like interface
* Corporate ownership of files
* Multilingual UI
* Design-system control
* Developer handoff
* Future Supabase backend for auth, files, teams, roles and audit

```
```
