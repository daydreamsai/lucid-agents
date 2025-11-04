import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import {
  createAgentApp,
  configureAgentKit,
  getAgentKitConfig,
} from "@lucid-dreams/agent-kit";
import {
  AgentRuntime,
  MemoryStorageAdapter,
  type AgentRuntimeWallet,
} from "@lucid-dreams/agent-auth";

type ServerHandle = {
  stop: () => void;
  baseUrl: string;
};

const agentRef = process.env.AGENT_REF ?? "demo-agent";
const credentialId = process.env.CREDENTIAL_ID ?? "cred-demo";
const scopes = (process.env.SCOPES ?? "agents.read")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

function createAgentServer(port: number): ServerHandle {
  const { app, addEntrypoint } = createAgentApp({
    name: "runtime-demo",
    version: "0.1.0",
    description: "Echo entrypoint to exercise AgentRuntime calls",
  });

  addEntrypoint({
    key: "echo",
    description: "Echo the provided text",
    input: z.object({ text: z.string() }),
    async handler({ input }) {
      const text = String(input.text ?? "");
      return {
        output: { text },
        usage: { total_tokens: text.length },
      };
    },
  });

  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  const baseUrl = `https://localhost:${port}`;
  console.log(`[runtime-demo] agent server listening on ${baseUrl}`);

  return {
    stop: () => server.stop(true),
    baseUrl,
  };
}

function createMockAuthApi(port: number): ServerHandle {
  let lastChallengeId: string | null = null;
  let currentAccessToken: string | null = null;
  let currentRefreshToken: string | null = null;

  const issueTokens = () => {
    currentAccessToken = `access_${randomUUID()}`;
    currentRefreshToken = `refresh_${randomUUID()}`;
    const now = Date.now();
    return {
      access_token: currentAccessToken,
      token_type: "bearer" as const,
      expires_at: new Date(now + 1_000).toISOString(),
      refresh_token: currentRefreshToken,
      refresh_expires_at: new Date(now + 10_000).toISOString(),
      credential: {
        id: credentialId,
        scopes,
        revocation_nonce: `nonce_${randomUUID()}`,
      },
    };
  };

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);

      if (
        request.method === "POST" &&
        url.pathname === `/v1/auth/agents/${agentRef}/challenge`
      ) {
        const challengeId = `challenge_${randomUUID()}`;
        lastChallengeId = challengeId;
        const body = await request.json();
        if (body.credential_id !== credentialId) {
          return new Response(JSON.stringify({ error: "invalid credential" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const payload = {
          challenge: {
            id: challengeId,
            credential_id: credentialId,
            payload: { timestamp: Date.now() },
            payload_hash: `hash_${challengeId}`,
            nonce: `nonce_${challengeId}`,
            scopes,
            issued_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5_000).toISOString(),
            server_signature: `server_sig_${challengeId}`,
          },
        };

        return new Response(JSON.stringify(payload), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === `/v1/auth/agents/${agentRef}/exchange`
      ) {
        const body = await request.json();
        if (!lastChallengeId || body.challenge_id !== lastChallengeId) {
          return new Response(JSON.stringify({ error: "unknown challenge" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (body.signature !== `signed:${lastChallengeId}`) {
          return new Response(JSON.stringify({ error: "invalid signature" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const tokens = issueTokens();
        return new Response(JSON.stringify(tokens), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === `/v1/auth/agents/${agentRef}/refresh`
      ) {
        const body = await request.json();
        if (body.refresh_token !== currentRefreshToken) {
          return new Response(
            JSON.stringify({ error: "invalid refresh token" }),
            { status: 401, headers: { "content-type": "application/json" } }
          );
        }
        const tokens = issueTokens();
        return new Response(JSON.stringify(tokens), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (request.method === "GET" && url.pathname === "/v1/agents") {
        const header = request.headers.get("authorization");
        if (!header || header !== `Bearer ${currentAccessToken}`) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const payload = {
          items: [{ ref: agentRef, status: "ready" as const }],
        };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    },
  });

  const baseUrl = `https://localhost:${port}`;
  console.log(`[runtime-demo] mock auth API listening on ${baseUrl}`);

  return {
    stop: () => server.stop(true),
    baseUrl,
  };
}

async function main() {
  if (typeof Bun === "undefined") {
    throw new Error(
      "This example must run on Bun (bun run examples/runtime-auth.ts)"
    );
  }

  const agentPort = Number(process.env.AGENT_PORT ?? 8789);
  const authPort = Number(process.env.AUTH_PORT ?? 8790);

  const agentServer = createAgentServer(agentPort);
  const authServer = createMockAuthApi(authPort);

  configureAgentKit({
    payments: {
      facilitatorUrl: "https://facilitator.daydreams.systems",
      payTo: "0x0000000000000000000000000000000000000000",
      network: "base-sepolia",
      defaultPrice: "500",
    },
  });

  const wallet: AgentRuntimeWallet = {
    signer: {
      async signChallenge(challenge) {
        return `signed:${challenge.id}`;
      },
    },
  };

  const { runtime, config } = await AgentRuntime.load({
    wallet,
    refreshLeadTimeMs: 500,
    storage: new MemoryStorageAdapter(),
    loader: {
      overrides: {
        baseUrl: authServer.baseUrl,
        agentRef,
        credentialId,
        scopes,
      },
    },
  });

  runtime.on("authenticated", ({ accessToken }) => {
    console.log("[runtime-demo] authenticated:", accessToken.slice(0, 12), "…");
  });

  runtime.on("tokenRefreshed", ({ accessToken }) => {
    console.log(
      "[runtime-demo] token refreshed:",
      accessToken.slice(0, 12),
      "…"
    );
  });

  runtime.on("refreshFailed", ({ error }) => {
    console.warn("[runtime-demo] refresh failed", error);
  });

  const token = await runtime.ensureAccessToken();
  console.log("[runtime-demo] initial access token", token.slice(0, 12), "…");

  const agents = await runtime.api.listAgents();
  console.log(
    "[runtime-demo] agents from API",
    agents.items?.map((item) => item.ref)
  );

  const invokeResponse = await fetch(
    `${agentServer.baseUrl}/entrypoints/echo/invoke`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ input: { text: "hello from runtime" } }),
    }
  );
  const invokeBody = await invokeResponse.json();
  console.log("[runtime-demo] invoke response", invokeBody);

  await delay(1_200);
  await runtime.ensureAccessToken();

  console.log("[runtime-demo] resolved config", getAgentKitConfig());
  console.log("[runtime-demo] runtime config", config);

  await runtime.shutdown();
  agentServer.stop();
  authServer.stop();
}

void main().catch((error) => {
  console.error("[runtime-demo] example failed", error);
  process.exitCode = 1;
});
