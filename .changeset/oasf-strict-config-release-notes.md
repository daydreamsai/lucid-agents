---
'@lucid-agents/cli': patch
'@lucid-agents/identity': patch
---

Fix OASF strict configuration rollout issues for identity scaffolding and validation.

- CLI: stop emitting gated OASF env defaults when `IDENTITY_INCLUDE_OASF=false`, preventing false startup conflicts in generated identity projects.
- Identity: align strict OASF validation with documented JSON-array contract by allowing empty arrays.
- Identity: treat `IDENTITY_OASF_ENDPOINT` and `IDENTITY_OASF_VERSION` as conflicting OASF values when OASF is disabled.
- Tests: add regression coverage for CLI `.env` generation and strict OASF validation/conflict detection.
