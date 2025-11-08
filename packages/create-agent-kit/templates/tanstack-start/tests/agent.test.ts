import { describe, expect, it } from "bun:test";
import { agent } from "@/lib/agent";

describe("agent integration", () => {
  it("invokes the echo entrypoint", async () => {
    const result = await agent.invoke(
      "{{ENTRYPOINT_KEY}}",
      { text: "hello" },
      {
        signal: new AbortController().signal,
        headers: new Headers(),
      }
    );

    expect(result.output).toEqual({ text: "hello" });
  });

  it("streams the count entrypoint", async () => {
    const received: string[] = [];
    const result = await agent.stream(
      "count",
      { limit: 3 },
      (chunk) => {
        if (chunk && typeof chunk === "object" && "text" in chunk) {
          received.push(String((chunk as any).text));
        }
      },
      {
        signal: new AbortController().signal,
        headers: new Headers(),
      }
    );

    expect(received).toHaveLength(3);
    expect(received[0]).toContain("Count: 1");
    expect(result.metadata).toEqual({ total: 3 });
  });
});
