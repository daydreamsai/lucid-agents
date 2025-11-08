# @lucid-agents/agent-kit

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

### Patch Changes

- @lucid-agents/agent-kit-identity@1.2.0

## 1.1.2

### Patch Changes

- fixed 8004 agent metadata generation
- Updated dependencies
  - @lucid-agents/agent-kit-identity@1.1.2

## 1.1.1

### Patch Changes

- patch
- Updated dependencies
  - @lucid-agents/agent-kit-identity@1.1.1

## 1.1.0

### Minor Changes

- bumps

### Patch Changes

- Updated dependencies
  - @lucid-agents/agent-kit-identity@1.1.0

## 1.0.0

### Patch Changes

- Updated dependencies
  - @lucid-agents/agent-kit-identity@1.0.0

## 0.2.25

### Patch Changes

- bump and namechange

## 0.2.24

### Patch Changes

- fix bug in GET route
- Updated dependencies
  - @lucid-agents/agent-kit-identity@0.2.24
  - @lucid-agents/agent-auth@0.2.24
  - @lucid-dreams/client@0.2.24

## 0.2.23

### Patch Changes

- agent kit fix and invoke page allowing wallet payments
- Updated dependencies
  - @lucid-agents/agent-auth@0.2.23
  - @lucid-agents/agent-kit-identity@0.2.23
  - @lucid-dreams/client@0.2.23

## 0.2.22

### Patch Changes

- fix favicon
- Updated dependencies
  - @lucid-agents/agent-kit-identity@0.2.22
  - @lucid-agents/agent-auth@0.2.22
  - @lucid-dreams/client@0.2.22

## 0.2.21

### Patch Changes

- fix hot
- Updated dependencies
  - @lucid-agents/agent-auth@0.2.21
  - @lucid-agents/agent-kit-identity@0.2.21
  - @lucid-dreams/client@0.2.21

## 0.2.20

### Patch Changes

- 7e25582: update
- fixed kit issue with pricing
- Updated dependencies [7e25582]
- Updated dependencies
  - @lucid-agents/agent-kit-identity@0.2.20
  - @lucid-agents/agent-auth@0.2.20
  - @lucid-dreams/client@0.2.20

## 0.2.19

### Patch Changes

- c023ca0: hey
- Updated dependencies [c023ca0]
  - @lucid-agents/agent-kit-identity@0.2.19
  - @lucid-agents/agent-auth@0.2.19
  - @lucid-dreams/client@0.2.19

## 0.2.18

### Patch Changes

- f470d6a: bump
- Updated dependencies [f470d6a]
  - @lucid-agents/agent-kit-identity@0.2.18
  - @lucid-agents/agent-auth@0.2.18
  - @lucid-dreams/client@0.2.18

## 0.2.17

### Patch Changes

- bump
- Updated dependencies
  - @lucid-agents/agent-kit-identity@0.2.17
  - @lucid-agents/agent-auth@0.2.17
  - @lucid-dreams/client@0.2.17

## 0.2.16

### Patch Changes

- up
- Updated dependencies
  - @lucid-agents/agent-kit-identity@0.2.16
  - @lucid-agents/agent-auth@0.2.16
  - @lucid-dreams/client@0.2.16

## 0.2.15

### Patch Changes

- be4c11a: bump
- Updated dependencies [be4c11a]
  - @lucid-agents/agent-kit-identity@0.2.15
  - @lucid-agents/agent-auth@0.2.15
  - @lucid-dreams/client@0.2.15

## 0.2.14

### Patch Changes

- bumps
- bump
- Updated dependencies
- Updated dependencies
  - @lucid-agents/agent-auth@0.2.14
  - @lucid-agents/agent-kit-identity@0.2.14
  - @lucid-dreams/client@0.2.14

## 0.2.13

### Patch Changes

- bumps
- Updated dependencies
  - @lucid-dreams/client@0.2.13

## 0.2.12

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.12

## 0.2.11

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.11

## 0.2.10

### Patch Changes

- bump it
- Updated dependencies
  - @lucid-dreams/client@0.2.10

## 0.2.9

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.9

## 0.2.8

### Patch Changes

- bump build
- Updated dependencies
  - @lucid-dreams/client@0.2.8

## 0.2.7

### Patch Changes

- examples and cleanup
- Updated dependencies
  - @lucid-dreams/client@0.2.7

## 0.2.6

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.6

## 0.2.5

### Patch Changes

- bump
- bump
- Updated dependencies
- Updated dependencies
  - @lucid-dreams/client@0.2.5

## 0.2.4

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.4

## 0.2.3

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.3

## 0.2.2

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.2

## 0.2.1

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.1

## 0.2.0

### Minor Changes

- bump

### Patch Changes

- Updated dependencies
  - @lucid-dreams/client@0.2.0
