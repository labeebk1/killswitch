# CI workflow templates

These workflow YAMLs are tracked here as **templates** because the
OAuth token used by the platform engineer agent does not carry the
`workflow` scope, which GitHub requires to push files under
`.github/workflows/`.

To activate them, someone with `workflow` scope (the repo owner is
fine) needs to copy them into place:

```bash
mkdir -p .github/workflows
cp infrastructure/ci-templates/publish-cli.yml    .github/workflows/
cp infrastructure/ci-templates/publish-docker.yml .github/workflows/
git add .github/workflows/
git commit -m "ci: install publish-cli + publish-docker workflows"
git push
```

Once installed, both workflows trigger on version tags
(`v[0-9]+.[0-9]+.[0-9]+`).

## What each workflow does

### `publish-cli.yml`

Tag → `pnpm install` → `pnpm -r build` → bundle `packages/cli` with
esbuild (inlines `@killswitch/shared` so the published package
doesn't carry a private workspace dep) → publish `killswitch` to npm
with provenance attestations.

**Required secret:** `NPM_TOKEN` (npm automation token with publish
access to the `killswitch` package).

### `publish-docker.yml`

Tag → multi-arch build (`linux/amd64`, `linux/arm64`) of
`docker/Dockerfile` → push to `ghcr.io/labeebk1/killswitch-cli` →
cosign keyless sign → write the resolved digest to
`docker/PINNED_IMAGE` and auto-commit it back to `main` so the CLI
can re-exec into a hash-pinned image rather than a mutable tag.

**Required permissions** (declared in the workflow):
`contents: write`, `packages: write`, `id-token: write`.

## Why these are separate workflows

Splitting the npm and Docker publishes into two jobs means a failure
on one (e.g. npm registry outage) doesn't block the other from
shipping the release artifact users actually need at any given
moment. Both gate on the same tag, so the release atom is still a
single `git tag vX.Y.Z && git push --tags`.
