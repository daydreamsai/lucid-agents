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
   * Verifies that createAgentApp produces a valid result containing
   * a Hono app instance when given a runtime built with the HTTP extension.
   */
  it("creates a Hono app from an agent runtime", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const { app } = await createAgentApp(runtime);
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe("function");
  });

  /**
   * Verifies the Hono app responds to HTTP requests via its fetch handler.
   */
  it("hono app responds to health requests", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const { app } = await createAgentApp(runtime);
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });

  /**
   * Verifies the Hono app exposes the agent card at the well-known endpoint.
   */
  it("hono app serves agent card endpoint", async () => {
    const runtime = await createAgent(META).use(http()).build();
    const { app } = await createAgentApp(runtime);
    const res = await app.fetch(
      new Request("http://localhost/.well-known/agent.json")
    );
    expect(res).toBeInstanceOf(Response);
    expect(res.status).not.toBe(500);
  });
});
