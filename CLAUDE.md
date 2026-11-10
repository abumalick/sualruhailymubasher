# Al-Badr lessons

Monorepo: `app/` (Capacitor + Vite), `server/` (Cloudflare Worker + D1), `agent/` (Python transcription agent, uv), `shared/` (types shared by app and server).

## Testing

This repo expects thorough tests. Every change ships with tests that would fail without it, and the whole suite stays green: `pnpm test` and `pnpm typecheck` at the root, `uv run pytest` in `agent/`.

- Test as much of the behaviour as possible. A change that cannot be tested as written is a design problem: restructure the code until it can be tested.
- Keep decisions in pure functions, separate from I/O and UI, so they can be unit-tested without a device, network or database. Examples: `app/src/logic/`, `server/src/estimate.ts`, `server/src/schedule.ts`. Components, route handlers, cron jobs and the agent's CLI should stay thin: they gather inputs, call the logic and apply the result.
- Put external services (Mixlr, al-badr.net, FCM, D1, the Claude CLI, PDFs) behind small boundaries, so tests can replace them with fakes instead of calling the real service.
- Use clean-architecture layering where it makes testing easier. Don't add layers that buy no test coverage.
- Prefer tests that use real data shapes, such as captured API responses, real lesson texts and real page numbers, over invented ones.
- When something can only be checked on a device or live (audio, pushes, the Mixlr embed), say so in the report and describe how it was checked, or state that it was not.
