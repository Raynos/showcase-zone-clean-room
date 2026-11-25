# CRATEFALL working notes

A single-player game that must feel like an MMO zone and play like a AAA PS5
MMORPG, mobile first (iPhone 17 Pro, portrait 402×874, touch). TypeScript,
three.js (WebGL2), Rapier, Vite. The brief is `README.md`, the zone spec is
`ZONE-DESCRIPTION.md`, and the roadmap with the owner's settled decisions is
`docs/AAA-PLAN.md`. Read the plan section you are working on before you start.

## Commands

- `npx tsc --noEmit` typechecks the whole project. Keep it clean.
- `npm run build` typechecks and builds to `dist/`.
- A no-HMR test server normally runs on port 5174
  (`npx vite --config vite.test.config.ts`). Do not kill it. Restart it only
  if a newly added glob-loaded module is not picked up.
- Live build: https://raynos.github.io/showcase-zone-clean-room/

## Looking at the game

Use `agent-browser` with your own session name so parallel agents do not
collide: `export AGENT_BROWSER_SESSION=<your-name>`.

    agent-browser set viewport 402 874 2
    agent-browser open "http://localhost:5174/?dev&q=medium"
    agent-browser eval "<js>"          # or: echo "<js>" | agent-browser eval --stdin
    agent-browser screenshot /abs/path.png

- `?dev` skips the title and adds a cheat drawer. `?q=medium` forces the phone
  quality tier (`low`, `high`, `ultra` also work).
- After load `window.game` exists. Handy handles: `game.player.pos`,
  `game.player.teleport(x, y, z, yaw)`, `game.terrain.h(x, z)`,
  `game.cameraRig.snap(yaw, pitch)`, `game.env.forcedHour = 12`,
  `game.state.god = true`, `game.state.reset(); location.reload()` for a
  true fresh start, `game.mobs.list`, `game.panels.open('bag')`,
  `game.hooks.enterVault()`, `game.hooks.enterArena()`.
- Drive movement through `game.input.stick = {active, x, y}` fields and
  `game.input.press('attack')` / `release`. `input.moveX/moveY` are
  overwritten every frame.
- The zone spans x and z in [-250, 250]. Town is near (-30, 0); x > 0 is the
  combat half. Elites only spawn when the player is 16–95 m away.
- Quest progress comes from events. Calling an interactable's `onUse()`
  directly skips the `interact` event and the quest bump.
- Judge everything at phone size. Read your screenshots; do not assume.

## Shell caveats

- A hook rejects shell output redirects to variable paths (`> $DIR/file`) and
  misfires on heredocs containing `${...}` with `>`. Create files with the
  Write tool and literal paths; edit source with the Edit tool.
- Scratch files and screenshots go outside the repo, or in `shots/`
  (git-ignored). Never leave stray files in the tree.

## Working alongside other agents

Several agents may be editing this tree at once.

- Stay inside the files your task names. If you must touch a shared file
  (`src/game.ts`, `src/gfx/renderer.ts`), make a small local edit and re-read
  the region first.
- If the page fails to load, another agent may be mid-edit: wait 30 seconds
  and retry before you investigate.
- Commit your own work when a slice is verified, by explicit path:
  `git commit <paths> -m "..."`. Never `git add -A`, never amend, never push.
  If the index is locked, wait and retry.
- Every commit message ends with these two trailer lines:

      Assisted-by: Claude:<your own model ID, e.g. claude-opus-5-5>
      Claude-Session: https://claude.ai/code/session_015pj4RxnggAB11XCHX4C2b5

## Standards

- No placeholder art, no grey boxes, no empty space. If something is not
  good enough to ship, say so in your report; do not hide it.
- Report what you verified and how, and what you did not verify.
- Do not recreate any specific existing game, its characters or its art.
