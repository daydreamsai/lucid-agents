set shell := ['bash', '-uc']
set dotenv-load := true

# Colours
RED:= '\033[31m'
GREEN:= '\033[32m'
YELLOW:= '\033[33m'
BLUE:= '\033[34m'
MAGENTA:= '\033[35m'
CYAN:= '\033[36m'
WHITE:= '\033[37m'
BOLD:= '\033[1m'
UNDERLINE:= '\033[4m'
INVERTED_COLOURS:= '\033[7m'
RESET := '\033[0m'
NEWLINE := '\n'

# Default: show available recipes
default:
    @just --list --unsorted --list-heading $'{{BOLD}}{{GREEN}}Available commands:{{NEWLINE}}{{RESET}}'

# Build all packages (clean first)
build-all-clean:
    @echo -e $'{{BOLD}}{{CYAN}}Cleaning and building all packages...{{RESET}}'
    bun run build:clean
    @echo -e $'{{BOLD}}{{GREEN}}All packages built successfully!{{RESET}}'

# Build all packages
build-all:
    @echo -e $'{{BOLD}}{{CYAN}}Building all packages...{{RESET}}'
    bun run build:packages
    @echo -e $'{{BOLD}}{{GREEN}}All packages built successfully!{{RESET}}'

# Install dependencies for all packages
install-all:
    @echo -e $'{{BOLD}}{{CYAN}}Installing all dependencies...{{RESET}}'
    bun install
    @echo -e $'{{BOLD}}{{GREEN}}All dependencies installed!{{RESET}}'

# Check linting/formatting/types across all packages
check-all: lint-check-all format-check-all type-check-all
    @echo -e $'{{BOLD}}{{GREEN}}All checks passed!{{RESET}}'

# Fix all issues (lint + format)
fix-all: lint-fix-all format-fix-all
    @echo -e $'{{BOLD}}{{GREEN}}All issues fixed!{{RESET}}'

# Check linting across all packages
lint-check-all:
    @echo -e $'{{BOLD}}{{CYAN}}Running linting across all packages...{{RESET}}'
    bun run lint
    @echo -e $'{{BOLD}}{{GREEN}}Linting check passed!{{RESET}}'

# Fix linting issues across all packages
lint-fix-all:
    @echo -e $'{{BOLD}}{{CYAN}}Fixing linting issues across all packages...{{RESET}}'
    bun run lint:fix
    @echo -e $'{{BOLD}}{{GREEN}}Linting issues fixed!{{RESET}}'

# Check formatting across all packages
format-check-all:
    @echo -e $'{{BOLD}}{{CYAN}}Checking formatting across all packages...{{RESET}}'
    bun run format:check
    @echo -e $'{{BOLD}}{{GREEN}}Formatting check passed!{{RESET}}'

# Fix formatting issues across all packages
format-fix-all:
    @echo -e $'{{BOLD}}{{CYAN}}Fixing formatting issues across all packages...{{RESET}}'
    bun run format
    @echo -e $'{{BOLD}}{{GREEN}}Formatting issues fixed!{{RESET}}'

# Check types across all packages
type-check-all:
    @echo -e $'{{BOLD}}{{CYAN}}Checking types across all packages...{{RESET}}'
    bun run type-check
    @echo -e $'{{BOLD}}{{GREEN}}Type check passed!{{RESET}}'

# Lint check for a specific package
lint-check PACKAGE:
    @echo -e $'{{BOLD}}{{CYAN}}Checking {{PACKAGE}} linting...{{RESET}}'
    cd packages/{{PACKAGE}} && bun run lint
    @echo -e $'{{BOLD}}{{GREEN}}{{PACKAGE}} linting check passed!{{RESET}}'

# Lint fix for a specific package
lint-fix PACKAGE:
    @echo -e $'{{BOLD}}{{CYAN}}Fixing {{PACKAGE}} linting issues...{{RESET}}'
    cd packages/{{PACKAGE}} && bun run lint:fix
    @echo -e $'{{BOLD}}{{GREEN}}{{PACKAGE}} linting issues fixed!{{RESET}}'

# Format check for a specific package
format-check PACKAGE:
    @echo -e $'{{BOLD}}{{CYAN}}Checking {{PACKAGE}} format...{{RESET}}'
    cd packages/{{PACKAGE}} && bun run format:check
    @echo -e $'{{BOLD}}{{GREEN}}{{PACKAGE}} format check passed!{{RESET}}'

# Format fix for a specific package
format-fix PACKAGE:
    @echo -e $'{{BOLD}}{{CYAN}}Formatting {{PACKAGE}}...{{RESET}}'
    cd packages/{{PACKAGE}} && bun run format
    @echo -e $'{{BOLD}}{{GREEN}}{{PACKAGE}} formatted!{{RESET}}'

# Type check for a specific package
type-check PACKAGE:
    @echo -e $'{{BOLD}}{{CYAN}}Checking {{PACKAGE}} types...{{RESET}}'
    cd packages/{{PACKAGE}} && bun run type-check
    @echo -e $'{{BOLD}}{{GREEN}}{{PACKAGE}} type check passed!{{RESET}}'

# Build a specific package
build PACKAGE:
    @echo -e $'{{BOLD}}{{CYAN}}Building {{PACKAGE}}...{{RESET}}'
    cd packages/{{PACKAGE}} && bun run build
    @echo -e $'{{BOLD}}{{GREEN}}{{PACKAGE}} built successfully!{{RESET}}'

# ===== Test Database Commands =====

# Start test database
testdb-start:
    @echo -e $'{{BOLD}}{{CYAN}}Starting test database...{{RESET}}'
    @cd platform/dev && docker compose up -d test-db
    @echo -e $'{{BOLD}}{{CYAN}}Waiting for database to be ready...{{RESET}}'
    @sleep 2
    @docker exec lucid-agents-test-db psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'lucid_agents_test'" | grep -q 1 || docker exec lucid-agents-test-db psql -U postgres -c "CREATE DATABASE lucid_agents_test;"
    @echo -e $'{{BOLD}}{{GREEN}}Test database started on port 5435{{RESET}}'

# Stop test database
testdb-stop:
    @echo -e $'{{BOLD}}{{CYAN}}Stopping test database...{{RESET}}'
    @cd platform/dev && docker compose stop test-db
    @echo -e $'{{BOLD}}{{GREEN}}Test database stopped!{{RESET}}'

# Reset test database
testdb-reset:
    @just testdb-stop
    @just testdb-start

# ===== Test Commands =====

# Run all tests
test-all:
    @echo -e $'{{BOLD}}{{CYAN}}Running all tests...{{RESET}}'
    bun test
    @echo -e $'{{BOLD}}{{GREEN}}All tests passed!{{RESET}}'

# Run payment tests with test database
test-payments:
    @echo -e $'{{BOLD}}{{CYAN}}Running payment tests...{{RESET}}'
    @cd packages/payments && TEST_POSTGRES_URL="postgresql://postgres:test_password@localhost:5435/lucid_agents_test?schema=public" bun test
    @echo -e $'{{BOLD}}{{GREEN}}Payment tests completed!{{RESET}}'

# Clean all build artifacts
clean-all:
    @echo -e $'{{BOLD}}{{CYAN}}Cleaning all build artifacts...{{RESET}}'
    find packages -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
    find packages -name "build" -type d -exec rm -rf {} + 2>/dev/null || true
    @echo -e $'{{BOLD}}{{GREEN}}All build artifacts cleaned!{{RESET}}'

# Release: version packages
release-version:
    @echo -e $'{{BOLD}}{{CYAN}}Versioning packages...{{RESET}}'
    bun run release:version
    @echo -e $'{{BOLD}}{{GREEN}}Packages versioned!{{RESET}}'

# Release: publish packages
release-publish:
    @echo -e $'{{BOLD}}{{CYAN}}Publishing packages...{{RESET}}'
    bun run release:publish
    @echo -e $'{{BOLD}}{{GREEN}}Packages published!{{RESET}}'

# Full release flow
release:
    @echo -e $'{{BOLD}}{{CYAN}}Running full release flow...{{RESET}}'
    bun run release
    @echo -e $'{{BOLD}}{{GREEN}}Release completed!{{RESET}}'

# Show help
help:
    @echo -e $'{{BOLD}}{{GREEN}}Lucid Agents Development Commands{{RESET}}'
    @echo -e $'{{BOLD}}{{CYAN}}Quick Start:{{RESET}}'
    @echo -e $'  just install-all  # Install dependencies'
    @echo -e $'  just build-all    # Build all packages'
    @echo -e $'  just check-all    # Run all checks'
    @echo -e $''
    @echo -e $'{{BOLD}}{{CYAN}}Code Quality:{{RESET}}'
    @echo -e $'  just check-all       # Check all (lint + format + types)'
    @echo -e $'  just fix-all         # Fix all issues'
    @echo -e $'  just lint-check-all  # Check linting'
    @echo -e $'  just lint-fix-all    # Fix linting'
    @echo -e $'  just format-check-all # Check formatting'
    @echo -e $'  just format-fix-all  # Fix formatting'
    @echo -e $'  just type-check-all  # Check types'
    @echo -e $''
    @echo -e $'{{BOLD}}{{CYAN}}Package-specific:{{RESET}}'
    @echo -e $'  just build PACKAGE        # Build specific package'
    @echo -e $'  just lint-check PACKAGE   # Lint specific package'
    @echo -e $'  just lint-fix PACKAGE     # Fix lint in specific package'
    @echo -e $'  just format-check PACKAGE # Format check specific package'
    @echo -e $'  just format-fix PACKAGE   # Format fix specific package'
    @echo -e $'  just type-check PACKAGE   # Type check specific package'
    @echo -e $''
    @echo -e $'{{BOLD}}{{CYAN}}Release:{{RESET}}'
    @echo -e $'  just release         # Full release flow'
    @echo -e $'  just release-version # Version packages'
    @echo -e $'  just release-publish # Publish packages'
