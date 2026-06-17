# Publishing

Both packages (`cantip`, `create-cantip`) are versioned in lockstep and published
together. CI verifies every push/PR (`.github/workflows/ci.yml`); releases are cut
by pushing a `v*` tag (`.github/workflows/release.yml`).

**Pushing the tag is the whole release.** It triggers, in order:

1. **Release** (`release.yml`, on the `v*` tag) — verify build → `npm publish`
   both packages via OIDC.
2. **Docker image** (`docker.yml`, `workflow_run` after Release succeeds) — builds
   and pushes the `cantip-host` image to GHCR. It runs *after* Release (not off the
   tag) so the npm publish has landed first, since the image scaffolds itself from
   `npx create-cantip@<version>`.

So a normal release just needs the version bump + tag (below); **pushing `main`
alone publishes nothing** — the tag is what releases. Nothing here is run by hand
or by the assistant beyond pushing the tag; the image is **never** pushed manually.

## One-time setup

The release workflow uses **npm OIDC trusted publishing** — no `NPM_TOKEN` secret.
But OIDC cannot create a brand-new package, so the **first publish is manual**, and
trusted publishing is configured afterwards.

### 1. First publish (manual)

```sh
npm login
npm run release        # npm publish -w cantip && npm publish -w create-cantip
```

### 2. Configure trusted publishing (once per package)

On npmjs.com, for **each** of `cantip` and `create-cantip`:

> Package → Settings → Trusted Publisher → GitHub Actions

- Repository: `Sedokina/cantip`
- Workflow filename: `release.yml`

After this, the workflow publishes tokenlessly (with provenance).

## Cutting a release

1. Bump both package versions together (keeps the scaffolder's pinned `cantip`
   dependency matching the engine):

   ```sh
   npm version 0.1.1 -w cantip -w create-cantip --no-git-tag-version
   git commit -am "Release v0.1.1"
   ```

2. Tag and push:

   ```sh
   git tag v0.1.1
   git push && git push --tags
   ```

The `release` workflow runs: **verify** (typecheck + build + serve smoke-test) →
**publish** both packages via OIDC. When it succeeds, the **Docker image**
workflow fires automatically — no extra action.

## Docker image (`cantip-host`)

`docker.yml` builds the generic host image (`ghcr.io/<owner>/cantip-host`) and
tags it `<version>` + `latest`. Two ways it runs:

- **Automatically** after a successful Release (`workflow_run`). It reads the
  version from `packages/cantip/package.json`, **waits for `create-cantip@<version>`
  to appear on npm**, then builds with `--build-arg CANTIP_VERSION=<version>`.
- **Manually** via `workflow_dispatch` (Actions tab → Docker image → Run) with a
  `version` input — for re-runs or ad-hoc builds of an already-published version.

The image **scaffolds its Remix app from `create-cantip`'s template**, so it has
no hand-written app code: anything the host must expose — route stubs, entry
files — lives in `packages/create-cantip/template/`. **New routes only reach the
image if added there** (e.g. the `app/routes/jira.*` + `api.jira` stubs). The
image carries no per-client data; content/branding are read at runtime from the
mounted `/docs` volume.

## Updating consumers

Content-only deploys (e.g. `~/dev/projects/a consumer`) pin the engine via the
image tag in their `docker-compose.yml`
(`ghcr.io/sedokina/cantip-host:<version>`). After a release, bump that tag, then
on the server `docker compose pull && docker compose up -d`. Feature env (e.g.
`JIRA_*`) is supplied via a gitignored `.env` next to the compose file
(`env_file: .env`, optional), never committed.

## Notes

- Versions must match between the two packages: `create-cantip` injects
  `cantip@^<its-own-version>` into scaffolded projects, so a mismatch would pin a
  non-existent engine version.
- The engine ships a prebuilt `dist/` (compiled by `prepublishOnly`); consumers do
  not rebuild on install.
