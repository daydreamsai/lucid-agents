import { afterEach, describe, expect, it } from "bun:test";
import {
  configureAgentKit,
  getAgentKitConfig,
  resetAgentKitConfigForTesting,
} from "../config";
import { paymentsFromEnv } from "../utils";
import { createAgentApp } from "../app";

describe("AgentKit config management", () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it("returns defaults when no overrides provided", () => {
    const config = getAgentKitConfig();
    expect(config.payments.facilitatorUrl).toBeTruthy();
    expect(config.wallet.walletApiUrl).toBeTruthy();
  });

  it("allows scoped config per app instance without global mutation", () => {
    const { config: config1 } = createAgentApp(
      { name: "config-test-1", version: "0.0.0" },
      {
        config: {
          payments: {
            facilitatorUrl: "https://facilitator.test" as any,
            payTo: "0x1230000000000000000000000000000000000000",
            network: "base" as any,
            defaultPrice: "42",
          },
        },
        useConfigPayments: true,
      }
    );

    // App instance has the scoped config
    expect(config1.payments.facilitatorUrl).toBe("https://facilitator.test");
    expect(config1.payments.defaultPrice).toBe("42");

    // But global config is not affected (preventing leakage)
    const globalConfig = getAgentKitConfig();
    expect(globalConfig.payments.facilitatorUrl).not.toBe("https://facilitator.test");

    // Helpers should see scoped config for this runtime
    const scopedPayments = paymentsFromEnv();
    expect(scopedPayments.facilitatorUrl).toBe("https://facilitator.test");
    expect(scopedPayments.defaultPrice).toBe("42");
  });

  it("supports explicit global configuration via configureAgentKit", () => {
    // Explicitly configure global state
    configureAgentKit({
      payments: {
        facilitatorUrl: "https://facilitator.global" as any,
        payTo: "0x1230000000000000000000000000000000000000",
        network: "base" as any,
        defaultPrice: "99",
      },
    });

    const config = getAgentKitConfig();
    expect(config.payments.facilitatorUrl).toBe("https://facilitator.global");
    const payments = paymentsFromEnv();
    expect(payments.facilitatorUrl).toBe("https://facilitator.global");
    expect(payments.defaultPrice).toBe("99");
  });

  it("instance config overrides global config", () => {
    // Set global config
    configureAgentKit({
      wallet: { walletApiUrl: "https://global.example" },
    });

    // Create app with instance-specific override
    const { config } = createAgentApp(
      { name: "config-test-wallet", version: "0.0.0" },
      {
        config: { wallet: { walletApiUrl: "https://instance.example" } },
      }
    );

    // Instance config should override global
    expect(config.wallet.walletApiUrl).toBe("https://instance.example");

    // Global config unchanged
    const globalConfig = getAgentKitConfig();
    expect(globalConfig.wallet.walletApiUrl).toBe("https://global.example");
  });
});
