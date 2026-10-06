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
(code, fonts, game data) is local and uses relative paths, so it works from any folder, any
sub-path, or from Vercel.

## 5. Try the built site

```
npm run preview
```

Open http://localhost:4173/. This serves exactly what is in `dist/`, so it's the best test of what
visitors will see.

Note: opening `dist/index.html` by double-clicking it does **not** work. Browsers block the game's
scripts and data when a page is opened as a file (`file://`), so a small local server is always
needed. `npm run preview` (or the launcher below) is that server.

## 6. Stall laptop: offline copy (the main copy on the day)

Once, **with internet**: install Node.js (LTS), then in this folder run `npm install` and
`npm run build`. After that, no internet is needed.

On the day: **double-click `start-stall.bat`**. It:

- checks Node.js, the installed tools (`node_modules`) and the built site (`dist`), and tells you
  in plain words what to run if something is missing;
- serves the site at **http://localhost:4173/**, always this exact address (`--strictPort`: if
  the port is busy it stops with a message instead of moving to another port);
- opens that address in your default browser.

Keep the black window open while the stall runs; closing it stops the game.

**Why the fixed address matters:** the leaderboard is saved inside the browser (`localStorage`),
separately for every exact address (`http` + host + port) and every browser profile.
`http://localhost:4173` and `http://127.0.0.1:4173` are different boards, and so are the Vercel
site and another laptop. The admin page shows which address the current board belongs to.

## 7. Deploy to Vercel (online backup copy)

Vercel builds the site from GitHub itself; there is no workflow file and no `vercel.json`.

1. Push this repo to GitHub (a private repo on your personal account is fine on Vercel's free
   Hobby plan).
2. Go to https://vercel.com, sign in **with GitHub**, then **Add New… → Project**.
3. Under "Import Git Repository", find this repo and click **Import**. If it isn't listed, click
   "Adjust GitHub App Permissions" and give Vercel access to it.
4. Check the settings: **Framework Preset: Vite**, **Build Command: `npm run build`**,
   **Output Directory: `dist`**, Install Command: default. Root Directory: leave as `./`.
   No environment variables are needed.
5. Click **Deploy**. When it finishes, the address (like `https://<project>.vercel.app`) is shown on
   the project's page under **Domains**.

From then on, every push to `main` redeploys automatically (other branches get preview addresses).
Refreshing on `#/admin` works on Vercel too, because everything after `#` stays in the browser.
The Vercel copy has its **own** leaderboard (different address).

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
