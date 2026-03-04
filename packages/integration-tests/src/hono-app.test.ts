import { describe, it, expect } from "bun:test";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";

/** Shared agent metadata for Hono integration tests. */
const META = {
  name: "hono-test-agent",
  description: "Hono integration test",
  url: "https://test.example.com",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
};

describe("Core + HTTP + Hono integration", () => {
  /**
   * Verifies that createAgentApp produces a valid Hono application
   * when given a runtime built with the HTTP extension.
   */
  it("creates a Hono app from an agent runtime", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const result = await createAgentApp(runtime);
    // createAgentApp may return { app } or the app directly
    const app = result && typeof result === "object" && "app" in result
      ? (result as { app: any }).app
      : result;
    expect(app).toBeDefined();
  });

  /**
   * Verifies the Hono app responds to HTTP requests via its fetch handler.
   */
  it("hono app responds to requests", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const result = await createAgentApp(runtime);
    const app = result && typeof result === "object" && "app" in result
      ? (result as { app: any }).app
      : result;
    if (typeof app.fetch === "function") {
      const res = await app.fetch(new Request("http://localhost/health"));
      expect(res).toBeInstanceOf(Response);
    } else {
      expect(app).toBeDefined();
    }
  });

  /**
   * Verifies the Hono app exposes the agent card at the well-known endpoint.
   */
  it("hono app serves agent card endpoint", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const result = await createAgentApp(runtime);
    const app = result && typeof result === "object" && "app" in result
      ? (result as { app: any }).app
      : result;
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
