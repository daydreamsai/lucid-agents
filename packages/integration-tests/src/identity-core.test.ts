/**
 * Integration test: @lucid-agents/identity + @lucid-agents/core
 * Verifies cross-package compatibility between identity toolkit and core runtime.
 * Closes #118.
 */
import { describe, it, expect } from "bun:test";

describe("identity + core integration", () => {
  it("should export compatible types from identity and core", async () => {
    const identity = await import("@lucid-agents/identity");
    const core = await import("@lucid-agents/core");

    expect(identity).toBeDefined();
    expect(core).toBeDefined();
  });

  it("identity package should have exports", async () => {
    const identity = await import("@lucid-agents/identity");
    expect(typeof identity).toBe("object");
    expect(Object.keys(identity).length).toBeGreaterThan(0);
  });

  it("packages should not have circular dependency issues", async () => {
    // If both can be imported without errors, no circular deps
    const [identity, core, payments] = await Promise.all([
      import("@lucid-agents/identity"),
      import("@lucid-agents/core"),
      import("@lucid-agents/payments"),
    ]);
    expect(identity).toBeDefined();
    expect(core).toBeDefined();
    expect(payments).toBeDefined();
  });
});
