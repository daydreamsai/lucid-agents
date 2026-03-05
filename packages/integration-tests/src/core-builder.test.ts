import { describe, it, expect } from "bun:test";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";

/** Shared agent metadata for builder integration tests. */
const META = {
  name: "test-agent",
  description: "Integration test agent",
  url: "https://test.example.com",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
};

describe("Core + HTTP integration", () => {
  /**
   * Verifies that an agent runtime can be created with the HTTP extension
   * and that the build completes without errors.
   */
  it("creates an agent with http extension", async () => {
    const runtime = await createAgent(META).use(http()).build();
    expect(runtime).toBeDefined();
  });

  /**
   * Verifies the builder API exposes .use() and .build() methods.
   */
  it("createAgent returns a builder with .use() method", () => {
    const builder = createAgent(META);
    expect(typeof builder.use).toBe("function");
    expect(typeof builder.build).toBe("function");
  });

  /**
   * Verifies that an extension can be chained via .use() and the
   * resulting builder still exposes .build().
   */
  it("agent builder supports chaining an extension", () => {
    const chained = createAgent(META).use(http());
    expect(typeof chained.build).toBe("function");
  });

  /**
   * Verifies the HTTP extension contributes handlers to the runtime.
   */
  it("runtime has handlers from http extension", async () => {
    const runtime = await createAgent(META).use(http()).build();
    expect(runtime.handlers).toBeDefined();
  });
});
