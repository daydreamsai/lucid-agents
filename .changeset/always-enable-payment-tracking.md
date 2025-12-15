---
"@lucid-agents/payments": patch
"@lucid-agents/analytics": patch
---

Always create payment tracker when payments are enabled

The payment tracker is now always created when payments are enabled, regardless of whether policy groups are configured. This enables analytics to access payment data even when policy groups are empty, and ensures historical payment data is available if policy groups are added later.

Previously, the payment tracker was only created when policy groups had outgoing or incoming limits with `maxTotalUsd` defined. This prevented analytics from working for agents with payments enabled but no policy groups configured.
