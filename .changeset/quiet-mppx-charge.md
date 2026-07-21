---
'@lucid-agents/mpp': major
---

Upgrade to security-fixed mppx 0.4.11 and adapt native Tempo and Stripe charge
materialization to the new method and intent shape. Require the compatible Viem
peer range used by mppx 0.4. Native Tempo sessions are no longer materialized
without the signing account that the current Lucid server config cannot supply;
use a custom method and verifier for session intents.
