# Beat Our AI — FantasyXI stall game

A small browser game for our college AI/ML stall. A group of visitors builds one Fantasy Premier
League-style team for a real past gameweek (GW37 of 2025-26), locks it, then sees it scored with the
real results against the team our FantasyXI AI picked for the same week.

It is a static website: no server code, no database, no accounts. Once built it works offline.

## What you need

- **Node.js 20 or newer** (the LTS version from https://nodejs.org is fine). Check with:
  ```
  node -v
  ```
- Git, to clone the repo.

## 1. Install (once)

```
git clone <this repo's URL>
cd fantasyxi-stall
npm install
```

`npm install` downloads the tools listed in `package.json` into a `node_modules/` folder.
That folder is not committed; everyone runs `npm install` themselves.

## 2. Run it while developing

```
npm run dev
```

Open the address it prints (usually http://localhost:5173/). The page reloads when you save a file.
In this mode a yellow **"dev: jump to screen"** bar appears at the top so you can jump to any screen.
It never appears in the real (built) site. Stop the server with `Ctrl+C`.

## 3. Run the tests

```
npm test
```

## 4. Build the real site

```
npm run build
```

This checks the TypeScript, then writes the finished website into `dist/`. Everything in `dist/`
(code, fonts, game data) is local and uses relative paths, so it works from any folder or from
GitHub Pages.

## 5. Try the built site

```
npm run preview
```

Open http://localhost:4173/. This serves exactly what is in `dist/`, so it's the best test of what
visitors will see.

Note: opening `dist/index.html` by double-clicking it does **not** work (browsers block loading the
game data from `file://`). Always use a local server like `npm run preview`.

## Operator page

Add `#/admin` to the address (e.g. http://localhost:4173/#/admin) or press **Ctrl+Shift+A**.
It's a convenience page for the stall operator, **not** a security feature.

## Project layout

```
public/data/        game data (exported once from the original FantasyXI project)
src/state/          the screen-by-screen flow (a reducer)
src/data/           loading the game data
src/engine/         game rules and scoring (pure TypeScript)
src/screens/        one file per screen
src/components/     shared pieces of UI
src/styles/         colours/spacing tokens, base styles, bundled fonts
```

## Spoiler guard

The data needed while building a team (`pregame.json`) contains no points, predictions or AI team.
The results file (`reveal.json`) is loaded only after the team is locked. This avoids accidental
spoilers; it is **not** secure, since anyone can open the files.

## Licences

Fonts: Inter and Barlow Condensed, SIL Open Font License (see `src/styles/fonts/`).
