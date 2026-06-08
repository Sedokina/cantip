# Publishing

Both packages (`kantip`, `create-kantip`) are versioned in lockstep and published
together. CI verifies every push/PR (`.github/workflows/ci.yml`); releases are cut
by pushing a `v*` tag (`.github/workflows/release.yml`).

## One-time setup

The release workflow uses **npm OIDC trusted publishing** — no `NPM_TOKEN` secret.
But OIDC cannot create a brand-new package, so the **first publish is manual**, and
trusted publishing is configured afterwards.

### 1. First publish (manual)

```sh
npm login
npm run release        # npm publish -w kantip && npm publish -w create-kantip
```

### 2. Configure trusted publishing (once per package)

On npmjs.com, for **each** of `kantip` and `create-kantip`:

> Package → Settings → Trusted Publisher → GitHub Actions

- Repository: `Sedokina/kantip`
- Workflow filename: `release.yml`

After this, the workflow publishes tokenlessly (with provenance).

## Cutting a release

1. Bump both package versions together (keeps the scaffolder's pinned `kantip`
   dependency matching the engine):

   ```sh
   npm version 0.1.1 -w kantip -w create-kantip --no-git-tag-version
   git commit -am "Release v0.1.1"
   ```

2. Tag and push:

   ```sh
   git tag v0.1.1
   git push && git push --tags
   ```

The `release` workflow runs: **verify** (typecheck + build + serve smoke-test) →
**publish** both packages via OIDC.

## Notes

- Versions must match between the two packages: `create-kantip` injects
  `kantip@^<its-own-version>` into scaffolded projects, so a mismatch would pin a
  non-existent engine version.
- The engine ships a prebuilt `dist/` (compiled by `prepublishOnly`); consumers do
  not rebuild on install.
