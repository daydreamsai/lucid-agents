# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage versioning and releases.

- Queue a release: `bun run changeset`
- Review and merge the Version Packages pull request after master CI succeeds.
- Wait for CI on that committed version bump; the release bot publishes the
  exact verified master commit.
- Use the manual Release workflow only for recovery. Live mode rejects pending
  changesets; dry-run mode versions, builds, packs, and simulates publication
  only in its ephemeral checkout.

Local `bun run release` and `bun run release:publish` intentionally require a
release-workflow CI attestation and are not version-and-publish shortcuts.

The release dry run derives the exact workspace set from the root manifest and
fails closed if a workspace manifest is missing, malformed, or duplicated.
Every public workspace must produce one matching npm artifact, and every
declared entrypoint, type, export, and executable file must be present in that
artifact before publication can proceed.
