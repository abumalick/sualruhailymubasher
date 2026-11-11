# Al-Badr lessons

Monorepo: `app/` (Capacitor + Vite), `server/` (Cloudflare Worker + D1), `agent/` (Python transcription agent, uv), `shared/` (types shared by app and server).

## Testing

This repo expects thorough tests. Every change ships with tests that would fail without it, and the whole suite stays green: `pnpm test` and `pnpm typecheck` at the root, `uv run pytest` in `agent/`.

- `pnpm test` includes `app/test/visual/`, which renders in real Chromium and WebKit (vitest browser mode). On a new machine install the browsers once: `pnpm --filter app exec playwright install --with-deps chromium webkit`.
- Test as much of the behaviour as possible. A change that cannot be tested as written is a design problem: restructure the code until it can be tested.
- Keep decisions in pure functions, separate from I/O and UI, so they can be unit-tested without a device, network or database. Examples: `app/src/logic/`, `server/src/estimate.ts`, `server/src/schedule.ts`. Components, route handlers, cron jobs and the agent's CLI should stay thin: they gather inputs, call the logic and apply the result.
- Put external services (Mixlr, al-badr.net, FCM, D1, the Claude CLI, PDFs) behind small boundaries, so tests can replace them with fakes instead of calling the real service.
- Use clean-architecture layering where it makes testing easier. Don't add layers that buy no test coverage.
- Prefer tests that use real data shapes, such as captured API responses, real lesson texts and real page numbers, over invented ones.
- Beyond unit tests, check the change in the running app. Test in the browser at phone width everything that can be tested there (the `dev-browser` skill). Test on the Huawei test phone (the `android-adb` skill) only what needs a real device: native audio, pushes, WebView behaviour, the media notification. The tablet and the moto are the owner's devices; use them only when the owner asks.
- When something can only be checked on a device or live (audio, pushes, the Mixlr embed), say so in the report and describe how it was checked, or state that it was not.

## Production agent

**The main checkout's `agent/` runs in production** every 15 minutes (`albadr-agent.timer`). Never edit, check out
or install anything in the main checkout, and never touch that timer.

<!-- worktree-harness:begin -->
## Worktree development (required)

**HARD RULE — never edit the main checkout's working tree for code.** Every task
that touches files, however small, starts in its own worktree. The main checkout
stays on `main`, always, and its branch must never change. Uncommitted changes in
the main checkout may belong to sibling agents: never commit, stash or revert them.

Worktrees live inside the repo in `.worktrees/<branch-slug>` (gitignored).

- **Start** — `wt="$(scripts/worktree.sh start <branch>)" && cd "$wt"`. One command:
  it creates the worktree from `main` (or resumes and rebases it), copies
  `server/.dev.vars`, runs `pnpm install`, builds the app and runs `cap sync android` (the
  Android Gradle tests need the files it generates), then starts that worktree's own servers in
  the background and waits until they answer. It exits non-zero, with the log's last
  lines, if the servers die or don't answer within about 90 s (`WH_START_TIMEOUT`). On a
  timeout the servers keep running and a second `start` refuses until they answer;
  `scripts/worktree.sh down <branch>` stops them. It prints only the worktree path
  (folder names are slugified: never guess the path). If the current checkout has no
  `scripts/worktree.sh`, run the main checkout's copy by its absolute path.
  `create <branch>` does only the worktree part; `up <branch> --bg` only starts the
  servers and `down <branch>` only stops them. Branch names need letters a-z or digits
  (folder and host names are built from them; an Arabic-only name is refused).
  A branch cut before the harness existed has no `scripts/dev-server.sh`: rebase it
  onto `main` first. Branch names are capped at 49 characters (host-name limit).
- **Servers** — each worktree runs its own `wrangler dev` with its own local D1
  (`server/.wrangler/state`, migrated and seeded from `server/seed/dev.sql` at every
  start) and its own Vite, which proxies `/api` to that Worker; Vite starts only once
  that worktree's own Worker holds its port and answers. App URL:
  `https://lessons-radio-<worktree-dir>.dev.sageplex.com` (the API is under `/api`
  at the same URL). Course titles end in "(محلي)" so local data can't be mistaken for
  production. The Worker's own port is in the log (`api: http://127.0.0.1:<port>`),
  under `.worktrees/.logs/<slug>.log`, with the agent's settings for it.
  **Run the agent from a worktree only with its own cache**: `API_BASE=http://127.0.0.1:<port>`,
  the `ADMIN_TOKEN` from `server/.dev.vars` and `ALBADR_AGENT_CACHE=$wt/.tmp/agent-cache`.
  The default cache (`~/.cache/albadr-agent/`) belongs to the production agent: it reuses
  cached verdicts and PATCHes them into production, and its run lock lives there too.
  Cron jobs don't run in `wrangler dev`, so nothing is ingested or pushed on its own.
  Every D1 command must carry `--local`: `wrangler.jsonc` names the production database.
- **Work** — edit, run and commit only inside that path.
- **Finish** — commit on your branch and report it. Agents never merge: the
  orchestrator reviews and runs `scripts/worktree.sh finish <branch>`, which merges into
  `main` in the main checkout with `--no-ff` (there is no remote). **That merge deploys
  `agent/`**: the production timer runs the main checkout's code on its next tick, so
  review a branch that changes `agent/` as a production deploy.
- **Clean up** — `scripts/worktree.sh remove <branch>` stops every process running in
  the worktree (servers included), removes it and deletes the branch; it refuses an
  unmerged or dirty branch unless given `--force`. `scripts/worktree.sh list` shows
  each worktree's merged/dirty state and stray processes. Never remove, restart or
  `create`/`up` a worktree another agent owns.
<!-- worktree-harness:end -->

<!-- superpowers-usage:begin -->
## Use superpowers for the work (when installed)

The `superpowers` skills auto-load at session start; this reinforces them and covers
hosts/clones where the plugin is absent. **Inside the worktree, use them for the craft:**
- **Before building a feature** → `superpowers:brainstorming`, then `superpowers:writing-plans`.
- **Fixing a bug** → `superpowers:systematic-debugging` first.
- **While implementing** → `superpowers:test-driven-development`.
- **Before finishing** → `superpowers:requesting-code-review` + `superpowers:verification-before-completion`.

**The worktree lifecycle stays with this harness, not superpowers:**
- Create / run / clean up worktrees with `scripts/worktree.sh` — **never
  `superpowers:using-git-worktrees`**, which makes a plain, unwired worktree that does
  not run this project's server/DB/env.
- Integration is the orchestrator's `scripts/worktree.sh finish` — do **not** use
  `superpowers:finishing-a-development-branch`, which would re-offer merge/PR choices
  that fight the configured flow.
<!-- superpowers-usage:end -->
