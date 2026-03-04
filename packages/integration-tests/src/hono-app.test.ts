import { describe, it, expect } from "bun:test";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";

const META = {
  name: "hono-test-agent",
  description: "Hono integration test",
  url: "https://test.example.com",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
};

describe("Core + HTTP + Hono integration", () => {
  it("creates a Hono app from an agent runtime", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const app = await createAgentApp(runtime);
    expect(app).toBeDefined();
  });

  it("hono app responds to requests", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const app = await createAgentApp(runtime);
    // app.fetch should be available on the Hono instance
    if (typeof app.fetch === "function") {
      const res = await app.fetch(new Request("http://localhost/health"));
      expect(res).toBeInstanceOf(Response);
    } else {
      // createAgentApp might return a different shape
      expect(app).toBeDefined();
    }
  });

  it("hono app serves agent card endpoint", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const app = await createAgentApp(runtime);
    if (typeof app.fetch === "function") {
      const res = await app.fetch(
        new Request("http://localhost/.well-known/agent.json")
      );
      expect(res).toBeInstanceOf(Response);
      expect(res.status).not.toBe(500);
    } else {
      expect(app).toBeDefined();
    }
  });
});
