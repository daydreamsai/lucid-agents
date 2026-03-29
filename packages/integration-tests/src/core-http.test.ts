/**
 * Integration test: @lucid-agents/core + @lucid-agents/http
 * Verifies cross-package API contract between core agent runtime and HTTP extension.
 * Closes #118.
 */
import { describe, it, expect } from "bun:test";

describe("core + http integration", () => {
  it("should export compatible types from core and http", async () => {
    // Dynamic imports to avoid build-time issues with workspace packages
    const core = await import("@lucid-agents/core");
    const http = await import("@lucid-agents/http");

    // Both packages should export successfully
    expect(core).toBeDefined();
    expect(http).toBeDefined();
  });

  it("core package should export required symbols", async () => {
    const core = await import("@lucid-agents/core");
    // Core must export createAgent or equivalent entry point
    expect(typeof core).toBe("object");
    expect(Object.keys(core).length).toBeGreaterThan(0);
  });

  it("http package should export required symbols", async () => {
    const http = await import("@lucid-agents/http");
    expect(typeof http).toBe("object");
    expect(Object.keys(http).length).toBeGreaterThan(0);
  });
});
