# Session: Bolster Install — Blacksmith ARM64 CI Fixes

**Branch**: chore/bolster-install
**Issue**: N/A
**Created**: 2026-04-22
**Status**: complete — PR #11 open, awaiting merge

## Goal
Harden the `install-flex` automated installer and fix all Blacksmith ARM64 CI
failures that were blocking the unit and e2e test jobs on the Flexion fork.

## Approach
Fix issues in layers as they surfaced during CI runs:
1. Add `install-flex` installer script
2. Pin `OPENCODE_CHANNEL=flex` to prevent per-branch SQLite DB fragmentation
3. Fix missing build tools on Blacksmith ARM64 runners
4. Fix unit test timeouts caused by arborist npm installs during tests
5. Bump individual test timeouts that are tight on ARM64

## Session Log
- 2026-04-22: Session created
- 2026-04-22: Added `install-flex` script (already existed on branch), fixed DB fragmentation
- 2026-04-22: CI round 1 — fixed `unzip` missing (setup-bun)
- 2026-04-22: CI round 2 — fixed `make`/`g++` missing (build-essential for node-gyp)
- 2026-04-22: CI round 3 — 7 test timeouts; root-caused to `@npmcli/arborist.reify()` in tests
- 2026-04-22: CI round 4 — 1 remaining timeout; fixed shell-loop test 3s → 15s
- 2026-04-22: All CI jobs passing. PR updated.

## Key Decisions

### `OPENCODE_CHANNEL=flex` in `install-flex`
OpenCode bakes `InstallationChannel` from the git branch at build time and uses it
as the SQLite DB name suffix (`opencode-<channel>.db`). Without pinning, each
rebuild from a different branch creates a fresh empty database, losing all session
history. Pinning to `"flex"` ensures all Flexion builds share `opencode-flex.db`.
See: `packages/opencode/src/storage/db.ts:getChannelPath()`.

### `OPENCODE_DISABLE_PLUGIN_DEPS_INSTALL` flag
`config.ts` fires a background `@npmcli/arborist.reify()` for `@opencode-ai/plugin`
in every `.opencode/` directory it discovers. In tests, 7 tests were timing out
because: plugin/tool tests called `waitForDependencies()` which joined the arborist
fiber (10–30 s per test on ARM64), and the resulting CPU saturation starved
concurrent session/snapshot tests. The flag skips the install in tests; safe because
bun resolves `@opencode-ai/plugin` from the workspace `node_modules` directly.
Set unconditionally in `test/preload.ts`.

### Blacksmith ARM64 runner gaps
`blacksmith-4vcpu-ubuntu-2404` uses ARM64 and ships a minimal Ubuntu image missing:
- `unzip` — needed by `oven-sh/setup-bun@v2` to extract the downloaded bun zip
- `make`/`g++` (build-essential) — needed by `node-gyp` for `tree-sitter-powershell`
Both now installed in a single `Ensure build tools are available` step in
`.github/actions/setup-bun/action.yml` (Linux only, no-op if already present).

### Test timeout bumps
- `snapshot.test.ts` "revert handles large mixed batches": 30 s → 60 s
  (280 files + multiple git commits/patches/reverts on ARM64)
- `prompt-effect.test.ts` "loop waits while shell runs": 3 s → 15 s
  (spawns a real `sleep 0.2` subprocess; ARM64 fork/exec overhead exceeds 3 s)

## Files Changed
- `install-flex` — `OPENCODE_CHANNEL=flex` added to build command
- `.github/actions/setup-bun/action.yml` — build tools prereq + ARM64/X64 URL construction
- `.github/workflows/test.yml` — npm cache + pre-warm step (unit job)
- `packages/opencode/src/flag/flag.ts` — `OPENCODE_DISABLE_PLUGIN_DEPS_INSTALL` flag
- `packages/opencode/src/config/config.ts` — guard arborist install with new flag
- `packages/opencode/test/preload.ts` — set `OPENCODE_DISABLE_PLUGIN_DEPS_INSTALL=true`
- `packages/opencode/test/snapshot/snapshot.test.ts` — 60 s timeout on 280-file test
- `packages/opencode/test/session/prompt-effect.test.ts` — 15 s timeout on shell-loop test

## Side Effects Applied Outside the Repo
- `~/.opencode/bin/opencode` — rebuilt from this branch with `OPENCODE_CHANNEL=flex`;
  now reports `0.0.0-flex-<timestamp>` and uses `~/.local/share/opencode/opencode-flex.db`

## Next Steps
- [ ] Merge PR #11 into flex: https://github.com/flexion/opencode/pull/11
- [ ] After merge, other developers run `install-flex` to pick up all fixes
- [ ] Consider periodically running `install-flex` to stay current with `flex` branch
