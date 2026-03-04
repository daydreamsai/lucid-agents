import { describe, it, expect } from "bun:test";
import type { AgentConfig } from "@lucid-agents/types/core";
import type { HttpExtensionOptions } from "@lucid-agents/types/http";
import type { TrustConfig } from "@lucid-agents/types/identity";

describe("Types cross-package consistency", () => {
  /**
   * Verifies that the core types module resolves and exports expected types.
   */
  it("@lucid-agents/types exports core types", async () => {
    const types = await import("@lucid-agents/types/core");
    expect(types).toBeDefined();
    // Compile-time assertion: AgentConfig type is importable
    const _config: AgentConfig | undefined = undefined;
    expect(_config).toBeUndefined();
  });

  /**
   * Verifies that the http types module resolves and exports expected types.
   */
  it("@lucid-agents/types exports http types", async () => {
    const types = await import("@lucid-agents/types/http");
    expect(types).toBeDefined();
    // Compile-time assertion: HttpExtensionOptions type is importable
    const _opts: HttpExtensionOptions | undefined = undefined;
    expect(_opts).toBeUndefined();
  });

  /**
   * Verifies that the identity types module resolves and exports expected types.
   */
  it("@lucid-agents/types exports identity types", async () => {
    const types = await import("@lucid-agents/types/identity");
    expect(types).toBeDefined();
    // Compile-time assertion: TrustConfig type is importable
    const _trust: TrustConfig | undefined = undefined;
    expect(_trust).toBeUndefined();
  });

  /**
   * Verifies that @lucid-agents/core exports the createAgent runtime API.
   */
  it("core exports runtime API createAgent", async () => {
    const core = await import("@lucid-agents/core");
    expect(typeof core.createAgent).toBe("function");
  });
});
