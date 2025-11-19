import { describe, expect, it } from "bun:test";
import { createTanStackRuntime } from "../runtime";

const meta = {
  name: "test-agent",
  version: "0.0.1",
  description: "test",
};

describe("createTanStackRuntime", () => {
  it("exposes tanstack handlers alongside the core runtime", async () => {
    const { runtime, handlers } = createTanStackRuntime(meta, {
      entrypoints: [
        {
          key: "echo",
          handler: async ({ input }) => ({
            output: input ?? {},
          }),
        },
      ],
    });

    expect(typeof runtime.entrypoints.add).toBe("function");
    expect(typeof handlers.invoke).toBe("function");

    const healthResponse = await handlers.health({
      request: new Request("https://agent.test/health"),
    });
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({
      ok: true,
      version: meta.version,
    });

    const invokeRequest = new Request(
      "https://agent.test/entrypoints/echo/invoke",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { text: "hello" } }),
      }
    );

    const invokeResponse = await handlers.invoke({
      request: invokeRequest,
      params: { key: "echo" },
    });

    expect(invokeResponse.status).toBe(200);
    const payload = await invokeResponse.json();
    expect(payload.output).toEqual({ text: "hello" });
    expect(payload.status).toBe("succeeded");
  });
});
