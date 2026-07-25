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
  │  3. close the CHANGELOG │
  │     ([Unreleased] →     │
  │      [TAG] — date)      │
  │  4. validate (lint +    │
  │     format + typecheck  │
  │     + test + build)     │
  │  5. commit + tag local  │
  │  6. push branch + tag   │──────────► tag push triggers
  │  7. open PR via gh      │            .github/workflows/release-npm.yml
  └─────────────────────────┘                     │
                                                  ▼
                                       ┌────────────────────────────┐
                                       │ 1. Checkout @ tag          │
                                       │ 2. tag == package.json?    │
                                       │ 3. Lint + format-check     │
                                       │ 4. Typecheck               │
                                       │ 5. Tests (vitest)          │
                                       │ 6. Build (vite + dts)      │
                                       │ 7. Smoke install           │
                                       │ 8. npm publish             │
                                       │    --provenance            │
                                       │ 9. read-back: does the     │
                                       │    registry serve it as    │
                                       │    dist-tag latest?        │
                                       │ 10. GitHub Release for the │
                                       │     tag (notes = CHANGELOG,│
                                       │     tarball attached)      │
                                       └────────────────────────────┘
```

**The three surfaces move together**: the git tag, the npm version and the GitHub
Release. The workflow fails when the tag does not describe the `package.json`
version, and fails when the registry is not serving that version as `latest` — so
"green workflow" really does mean "published and visible".

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

### `make releases-check`

A sync report across the three surfaces — one line per git tag, telling you whether the version exists on npm and whether the tag has a GitHub Release:

```text
TAG          NPM      RELEASE  STATUS
v0.24.0      ok       ok       sincronizado
v0.23.0      ok       FALTA    DESSINCRONIZADO
```

Read-only, always safe to run. Use it before and after a release.

### `make releases-sync` / `make releases-sync-dry`

Creates the **missing GitHub Releases** for tags that already exist (backfill), with the notes taken from the matching `CHANGELOG.md` section. Tags that already have a Release are skipped — the script is idempotent and never rewrites an existing Release.

```bash
make releases-sync-dry   # list what it would create, without creating anything
make releases-sync       # actually create them
```

Needed because publishing to npm and cutting the Release only started moving together in v0.24.0: earlier tags existed in git and on npm, but with no GitHub Release.

!!! info "Backfilled notes never inherit `[Unreleased]`"
    `scripts/changelog.mjs notes <version>` only falls back to the `[Unreleased]` block when given `--allow-unreleased` (which the workflow does, for a release cut before the section was dated). The backfill does **not** pass the flag — so an old tag never gets the next cycle's notes; with no section, the Release ships a pointer to `CHANGELOG.md`.

## CI workflow (`.github/workflows/release-npm.yml`)

Triggered by:

- **`push: tags: [v*.*.*]`** — the main flow. `make release TAG=X` pushes a tag and the workflow fires automatically.
- **`workflow_dispatch`** — manual via `gh workflow run release-npm.yml --ref main`. Useful when a tag's publish failed and you want to re-run without bumping the version.

Steps in the `publish` job:

1. **Checkout** (`actions/checkout@v5`) with `fetch-depth: 0`.
2. **Node 22** + `registry-url: https://registry.npmjs.org` + npm cache, plus `npm install -g npm@latest` (Trusted Publishing needs npm >= 11.5.1).
3. **Version guard** — compares the tag (`GITHUB_REF_NAME` minus the `v`) against `package.json`'s `version` and **aborts** before any publish when they diverge. It also derives `prerelease` (a version containing `-`) so the Release is marked correctly. On `workflow_dispatch` the tag is derived from `package.json`.
4. **`npm ci`**.
5. **Lint** (`npm run lint`).
6. **Format check** (`npm run format:check`).
7. **Typecheck** (`npm run typecheck`).
8. **Tests** (`npm run test:run`).
9. **Build** (`npm run build`).
10. **Smoke install** — produces a tarball via `npm pack`, installs it in `/tmp/sdk-smoke` with `react@^19 react-dom@^19` (everything else ships as a direct dependency of the package), imports the package dynamically and validates that 20 core exports are present.
11. **`npm publish --provenance --access public`** via **Trusted Publishing (OIDC)** — no `NPM_TOKEN`. `id-token: write` is what enables the sigstore provenance attestation.
12. **Registry read-back** — confirms npm serves `tempest-react-sdk@<version>` (up to 5 attempts, since the registry takes a moment to propagate) **and** that `dist-tags.latest` points at it. Fails the job otherwise: a publish that landed under a different tag would no longer look green.
13. **GitHub Release** — `gh release create <tag>` with the tarball attached and the notes extracted from the `CHANGELOG.md` section (`scripts/changelog.mjs notes <version> --allow-unreleased`), plus a link to the npm version. When the Release already exists it does `gh release edit` + `upload --clobber` instead of failing, so re-running the workflow for the same tag is safe. Requires `contents: write` on the job.

## Secrets needed on GitHub

**None.** Publishing uses npm **Trusted Publishing**: `npm publish` exchanges the GitHub Actions OIDC identity for a short-lived token, so there is no `NPM_TOKEN` in the repository. What must exist is a **Trusted Publisher** on npmjs.com pointing at this repo + the `release-npm.yml` file.

The `GITHUB_TOKEN` used to cut the Release is provided automatically by the Actions runtime — only the job's `permissions: contents: write` needs declaring, and it is.

!!! warning "`NPM_TOKEN` is still the local fallback's business"
    `make publish` publishes from your machine and does need a token in `~/.npmrc` (Classic Automation, or Granular with "Allow bypass 2FA" checked). That path produces **no** provenance and **no** GitHub Release — if you use the fallback, run `make releases-sync` afterwards so the Release is not left missing.

`GITHUB_TOKEN` is provided automatically by the Actions runtime.

## Provenance signing

The publish includes `--provenance` when run in CI. This requires:

- `permissions: id-token: write` in the workflow (already configured).
- npm >= 11.5.1 on the runner (the upgrade step handles it).
- A Trusted Publisher configured on npmjs.com for this repository.

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
