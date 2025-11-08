# @lucid-agents/create-agent-kit

## 1.2.0

### Minor Changes

- e5b652c: Complete template system refactor with improved validation and safety

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

## 1.1.2

### Patch Changes

- fixed 8004 agent metadata generation

## 1.1.1

### Patch Changes

- patch

## 1.1.0

### Minor Changes

- bumps

## 1.0.0

## 0.2.25

### Patch Changes

- bump and namechange

## 0.2.24

### Patch Changes

- fix bug in GET route

## 0.2.23

### Patch Changes

- agent kit fix and invoke page allowing wallet payments

## 0.2.22

### Patch Changes

- fix favicon

## 0.2.21

### Patch Changes

- fix hot

## 0.2.20

### Patch Changes

- 7e25582: update
- fixed kit issue with pricing

## 0.2.19

### Patch Changes

- c023ca0: hey

## 0.2.18

### Patch Changes

- f470d6a: bump

## 0.2.17

### Patch Changes

- bump

## 0.2.16

### Patch Changes

- up

## 0.2.15

### Patch Changes

- be4c11a: bump

## 0.2.14

### Patch Changes

- bumps
- bump

## 0.2.13

### Patch Changes

- bumps

## 0.2.12

### Patch Changes

- bump

## 0.3.0

### Minor Changes

- add interactive onboarding prompts for agent metadata, pricing, and payments scaffolding.
- accept CLI invocations without an explicit `<app-name>` by prompting (or defaulting) to a sensible directory name.

## 0.2.11

### Patch Changes

- bump

## 0.2.10

### Patch Changes

- bump it

## 0.2.9

### Patch Changes

- bump

## 0.2.8

### Patch Changes

- bump build

## 0.2.7

### Patch Changes

- examples and cleanup

## 0.2.6

### Patch Changes

- bump

## 0.2.5

### Patch Changes

- bump
- bump

## 0.2.4

### Patch Changes

- bump

## 0.2.3

### Patch Changes

- bump

## 0.2.2

### Patch Changes

- bump

## 0.2.1

### Patch Changes

- bump

## 0.2.0

### Minor Changes

- bump
