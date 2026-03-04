import { describe, it, expect } from "bun:test";

describe("Types cross-package consistency", () => {
  it("@lucid-agents/types exports core types", async () => {
    const types = await import("@lucid-agents/types/core");
    // AgentConfig should be a type export — we verify the module resolves
    expect(types).toBeDefined();
  });

  it("@lucid-agents/types exports http types", async () => {
    const types = await import("@lucid-agents/types/http");
    expect(types).toBeDefined();
  });

  it("@lucid-agents/types exports identity types", async () => {
    const types = await import("@lucid-agents/types/identity");
    expect(types).toBeDefined();
  });

  it("core re-exports types from @lucid-agents/types", async () => {
    const core = await import("@lucid-agents/core");
    // createAgent should be available
    expect(typeof core.createAgent).toBe("function");
  });
});
