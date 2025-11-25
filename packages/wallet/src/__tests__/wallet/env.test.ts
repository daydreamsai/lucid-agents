import { describe, expect, it } from "bun:test";

import { resolveAgentWalletFromEnv } from '../../env';

describe("resolveAgentWalletFromEnv", () => {
  it("resolves thirdweb wallet from AGENT_WALLET_ environment variables", () => {
    const env = {
      AGENT_WALLET_TYPE: "thirdweb",
      AGENT_WALLET_SECRET_KEY: "test-secret-key",
      AGENT_WALLET_CLIENT_ID: "test-client-id",
      AGENT_WALLET_LABEL: "test-wallet",
      AGENT_WALLET_CHAIN_ID: "84532",
    };

    const config = resolveAgentWalletFromEnv(env);

    expect(config).toBeDefined();
    expect(config?.type).toBe("thirdweb");
    if (config?.type === "thirdweb") {
      expect(config.secretKey).toBe("test-secret-key");
      expect(config.clientId).toBe("test-client-id");
      expect(config.walletLabel).toBe("test-wallet");
      expect(config.chainId).toBe(84532);
    }
  });

  it("resolves thirdweb wallet with defaults", () => {
    const env = {
      AGENT_WALLET_TYPE: "thirdweb",
      AGENT_WALLET_SECRET_KEY: "test-secret-key",
      // No chain ID - should default to 84532
    };

    const config = resolveAgentWalletFromEnv(env);

    expect(config).toBeDefined();
    expect(config?.type).toBe("thirdweb");
    if (config?.type === "thirdweb") {
      expect(config.secretKey).toBe("test-secret-key");
      expect(config.walletLabel).toBe("agent-wallet"); // Default
      expect(config.chainId).toBe(84532); // Default
    }
  });

  it("returns undefined when thirdweb secret key is missing", () => {
    const env = {
      AGENT_WALLET_TYPE: "thirdweb",
      // No secret key
    };

    const config = resolveAgentWalletFromEnv(env);

    expect(config).toBeUndefined();
  });

  it("returns undefined when thirdweb chain ID is invalid", () => {
    const env = {
      AGENT_WALLET_TYPE: "thirdweb",
      AGENT_WALLET_SECRET_KEY: "test-secret-key",
      AGENT_WALLET_CHAIN_ID: "invalid",
    };

    const config = resolveAgentWalletFromEnv(env);

    expect(config).toBeUndefined();
  });

  it("throws error when AGENT_WALLET_TYPE is missing", () => {
    const env = {};

    expect(() => resolveAgentWalletFromEnv(env)).toThrow(
      'AGENT_WALLET_TYPE environment variable is required. Set it to "local", "thirdweb", or "lucid".'
    );
  });

  it("throws error when AGENT_WALLET_TYPE is invalid", () => {
    const env = {
      AGENT_WALLET_TYPE: "invalid-type",
    };

    expect(() => resolveAgentWalletFromEnv(env)).toThrow(
      'Invalid AGENT_WALLET_TYPE: "invalid-type". Must be one of: "local", "thirdweb", "lucid".'
    );
  });
});

