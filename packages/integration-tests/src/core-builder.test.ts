import { describe, it, expect } from "bun:test";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";

const META = {
  name: "test-agent",
  description: "Integration test agent",
  url: "https://test.example.com",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
};

describe("Core + HTTP integration", () => {
  it("creates an agent with http extension", async () => {
    const runtime = await createAgent(META).use(http()).build();
    expect(runtime).toBeDefined();
  });

  it("createAgent returns a builder with .use() method", () => {
    const builder = createAgent(META);
    expect(typeof builder.use).toBe("function");
    expect(typeof builder.build).toBe("function");
  });

  it("agent builder supports chaining multiple extensions", () => {
    const chained = createAgent(META).use(http());
    expect(typeof chained.build).toBe("function");
  });

  it("runtime has handlers from http extension", async () => {
    const runtime = await createAgent(META).use(http()).build();
    expect(runtime.handlers).toBeDefined();
  });
});
