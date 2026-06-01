---
name: project-release
description: This project's procedure to cut a release — version bump, changelog, tag, and publish/deploy verification. Use when asked to release or ship a version.
version: 1.0.0
metadata:
  hermes:
    tags: [release, deploy, project]
    category: software-development
---
# Project Release

## When to Use
When cutting a release or shipping a version. Not for routine merges.

## Procedure
1. Confirm `main` is green: full test suite + pre-commit review pass.
2. Decide the version (semver): patch/minor/major based on the changes since the
   last tag.
3. Update the changelog: summarize user-facing changes since the last tag.
4. Bump the version in the project's manifest (`<package file>`).
5. Commit `chore(release): vX.Y.Z`, then tag `vX.Y.Z`.
6. Build the deployment image if applicable (`docker build -t <image>:vX.Y.Z .`).
7. Publish/deploy per the project's target, then **verify live**: health check,
   smoke test, or a known-good request returns success.
8. Record the release in `docs/decisions/` if it carried notable changes.

## Pitfalls
- Tagging before tests pass on the exact commit being tagged.
- Changelog written from commit subjects alone — describe user impact, not diffs.
- Reporting success before verifying the deployed artifact actually runs.

## Verification
- The tag exists on the released commit, the changelog reflects real user-facing
  changes, and a post-deploy check confirms the release is live and healthy.
