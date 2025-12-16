---
"@lucid-agents/payments": minor
---

Track zero-value payments to enable policy enforcement on free services

Previously, zero-value payments were not recorded in the payment tracker, which prevented applying policies and controls to free services. This change ensures all transactions are tracked regardless of value, allowing the system to block or apply policies to free services when needed.
