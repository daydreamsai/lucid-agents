# Release channels and version discipline

Lucid packages are independently versioned. Never assume one monorepo-wide version. Read every installed `@lucid-agents/*` range and the lockfile before using an API.

## Stable projects

Registry ranges such as `^4.1.0` or exact versions are the stable channel. Use declarations in `node_modules`, the package README shipped for that version, and its published exports. Do not copy code from the monorepo's current branch unless it is compatible with the installed version.

## Next and contributor projects

`workspace:*`, `link:`, and `file:` dependencies indicate local source. Read the checked-out packages, package tests, root `AGENTS.md`, and generated templates. Build dependencies topologically before diagnosing consumer type errors.

## Mixed projects

A mixture of local and registry Lucid packages is unsafe because shared contracts can diverge. Stop and ask whether the project should use published packages or the local workspace. Do not repair the symptom with casts, re-exports, or duplicated types.

## Upgrade procedure

1. Record current package versions and adapter.
2. Read changelogs and changesets for every package being upgraded.
3. Upgrade the smallest coherent dependency set.
4. Reinstall and inspect the resolved lockfile.
5. Type-check, run package tests, and smoke-test discovery plus one entrypoint.
6. Treat route, manifest, authorization, and persistent-state changes as migrations.

The skill's version is independent of package versions. Keep all installed skill files from the same release archive.
