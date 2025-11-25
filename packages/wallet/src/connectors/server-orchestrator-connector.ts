import type {
  AgentChallengeResponse,
  FetchExecutor,
  WalletCapabilities,
  WalletConnector,
  WalletMetadata,
} from '@lucid-agents/types/wallets';

import {
  detectMessageEncoding,
  extractSignature,
  extractWalletMetadata,
  normalizeChallenge,
} from './base-connector';

export interface ServerOrchestratorWalletConnectorOptions {
  baseUrl: string;
  agentRef: string;
  fetch?: FetchExecutor;
  headers?: HeadersInit;
  accessToken?: string | null;
  authorizationContext?: Record<string, unknown>;
}

const DEFAULT_AUTHORIZATION_CONTEXT: Record<string, unknown> = {
  reason: "lucid.agent.auth.exchange",
};

export class ServerOrchestratorMissingAccessTokenError extends Error {
  constructor() {
    super(
      "Server orchestrator connector requires a bearer token. Call setAccessToken() first.",
    );
    this.name = "ServerOrchestratorMissingAccessTokenError";
  }
}

export class ServerOrchestratorWalletConnector implements WalletConnector {
  private readonly baseUrl: string;
  private readonly agentRef: string;
  private readonly fetchImpl: FetchExecutor;
  private readonly defaultHeaders: HeadersInit | undefined;
  private readonly authorizationContext: Record<string, unknown>;

  private accessToken: string | null;
  private cachedMetadata: WalletMetadata | null = null;

  constructor(options: ServerOrchestratorWalletConnectorOptions) {
    if (!options?.baseUrl) {
      throw new Error(
        "ServerOrchestratorWalletConnector requires a baseUrl option",
      );
    }
    if (!options.agentRef) {
      throw new Error(
        "ServerOrchestratorWalletConnector requires an agentRef option",
      );
    }

    const fetchCandidate =
      options.fetch ?? (globalThis.fetch as FetchExecutor | undefined);
    if (!fetchCandidate) {
      throw new Error(
        "No fetch implementation available. Provide one via options.fetch.",
      );
    }

    this.baseUrl = options.baseUrl.replace(/\/?$/, "");
    this.agentRef = options.agentRef;
    this.fetchImpl = fetchCandidate;
    this.defaultHeaders = options.headers;
    this.accessToken = options.accessToken ?? null;
    this.authorizationContext = {
      ...DEFAULT_AUTHORIZATION_CONTEXT,
      ...options.authorizationContext,
    };
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token ?? null;
  }

  async signChallenge(
    challenge: AgentChallengeResponse["challenge"],
  ): Promise<string> {
    const token = this.accessToken;
    if (!token) {
      throw new ServerOrchestratorMissingAccessTokenError();
    }

    const normalized = normalizeChallenge(challenge);
    const message = normalized.message;
    if (!message) {
      throw new Error(
        "Server orchestrator challenge payload did not include a signable message",
      );
    }

    const response = await this.fetchImpl(
      buildWalletSignUrl(this.baseUrl, this.agentRef),
      {
        method: "POST",
        headers: this.buildHeaders(token),
        body: JSON.stringify({
          message,
          encoding: detectMessageEncoding(message),
          idempotency_key: normalized.id,
          authorization_context: {
            ...this.authorizationContext,
            challenge_id: normalized.id,
          },
        }),
      },
    );

    const rawBody = await response.text();
    if (!response.ok) {
      throw buildSigningError(response, rawBody);
    }

    const parsed = safeJsonParse(rawBody);
    const signature = extractSignature(parsed);
    if (!signature) {
      throw new Error(
        "Server orchestrator response did not contain a signature field",
      );
    }

    this.cachedMetadata = extractWalletMetadata(parsed);

    return signature;
  }

  async getWalletMetadata(): Promise<WalletMetadata | null> {
    return this.cachedMetadata;
  }

  supportsCaip2(_: string): boolean {
    return true;
  }

  async getAddress(): Promise<string | null> {
    return this.cachedMetadata?.address ?? null;
  }

  getCapabilities(): WalletCapabilities | undefined {
    return undefined;
  }

  private buildHeaders(token: string): HeadersInit {
    const headers = new Headers(this.defaultHeaders);
    headers.set("content-type", "application/json");
    headers.set("authorization", normalizeAuthorizationHeader(token));
    return Object.fromEntries(headers.entries());
  }
}

const buildWalletSignUrl = (baseUrl: string, agentRef: string): string =>
  `${baseUrl}/v1/agents/${encodeURIComponent(agentRef)}/wallet/sign-message`;

const normalizeAuthorizationHeader = (token: string): string =>
  /^bearer\s/i.test(token) ? token : `Bearer ${token}`;

const buildSigningError = (response: Response, body: string): Error => {
  const details = safeJsonParse(body);
  const serialized =
    details && typeof details === "object"
      ? JSON.stringify(details)
      : body;

  return new Error(
    `Server wallet signing failed: ${response.status} ${response.statusText}${serialized ? ` - ${serialized}` : ""}`,
  );
};

const safeJsonParse = (text: string): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

