---
'@lucid-agents/examples': patch
---

Add `trust-gated-payment` example: a vendor-neutral `CounterpartyScreener` seam that screens a recipient wallet for risk (OFAC wallet screen as one implementation) before sending an x402 payment. Fail-closed by default with loud logging; includes mocked smoke tests for allow / block / screener-unavailable / invalid-address paths.
