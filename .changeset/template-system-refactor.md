---
"@lucid-agents/create-agent-kit": minor
"@lucid-agents/agent-kit": minor
---

Complete template system refactor with improved validation and safety

- **Renamed environment variables** for clarity: `ADDRESS` → `PAYMENTS_RECEIVABLE_ADDRESS`, `APP_NAME` → `AGENT_NAME`, `AUTO_REGISTER` → `IDENTITY_AUTO_REGISTER`
- **Removed default payment address** (issue #2) - prevents accidental fund loss by requiring explicit wallet address configuration
- **Added validation** for agent metadata (name, version, description) and payment configuration with clear error messages (issue #8)
- **Centralized validation** in new `validation.ts` module for reusable, consistent validation logic
- **Simplified .env generation** - pure `KEY=VALUE` format, all prompts written to .env regardless of value
- **Standardized wizard terminology** - all templates use "wizard" consistently, removed "onboarding"
- **Unified wizard prompts** - all templates share identical core prompts for consistency
- **Added `--wizard=no` flag** for non-interactive usage in CI/CD environments
- **Removed code generation** from templates - pure runtime configuration via `process.env`
- **Removed `DEFAULT_TEMPLATE_VALUES`** duplication - `template.json` is single source of truth
- **Simplified codebase** - removed ~100 lines of complex .env parsing logic

Breaking changes: Existing projects must update environment variable names in their `.env` files.
