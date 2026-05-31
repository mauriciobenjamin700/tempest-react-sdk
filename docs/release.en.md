# Release pipeline

How `tempest-react-sdk` is published to npm — an automatic tag-push workflow,
with a manual fallback.

## Overview

```text
Local:                                  GitHub Actions:
  make release TAG=X.Y.Z
       │
       ▼
  ┌─────────────────────────┐
  │ scripts/release.sh:     │
  │  1. branch release/vTAG │
  │  2. npm version TAG     │
  │  3. validate (lint +    │
  │     format + typecheck  │
  │     + test + build)     │
  │  4. commit + tag local  │
  │  5. push branch + tag   │──────────► tag push triggers
  │  6. open PR via gh      │            .github/workflows/release-npm.yml
  └─────────────────────────┘                     │
                                                  ▼
                                       ┌────────────────────────┐
                                       │ 1. Checkout @ tag      │
                                       │ 2. Lint + format-check │
                                       │ 3. Typecheck           │
                                       │ 4. Tests (vitest)      │
                                       │ 5. Build (vite + dts)  │
                                       │ 6. Smoke install       │
                                       │ 7. npm publish         │
                                       │    --provenance        │
                                       └────────────────────────┘
```

A tag push is the **only** way to publish. There is no "publish via PR merge" —
merging the release PR is only to sync `main` with the updated `package.json` +
`RELEASES.md`.

## Commands

### `make release TAG=0.1.5`

The full pipeline. Requires a clean working tree + a tag that doesn't exist
locally/remotely.

It blocks if `CHANGELOG.md` doesn't mention `[TAG]` or `[Unreleased]` (with a
prompt to force continuation).

### `make release TAG=0.1.5 DRY_RUN=1`

Identical, but stops before the push — you inspect the local branch and tag
before continuing manually:

```bash
git push -u origin release/v0.1.5
git push origin v0.1.5
gh pr create --base main --head release/v0.1.5 --title "chore: release v0.1.5"
```

### `make release TAG=0.1.5 SKIP_VALIDATE=1`

Skips local validation (`npm ci`, lint, format-check, typecheck, test, build,
pack dry-run). Use it only in emergencies — CI will validate again from scratch.

### `make validate`

Runs all local validation without releasing. Equivalent to the CI validation
block.

### `make publish`

The manual fallback. Requires `NPM_TOKEN` in `~/.npmrc` (a token with 2FA bypass)
or an interactive `npm login`. **It does not trigger the workflow** — it's a
direct publish.

```bash
npm config set //registry.npmjs.org/:_authToken=npm_xxx... --location=user
npm run build
make publish
```

Without a 2FA-bypass token, npm requires an OTP:

```bash
npm publish --access public --otp=123456
```

### `make releases`

Lists every `v*.*.*` tag ordered by version (most recent first).

### `make releases-md`

Regenerates `RELEASES.md` from the git tags. Called automatically by
`scripts/release.sh` after creating the tag.

## CI workflow (`.github/workflows/release-npm.yml`)

Triggered by:

- **`push: tags: [v*.*.*]`** — the main flow. `make release TAG=X` pushes a tag and the workflow fires automatically.
- **`workflow_dispatch`** — manual via `gh workflow run release-npm.yml --ref main`. Useful when a tag's publish failed and you want to re-run without bumping the version.

Steps in the `publish` job:

1. **Checkout** (`actions/checkout@v5`) with `fetch-depth: 0`.
2. **Node 22** + `registry-url: https://registry.npmjs.org` + npm cache.
3. **`npm ci`**.
4. **Lint** (`npm run lint`).
5. **Format check** (`npm run format:check`).
6. **Typecheck** (`npm run typecheck`).
7. **Tests** (`npm run test:run`).
8. **Build** (`npm run build`).
9. **Smoke install** — produces a tarball via `npm pack`, installs it in `/tmp/sdk-smoke` with **all** optional peers (`@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`, `lucide-react`) + `react@^19 react-dom@^19`, imports the package dynamically, validates that 20 core exports are present.
10. **`npm publish --provenance --access public`** using the `NPM_TOKEN` secret. The `id-token: write` permission enables the OIDC required for the sigstore provenance attestation.

## Secrets needed on GitHub

Just one:

- **`NPM_TOKEN`** — an npm token with permission to publish tempest-react-sdk + 2FA bypass enabled. To configure:
  ```bash
  gh secret set NPM_TOKEN --body "npm_xxx..."
  ```
  Recommended type: a **Classic Automation token** (2FA bypass by default) OR a **Granular Access Token** with the "Allow bypass 2FA" flag explicitly checked.

`GITHUB_TOKEN` is provided automatically by the Actions runtime.

## Provenance signing

The publish includes `--provenance` when run in CI. This requires:

- `permissions: id-token: write` in the workflow (already configured).
- The `NPM_CONFIG_PROVENANCE=true` env var (already configured).
- An npm token with `publish` permission.

The result: every published version carries an attestation signed by sigstore,
linking the tarball to the commit + workflow run that produced it. Visible on the
[registry](https://www.npmjs.com/package/tempest-react-sdk) as a "Verified
provenance" badge.

A local manual publish **cannot** get provenance — there's no OIDC provider
outside CI. `make publish` always runs without `--provenance`.

## History

See [`RELEASES.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/RELEASES.md) (auto-generated via `make releases-md`) and [`CHANGELOG.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) (written by hand before each release).

## See also

- [`CHANGELOG.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) — change log per version
- [`RELEASES.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/RELEASES.md) — tag table with date and commit
- [`Makefile`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/Makefile) — target definitions
- [`scripts/release.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/release.sh) — the pipeline bash script
