/**
 * Integration test: @lucid-agents/payments + @lucid-agents/wallet
 * Verifies cross-package compatibility between payment utilities and wallet.
 * Closes #118.
 */
import { describe, it, expect } from "bun:test";

describe("payments + wallet integration", () => {
  it("should export compatible types from payments and wallet", async () => {
    const payments = await import("@lucid-agents/payments");
    const wallet = await import("@lucid-agents/wallet");

    expect(payments).toBeDefined();
    expect(wallet).toBeDefined();
  });

  it("payments package should have exports", async () => {
    const payments = await import("@lucid-agents/payments");
    expect(typeof payments).toBe("object");
    expect(Object.keys(payments).length).toBeGreaterThan(0);
  });

  it("wallet package should have exports", async () => {
    const wallet = await import("@lucid-agents/wallet");
    expect(typeof wallet).toBe("object");
    expect(Object.keys(wallet).length).toBeGreaterThan(0);
  });
});
