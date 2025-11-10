const identity = await createAgentIdentity({
  domain: process.env.AGENT_DOMAIN,
  autoRegister: process.env.IDENTITY_AUTO_REGISTER === "true",
});

if (identity.didRegister) {
  console.log("Registered agent on-chain!");
  console.log("Transaction:", identity.transactionHash);
} else if (identity.trust) {
  console.log("Found existing registration");
  console.log("Agent ID:", identity.record?.agentId);
}

const trustConfig = getTrustConfig(identity);
