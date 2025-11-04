import { signMessage, signTypedData, verifyMessage } from 'viem/actions';
import { recoverMessageAddress, hashMessage } from 'viem';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils/signatures.ts
var signatures_exports = {};
__export(signatures_exports, {
  buildDomainProofMessage: () => buildDomainProofMessage,
  buildFeedbackAuthMessage: () => buildFeedbackAuthMessage,
  buildValidationRequestMessage: () => buildValidationRequestMessage,
  hashMessageEIP191: () => hashMessageEIP191,
  recoverSigner: () => recoverSigner,
  signDomainProof: () => signDomainProof,
  signFeedbackAuth: () => signFeedbackAuth,
  signMessageWithViem: () => signMessageWithViem,
  signTypedDataWithViem: () => signTypedDataWithViem,
  signValidationRequest: () => signValidationRequest,
  verifySignature: () => verifySignature
});
async function signMessageWithViem(walletClient, message) {
  return signMessage(walletClient, {
    account: walletClient.account,
    message
  });
}
async function signTypedDataWithViem(walletClient, params) {
  return signTypedData(
    walletClient,
    {
      account: walletClient.account,
      ...params
    }
  );
}
async function verifySignature(params) {
  try {
    const recovered = await recoverMessageAddress({
      message: params.message,
      signature: params.signature
    });
    if (recovered.toLowerCase() === params.address.toLowerCase()) {
      return true;
    }
    return await verifyMessage(params.publicClient, {
      address: params.address,
      message: params.message,
      signature: params.signature
    });
  } catch (error) {
    return false;
  }
}
function hashMessageEIP191(message) {
  return hashMessage(message);
}
async function recoverSigner(message, signature) {
  return recoverMessageAddress({
    message,
    signature
  });
}
function buildDomainProofMessage(params) {
  const lines = [
    "ERC-8004 Agent Ownership Proof",
    `Domain: ${params.domain}`,
    `Address: ${params.address.toLowerCase()}`,
    `ChainId: ${params.chainId}`
  ];
  if (params.nonce) {
    lines.push(`Nonce: ${params.nonce}`);
  }
  return lines.join("\n");
}
function buildFeedbackAuthMessage(params) {
  return [
    "ERC-8004 Reputation Feedback Authorization",
    `From: ${params.fromAddress.toLowerCase()}`,
    `To Agent: ${params.toAgentId.toString()}`,
    `Score: ${params.score}`,
    `Chain ID: ${params.chainId}`,
    `Expiry: ${params.expiry}`,
    `Index Limit: ${params.indexLimit.toString()}`
  ].join("\n");
}
function buildValidationRequestMessage(params) {
  return [
    "ERC-8004 Validation Request",
    `Agent ID: ${params.agentId.toString()}`,
    `Request Hash: ${params.requestHash}`,
    `Validator: ${params.validator.toLowerCase()}`,
    `Chain ID: ${params.chainId}`,
    `Timestamp: ${params.timestamp}`
  ].join("\n");
}
async function signDomainProof(walletClient, params) {
  const message = buildDomainProofMessage(params);
  return signMessageWithViem(walletClient, message);
}
async function signFeedbackAuth(walletClient, params) {
  const message = buildFeedbackAuthMessage(params);
  return signMessageWithViem(walletClient, message);
}
async function signValidationRequest(walletClient, params) {
  const message = buildValidationRequestMessage(params);
  return signMessageWithViem(walletClient, message);
}
var init_signatures = __esm({
  "src/utils/signatures.ts"() {
  }
});

// src/utils/address.ts
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function normalizeAddress(value) {
  if (!value) {
    throw new Error("invalid hex address");
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`invalid hex address: ${value}`);
  }
  return trimmed.toLowerCase();
}
function sanitizeAddress(value) {
  if (!value) return ZERO_ADDRESS;
  try {
    return normalizeAddress(value);
  } catch {
    return ZERO_ADDRESS;
  }
}
function toCaip10(params) {
  const namespace = params.namespace ?? "eip155";
  const chainRef = typeof params.chainId === "number" ? params.chainId.toString(10) : `${params.chainId ?? ""}`;
  if (!chainRef) throw new Error("chainId is required for CAIP-10");
  const address = normalizeAddress(params.address);
  return `${namespace}:${chainRef}:${address}`;
}

// src/utils/domain.ts
function normalizeDomain(domain) {
  return domain?.trim?.().toLowerCase?.() ?? "";
}

// src/config/erc8004.ts
var DEFAULT_ADDRESSES = {
  /**
   * Identity Registry - ERC-721 NFTs representing agent identities
   * Functions: register(), ownerOf(), tokenURI(), agentExists()
   */
  IDENTITY_REGISTRY: "0x7177a6867296406881E20d6647232314736Dd09A",
  /**
   * Reputation Registry - Peer feedback and reputation system
   * Functions: giveFeedback(), revokeFeedback(), getSummary(), getAllFeedback()
   */
  REPUTATION_REGISTRY: "0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322",
  /**
   * Validation Registry - Validation requests and responses
   * Functions: validationRequest(), validationResponse(), getRequest(), getSummary()
   */
  VALIDATION_REGISTRY: "0x662b40A526cb4017d947e71eAF6753BF3eeE66d8"
};
var CHAIN_OVERRIDES = {
  // Example: If a chain has different registry addresses
  // 42161: {
  //   IDENTITY_REGISTRY: "0xDifferentAddress..." as Hex,
  // },
};
var SUPPORTED_CHAINS = {
  BASE_SEPOLIA: 84532,
  ETHEREUM_MAINNET: 1,
  SEPOLIA: 11155111,
  BASE_MAINNET: 8453,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  POLYGON: 137,
  POLYGON_AMOY: 80002
};
var DEFAULT_CHAIN_ID = 84532;
var DEFAULT_NAMESPACE = "eip155";
var DEFAULT_TRUST_MODELS = [
  "feedback",
  "inference-validation"
];
function getRegistryAddresses(chainId) {
  const overrides = CHAIN_OVERRIDES[chainId] ?? {};
  return { ...DEFAULT_ADDRESSES, ...overrides };
}
function getRegistryAddress(registry, chainId) {
  const addresses = getRegistryAddresses(chainId);
  switch (registry) {
    case "identity":
      return addresses.IDENTITY_REGISTRY;
    case "reputation":
      return addresses.REPUTATION_REGISTRY;
    case "validation":
      return addresses.VALIDATION_REGISTRY;
  }
}
function isChainSupported(chainId) {
  return Object.values(SUPPORTED_CHAINS).includes(chainId);
}
function isERC8004Registry(address, chainId) {
  const normalized = address.toLowerCase();
  if (chainId !== void 0) {
    const addresses = getRegistryAddresses(chainId);
    return Object.values(addresses).some(
      (addr) => addr.toLowerCase() === normalized
    );
  }
  const chains = Object.values(SUPPORTED_CHAINS);
  return chains.some((cid) => {
    const addresses = getRegistryAddresses(cid);
    return Object.values(addresses).some(
      (addr) => addr.toLowerCase() === normalized
    );
  });
}

// src/abi/IdentityRegistry.json
var IdentityRegistry_default = [
  { inputs: [], stateMutability: "nonpayable", type: "constructor" },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "approved",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256"
      }
    ],
    name: "Approval",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "operator",
        type: "address"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "approved",
        type: "bool"
      }
    ],
    name: "ApprovalForAll",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "string",
        name: "indexedKey",
        type: "string"
      },
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string"
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "value",
        type: "bytes"
      }
    ],
    name: "MetadataSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "string",
        name: "tokenURI",
        type: "string"
      },
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      }
    ],
    name: "Registered",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256"
      }
    ],
    name: "Transfer",
    type: "event"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" }
    ],
    name: "agentExists",
    outputs: [{ internalType: "bool", name: "exists", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" }
    ],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "getApproved",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "string", name: "key", type: "string" }
    ],
    name: "getMetadata",
    outputs: [{ internalType: "bytes", name: "value", type: "bytes" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "operator", type: "address" }
    ],
    name: "isApprovedForAll",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "register",
    outputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string", name: "tokenURI_", type: "string" },
      {
        components: [
          { internalType: "string", name: "key", type: "string" },
          { internalType: "bytes", name: "value", type: "bytes" }
        ],
        internalType: "struct IIdentityRegistry.MetadataEntry[]",
        name: "metadata",
        type: "tuple[]"
      }
    ],
    name: "register",
    outputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string", name: "tokenURI_", type: "string" }
    ],
    name: "register",
    outputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "bytes", name: "data", type: "bytes" }
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "operator", type: "address" },
      { internalType: "bool", name: "approved", type: "bool" }
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "string", name: "key", type: "string" },
      { internalType: "bytes", name: "value", type: "bytes" }
    ],
    name: "setMetadata",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes4", name: "interfaceId", type: "bytes4" }
    ],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalAgents",
    outputs: [
      { internalType: "uint256", name: "count", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" }
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// src/abi/ReputationRegistry.json
var ReputationRegistry_default = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_identityRegistry",
        type: "address"
      }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "address",
        name: "clientAddress",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint64",
        name: "feedbackIndex",
        type: "uint64"
      }
    ],
    name: "FeedbackRevoked",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "address",
        name: "clientAddress",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "score",
        type: "uint8"
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "tag1",
        type: "bytes32"
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "tag2",
        type: "bytes32"
      },
      {
        indexed: false,
        internalType: "string",
        name: "fileuri",
        type: "string"
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "filehash",
        type: "bytes32"
      }
    ],
    name: "NewFeedback",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "address",
        name: "clientAddress",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "feedbackIndex",
        type: "uint64"
      },
      {
        indexed: true,
        internalType: "address",
        name: "responder",
        type: "address"
      },
      {
        indexed: false,
        internalType: "string",
        name: "responseUri",
        type: "string"
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "responseHash",
        type: "bytes32"
      }
    ],
    name: "ResponseAppended",
    type: "event"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "address", name: "clientAddress", type: "address" },
      { internalType: "uint64", name: "feedbackIndex", type: "uint64" },
      { internalType: "string", name: "responseUri", type: "string" },
      { internalType: "bytes32", name: "responseHash", type: "bytes32" }
    ],
    name: "appendResponse",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" }
    ],
    name: "getClients",
    outputs: [
      { internalType: "address[]", name: "clientList", type: "address[]" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getIdentityRegistry",
    outputs: [
      { internalType: "address", name: "registry", type: "address" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "address", name: "clientAddress", type: "address" }
    ],
    name: "getLastIndex",
    outputs: [
      { internalType: "uint64", name: "lastIndex", type: "uint64" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "address", name: "clientAddress", type: "address" },
      { internalType: "uint64", name: "feedbackIndex", type: "uint64" },
      { internalType: "address[]", name: "responders", type: "address[]" }
    ],
    name: "getResponseCount",
    outputs: [
      { internalType: "uint64", name: "count", type: "uint64" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      {
        internalType: "address[]",
        name: "clientAddresses",
        type: "address[]"
      },
      { internalType: "bytes32", name: "tag1", type: "bytes32" },
      { internalType: "bytes32", name: "tag2", type: "bytes32" }
    ],
    name: "getSummary",
    outputs: [
      { internalType: "uint64", name: "count", type: "uint64" },
      { internalType: "uint8", name: "averageScore", type: "uint8" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "uint8", name: "score", type: "uint8" },
      { internalType: "bytes32", name: "tag1", type: "bytes32" },
      { internalType: "bytes32", name: "tag2", type: "bytes32" },
      { internalType: "string", name: "fileuri", type: "string" },
      { internalType: "bytes32", name: "filehash", type: "bytes32" },
      { internalType: "bytes", name: "feedbackAuth", type: "bytes" }
    ],
    name: "giveFeedback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "identityRegistry",
    outputs: [
      {
        internalType: "contract IdentityRegistry",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      {
        internalType: "address[]",
        name: "clientAddresses",
        type: "address[]"
      },
      { internalType: "bytes32", name: "tag1", type: "bytes32" },
      { internalType: "bytes32", name: "tag2", type: "bytes32" },
      { internalType: "bool", name: "includeRevoked", type: "bool" }
    ],
    name: "readAllFeedback",
    outputs: [
      { internalType: "address[]", name: "clients", type: "address[]" },
      { internalType: "uint8[]", name: "scores", type: "uint8[]" },
      { internalType: "bytes32[]", name: "tag1s", type: "bytes32[]" },
      { internalType: "bytes32[]", name: "tag2s", type: "bytes32[]" },
      { internalType: "bool[]", name: "revokedStatuses", type: "bool[]" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "address", name: "clientAddress", type: "address" },
      { internalType: "uint64", name: "index", type: "uint64" }
    ],
    name: "readFeedback",
    outputs: [
      { internalType: "uint8", name: "score", type: "uint8" },
      { internalType: "bytes32", name: "tag1", type: "bytes32" },
      { internalType: "bytes32", name: "tag2", type: "bytes32" },
      { internalType: "bool", name: "isRevoked", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "uint64", name: "feedbackIndex", type: "uint64" }
    ],
    name: "revokeFeedback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// src/abi/ValidationRegistry.json
var ValidationRegistry_default = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_identityRegistry",
        type: "address"
      }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "validatorAddress",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "string",
        name: "requestUri",
        type: "string"
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "requestHash",
        type: "bytes32"
      }
    ],
    name: "ValidationRequest",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "validatorAddress",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "requestHash",
        type: "bytes32"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "response",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "string",
        name: "responseUri",
        type: "string"
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "responseHash",
        type: "bytes32"
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "tag",
        type: "bytes32"
      }
    ],
    name: "ValidationResponse",
    type: "event"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" }
    ],
    name: "getAgentValidations",
    outputs: [
      {
        internalType: "bytes32[]",
        name: "requestHashes",
        type: "bytes32[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getIdentityRegistry",
    outputs: [
      { internalType: "address", name: "registry", type: "address" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "requestHash", type: "bytes32" }
    ],
    name: "getRequest",
    outputs: [
      {
        internalType: "address",
        name: "validatorAddress",
        type: "address"
      },
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "string", name: "requestUri", type: "string" },
      { internalType: "uint256", name: "timestamp", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      {
        internalType: "address[]",
        name: "validatorAddresses",
        type: "address[]"
      },
      { internalType: "bytes32", name: "tag", type: "bytes32" }
    ],
    name: "getSummary",
    outputs: [
      { internalType: "uint64", name: "count", type: "uint64" },
      { internalType: "uint8", name: "avgResponse", type: "uint8" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "requestHash", type: "bytes32" }
    ],
    name: "getValidationStatus",
    outputs: [
      {
        internalType: "address",
        name: "validatorAddress",
        type: "address"
      },
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "uint8", name: "response", type: "uint8" },
      { internalType: "bytes32", name: "tag", type: "bytes32" },
      { internalType: "uint256", name: "lastUpdate", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "validatorAddress",
        type: "address"
      }
    ],
    name: "getValidatorRequests",
    outputs: [
      {
        internalType: "bytes32[]",
        name: "requestHashes",
        type: "bytes32[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "identityRegistry",
    outputs: [
      {
        internalType: "contract IdentityRegistry",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "requestHash", type: "bytes32" }
    ],
    name: "requestExists",
    outputs: [{ internalType: "bool", name: "exists", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "validatorAddress",
        type: "address"
      },
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "string", name: "requestUri", type: "string" },
      { internalType: "bytes32", name: "requestHash", type: "bytes32" }
    ],
    name: "validationRequest",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "requestHash", type: "bytes32" },
      { internalType: "uint8", name: "response", type: "uint8" },
      { internalType: "string", name: "responseUri", type: "string" },
      { internalType: "bytes32", name: "responseHash", type: "bytes32" },
      { internalType: "bytes32", name: "tag", type: "bytes32" }
    ],
    name: "validationResponse",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// src/abi/types.ts
var IDENTITY_REGISTRY_ABI = IdentityRegistry_default;
var REPUTATION_REGISTRY_ABI = ReputationRegistry_default;
var VALIDATION_REGISTRY_ABI = ValidationRegistry_default;

// src/registries/identity.ts
function normalizeAgentId(agentId) {
  if (typeof agentId === "bigint") {
    if (agentId < 0n) {
      throw new Error("agentId must be non-negative");
    }
    return agentId.toString(10);
  }
  if (typeof agentId === "number") {
    if (!Number.isFinite(agentId) || !Number.isInteger(agentId) || agentId < 0) {
      throw new Error("agentId must be a non-negative integer");
    }
    if (!Number.isSafeInteger(agentId)) {
      throw new Error(
        "agentId number must be a safe integer; use string or bigint for larger values"
      );
    }
    return agentId.toString(10);
  }
  const normalized = `${agentId ?? ""}`.trim();
  if (!normalized) {
    throw new Error("agentId is required");
  }
  return normalized;
}
function createRegistrationEntry(params) {
  const entry = {
    agentId: normalizeAgentId(params.agentId),
    agentAddress: toCaip10({
      namespace: params.namespace,
      chainId: params.chainId,
      address: params.address
    })
  };
  if (params.signature) {
    entry.signature = params.signature;
  }
  return entry;
}
function createTrustConfig(params, overrides) {
  return {
    registrations: [createRegistrationEntry(params)],
    ...overrides
  };
}
function createIdentityRegistryClient(options) {
  const {
    address,
    chainId,
    publicClient,
    walletClient,
    namespace = "eip155"
  } = options;
  function ensureWalletClient() {
    if (!walletClient) {
      throw new Error(
        "identity registry client requires walletClient for writes"
      );
    }
    return walletClient;
  }
  return {
    address,
    chainId,
    async get(agentId) {
      const id = BigInt(agentId);
      const exists = await publicClient.readContract({
        address,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "agentExists",
        args: [id]
      });
      if (!exists) {
        return null;
      }
      const [owner, uri] = await Promise.all([
        publicClient.readContract({
          address,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "ownerOf",
          args: [id]
        }),
        publicClient.readContract({
          address,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "tokenURI",
          args: [id]
        })
      ]);
      return {
        agentId: id,
        owner: normalizeAddress(owner),
        tokenURI: uri
      };
    },
    async register(input) {
      const wallet = ensureWalletClient();
      if (!input.tokenURI) {
        throw new Error("tokenURI is required");
      }
      if (!wallet.account?.address) {
        throw new Error("wallet account address is required");
      }
      const agentAddress = normalizeAddress(wallet.account.address);
      const args = input.metadata ? [input.tokenURI, input.metadata] : [input.tokenURI];
      const txHash = await wallet.writeContract({
        address,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args
      });
      let agentId;
      try {
        const publicClientWithReceipt = publicClient;
        let receipt;
        if (publicClientWithReceipt.waitForTransactionReceipt) {
          receipt = await publicClientWithReceipt.waitForTransactionReceipt({
            hash: txHash
          });
        } else if (publicClientWithReceipt.getTransactionReceipt) {
          receipt = await publicClientWithReceipt.getTransactionReceipt({
            hash: txHash
          });
        }
        const REGISTERED_EVENT_SIGNATURE = "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a";
        if (receipt?.logs) {
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() === address.toLowerCase() && log.topics[0] === REGISTERED_EVENT_SIGNATURE && log.topics.length >= 2) {
              agentId = BigInt(log.topics[1]);
              break;
            }
          }
        }
      } catch (error) {
        agentId = void 0;
      }
      return {
        transactionHash: txHash,
        agentAddress,
        agentId
      };
    },
    toRegistrationEntry(record, signature) {
      if (chainId == null) {
        throw new Error(
          "identity registry client needs chainId to build CAIP-10 registration entries"
        );
      }
      return createRegistrationEntry({
        agentId: record.agentId,
        address: record.owner,
        chainId,
        namespace,
        signature
      });
    }
  };
}
async function signAgentDomainProof(options) {
  const { domain, address, chainId, nonce, signer } = options;
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) throw new Error("domain is required");
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress || normalizedAddress === ZERO_ADDRESS) {
    throw new Error("address must be a valid hex address");
  }
  const { signDomainProof: signDomainProof2 } = await Promise.resolve().then(() => (init_signatures(), signatures_exports));
  return signDomainProof2(signer, {
    domain: normalizedDomain,
    address: normalizedAddress,
    chainId,
    nonce
  });
}
function buildTrustConfigFromIdentity(record, options) {
  const chainRef = options?.chainId;
  if (chainRef == null) {
    throw new Error(
      "chainId is required to generate trust config registration entry"
    );
  }
  return createTrustConfig(
    {
      agentId: record.agentId,
      address: record.owner,
      chainId: chainRef,
      namespace: options?.namespace,
      signature: options?.signature
    },
    options?.trustOverrides
  );
}
function buildMetadataURI(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    throw new Error("domain is required");
  }
  const origin = normalized.startsWith("http") ? normalized : `https://${normalized}`;
  return `${origin}/.well-known/agent-metadata.json`;
}
async function bootstrapTrust(options) {
  const normalizedDomain = normalizeDomain(options.domain);
  if (!normalizedDomain) {
    throw new Error("domain is required to bootstrap trust state");
  }
  const shouldRegister = Boolean(
    options.registerIfMissing && !options.skipRegister
  );
  const client = createIdentityRegistryClient({
    address: options.registryAddress,
    chainId: options.chainId,
    publicClient: options.publicClient,
    walletClient: options.walletClient,
    namespace: options.namespace
  });
  let record = null;
  let transactionHash;
  let didRegister = false;
  if (options.onMissing) {
    const handled = await options.onMissing({
      client,
      normalizedDomain
    });
    if (handled) {
      record = handled;
    }
  }
  if (!record && shouldRegister) {
    const tokenURI = buildMetadataURI(normalizedDomain);
    const registration = await client.register({ tokenURI });
    transactionHash = registration.transactionHash;
    didRegister = true;
    if (registration.agentId != null) {
      record = {
        agentId: registration.agentId,
        owner: registration.agentAddress,
        tokenURI
      };
    }
  }
  if (!record) {
    return {
      trust: void 0,
      record: null,
      transactionHash,
      didRegister
    };
  }
  let signature;
  if (options.signer) {
    try {
      signature = await signAgentDomainProof({
        domain: normalizedDomain,
        address: record.owner,
        chainId: options.chainId,
        signer: options.signer,
        nonce: options.signatureNonce
      });
      if (signature) {
        defaultLogger.info?.(
          `[agent-kit-identity] Generated domain proof signature: ${signature.slice(
            0,
            10
          )}...`
        );
      }
    } catch (error) {
      defaultLogger.warn?.(
        "[agent-kit-identity] Failed to generate domain proof signature",
        error
      );
    }
  } else {
    defaultLogger.info?.(
      "[agent-kit-identity] No signer provided - skipping domain proof signature"
    );
  }
  const trust = buildTrustConfigFromIdentity(record, {
    chainId: options.chainId,
    namespace: options.namespace,
    signature,
    trustOverrides: options.trustOverrides
  });
  return {
    trust,
    record,
    transactionHash,
    signature,
    didRegister
  };
}
var defaultLogger = {
  info: typeof console !== "undefined" && typeof console.info === "function" ? console.info.bind(console) : () => {
  },
  warn: typeof console !== "undefined" && typeof console.warn === "function" ? console.warn.bind(console) : () => {
  }
};
function parsePositiveInteger(value) {
  if (!value) return void 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return void 0;
  return Math.trunc(parsed);
}
function resolveTrustOverrides(domain, overrides, fallback) {
  const result = {};
  if (domain) {
    result.trustModels = [...DEFAULT_TRUST_MODELS];
    const origin = domain.startsWith("http") ? domain : `https://${domain}`;
    result.validationRequestsUri = `${origin}/validation/requests.json`;
    result.validationResponsesUri = `${origin}/validation/responses.json`;
    result.feedbackDataUri = `${origin}/feedback.json`;
  }
  if (overrides) {
    if (overrides.trustModels !== void 0) {
      result.trustModels = overrides.trustModels;
    }
    if (overrides.validationRequestsUri !== void 0) {
      result.validationRequestsUri = overrides.validationRequestsUri;
    }
    if (overrides.validationResponsesUri !== void 0) {
      result.validationResponsesUri = overrides.validationResponsesUri;
    }
    if (overrides.feedbackDataUri !== void 0) {
      result.feedbackDataUri = overrides.feedbackDataUri;
    }
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
async function bootstrapIdentity(options = {}) {
  const env = options.env ?? (typeof process !== "undefined" && typeof process.env === "object" ? process.env : {});
  const logger = {
    info: options.logger?.info ?? defaultLogger.info,
    warn: options.logger?.warn ?? defaultLogger.warn
  };
  const resolvedChainId = options.chainId ?? parsePositiveInteger(env.CHAIN_ID) ?? DEFAULT_CHAIN_ID;
  const domain = options.domain ?? env.AGENT_DOMAIN;
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  const registryAddress = options.registryAddress ?? env.IDENTITY_REGISTRY_ADDRESS;
  const rpcUrl = options.rpcUrl ?? env.RPC_URL;
  let publicClient = options.publicClient;
  let walletClient = options.walletClient;
  let signer = options.signer;
  if (!publicClient && options.makeClients && rpcUrl) {
    const produced = await options.makeClients({
      chainId: resolvedChainId,
      rpcUrl,
      env
    });
    if (produced?.publicClient) {
      publicClient = produced.publicClient;
      walletClient = walletClient ?? produced.walletClient;
      signer = signer ?? produced.signer ?? produced.walletClient;
    }
  }
  if (!signer && walletClient) {
    signer = walletClient;
  }
  const resolvedOverrides = resolveTrustOverrides(
    domain,
    options.trustOverrides);
  if (domain && registryAddress && publicClient) {
    try {
      const result = await bootstrapTrust({
        domain,
        chainId: resolvedChainId,
        registryAddress,
        namespace,
        publicClient,
        walletClient,
        signer,
        signatureNonce: options.signatureNonce ?? env.IDENTITY_SIGNATURE_NONCE,
        registerIfMissing: options.registerIfMissing ?? env.REGISTER_IDENTITY === "true",
        skipRegister: options.skipRegister,
        trustOverrides: resolvedOverrides
      });
      if (result.trust || result.didRegister || result.transactionHash) {
        return result;
      }
      logger.warn(
        "[agent-kit-identity] identity not found in registry and registration not enabled"
      );
    } catch (error) {
      logger.warn(
        "[agent-kit-identity] failed to bootstrap ERC-8004 identity",
        error
      );
    }
  }
  logger.info("[agent-kit-identity] agent will run without ERC-8004 identity");
  return {};
}
async function importViemModules() {
  try {
    const viem = await import('viem');
    const accounts = await import('viem/accounts');
    const chains = await import('viem/chains').catch(() => ({}));
    const baseSepoliaChain = chains.baseSepolia ?? { id: DEFAULT_CHAIN_ID };
    return {
      createPublicClient: viem.createPublicClient,
      createWalletClient: viem.createWalletClient,
      http: viem.http,
      privateKeyToAccount: accounts.privateKeyToAccount,
      baseSepolia: baseSepoliaChain
    };
  } catch (error) {
    defaultLogger.warn(
      "[agent-kit] viem helpers unavailable; install viem to use makeViemClientsFromEnv",
      error
    );
    return null;
  }
}
function resolveEnvObject(env) {
  if (env) return env;
  if (typeof process !== "undefined" && typeof process.env === "object") {
    return process.env;
  }
  return {};
}
async function makeViemClientsFromEnv(options = {}) {
  const env = resolveEnvObject(options.env);
  const modules = await importViemModules();
  if (!modules) return void 0;
  return ({ chainId, rpcUrl, env: runtimeEnv }) => {
    const effectiveRpcUrl = options.rpcUrl ?? rpcUrl ?? env.RPC_URL;
    if (!effectiveRpcUrl) {
      defaultLogger.warn(
        "[agent-kit] RPC_URL missing for viem client factory; skipping"
      );
      return null;
    }
    const transport = modules.http(effectiveRpcUrl);
    const chain = { ...modules.baseSepolia, id: chainId };
    const publicClient = modules.createPublicClient({ chain, transport });
    const mergedEnv = {
      ...env,
      ...runtimeEnv
    };
    let privateKey;
    const rawKey = options.privateKey ?? mergedEnv.PRIVATE_KEY;
    if (rawKey) {
      const normalized = rawKey.trim();
      privateKey = normalized.startsWith("0x") ? normalized : `0x${normalized}`;
    }
    let walletClient = void 0;
    if (privateKey) {
      try {
        const account = modules.privateKeyToAccount(privateKey);
        walletClient = modules.createWalletClient({
          chain,
          account,
          transport
        });
      } catch (error) {
        defaultLogger.warn(
          "[agent-kit] failed to configure viem wallet client from PRIVATE_KEY",
          error
        );
      }
    }
    return {
      publicClient,
      walletClient,
      signer: walletClient
    };
  };
}

// src/registries/reputation.ts
function stringToBytes32(str) {
  if (str.startsWith("0x")) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(str)) {
      throw new Error(`Invalid bytes32 hex string: ${str}`);
    }
    return str;
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  if (bytes.length > 32) {
    throw new Error(`Tag "${str}" is too long (max 32 bytes)`);
  }
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return `0x${Array.from(padded).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
function createReputationRegistryClient(options) {
  const {
    address,
    chainId,
    publicClient,
    walletClient,
    identityRegistryAddress
  } = options;
  function ensureWalletClient() {
    if (!walletClient) {
      throw new Error(
        "Reputation registry client requires walletClient for write operations"
      );
    }
    return walletClient;
  }
  return {
    address,
    chainId,
    async giveFeedback(input) {
      const wallet = ensureWalletClient();
      const clientAddress = normalizeAddress(wallet.account?.address);
      if (!clientAddress) {
        throw new Error("Wallet account address is required");
      }
      const tag1 = input.tag1 ? typeof input.tag1 === "string" ? stringToBytes32(input.tag1) : input.tag1 : "0x0000000000000000000000000000000000000000000000000000000000000000";
      const tag2 = input.tag2 ? typeof input.tag2 === "string" ? stringToBytes32(input.tag2) : input.tag2 : "0x0000000000000000000000000000000000000000000000000000000000000000";
      let feedbackAuth = input.feedbackAuth;
      if (!feedbackAuth) {
        const expiry = input.expiry ?? Math.floor(Date.now() / 1e3) + 3600;
        const indexLimit = input.indexLimit ?? 1000n;
        feedbackAuth = await signFeedbackAuth(wallet, {
          fromAddress: clientAddress,
          toAgentId: input.toAgentId,
          score: input.score,
          chainId,
          expiry,
          indexLimit
        });
      }
      const txHash = await wallet.writeContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "giveFeedback",
        args: [
          input.toAgentId,
          input.score,
          tag1,
          tag2,
          input.fileUri ?? "",
          input.fileHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
          feedbackAuth
        ]
      });
      return txHash;
    },
    async revokeFeedback(input) {
      const wallet = ensureWalletClient();
      const txHash = await wallet.writeContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "revokeFeedback",
        args: [input.agentId, input.feedbackIndex]
      });
      return txHash;
    },
    async appendResponse(input) {
      const wallet = ensureWalletClient();
      const txHash = await wallet.writeContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "appendResponse",
        args: [
          input.agentId,
          input.clientAddress,
          input.feedbackIndex,
          input.responseUri,
          input.responseHash
        ]
      });
      return txHash;
    },
    async getFeedback(agentId, clientAddress, feedbackIndex) {
      try {
        const result = await publicClient.readContract({
          address,
          abi: REPUTATION_REGISTRY_ABI,
          functionName: "readFeedback",
          args: [agentId, clientAddress, feedbackIndex]
        });
        const [score, tag1, tag2, isRevoked] = result;
        return {
          agentId,
          clientAddress,
          feedbackIndex,
          score,
          tag1,
          tag2,
          fileUri: "",
          // Not returned by readFeedback
          fileHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
          isRevoked
        };
      } catch (error) {
        return null;
      }
    },
    async getAllFeedback(agentId, options2 = {}) {
      const clientAddresses = options2.clientAddresses ?? [];
      const tag1 = options2.tag1 ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
      const tag2 = options2.tag2 ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
      const includeRevoked = options2.includeRevoked ?? false;
      const result = await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "readAllFeedback",
        args: [agentId, clientAddresses, tag1, tag2, includeRevoked]
      });
      const [clients, scores, tag1s, tag2s, revokedStatuses] = result;
      return clients.map((client, i) => ({
        agentId,
        clientAddress: client,
        feedbackIndex: BigInt(i),
        score: scores[i],
        tag1: tag1s[i],
        tag2: tag2s[i],
        fileUri: "",
        fileHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        isRevoked: revokedStatuses[i]
      }));
    },
    async getSummary(agentId, options2 = {}) {
      const clientAddresses = options2.clientAddresses ?? [];
      const tag1 = options2.tag1 ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
      const tag2 = options2.tag2 ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
      const result = await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "getSummary",
        args: [agentId, clientAddresses, tag1, tag2]
      });
      const [count, averageScore] = result;
      return {
        count,
        averageScore
      };
    },
    async getClients(agentId) {
      const result = await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "getClients",
        args: [agentId]
      });
      return result;
    },
    async getLastIndex(agentId, clientAddress) {
      const result = await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "getLastIndex",
        args: [agentId, clientAddress]
      });
      return result;
    },
    async getResponseCount(agentId, clientAddress, feedbackIndex, responders) {
      const result = await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "getResponseCount",
        args: [agentId, clientAddress, feedbackIndex, responders]
      });
      return result;
    }
  };
}

// src/registries/validation.ts
var DEFAULT_TAG = "0x0000000000000000000000000000000000000000000000000000000000000000";
function createValidationRegistryClient(options) {
  const {
    address,
    chainId,
    publicClient,
    walletClient,
    identityRegistryAddress
  } = options;
  function ensureWalletClient() {
    if (!walletClient) {
      throw new Error(
        "Validation registry client requires walletClient for write operations"
      );
    }
    return walletClient;
  }
  return {
    address,
    chainId,
    async createRequest(input) {
      const wallet = ensureWalletClient();
      const txHash = await wallet.writeContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "validationRequest",
        args: [
          input.validatorAddress,
          input.agentId,
          input.requestUri,
          input.requestHash
        ]
      });
      return txHash;
    },
    async submitResponse(input) {
      const wallet = ensureWalletClient();
      const tag = input.tag ?? DEFAULT_TAG;
      const txHash = await wallet.writeContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "validationResponse",
        args: [
          input.requestHash,
          input.response,
          input.responseUri,
          input.responseHash,
          tag
        ]
      });
      return txHash;
    },
    async getRequest(requestHash) {
      try {
        const result = await publicClient.readContract({
          address,
          abi: VALIDATION_REGISTRY_ABI,
          functionName: "getRequest",
          args: [requestHash]
        });
        const [validatorAddress, agentId, requestUri, timestamp] = result;
        return {
          validatorAddress,
          agentId,
          requestUri,
          requestHash,
          timestamp
        };
      } catch (error) {
        return null;
      }
    },
    async getValidationStatus(requestHash) {
      try {
        const result = await publicClient.readContract({
          address,
          abi: VALIDATION_REGISTRY_ABI,
          functionName: "getValidationStatus",
          args: [requestHash]
        });
        const [validatorAddress, agentId, response, tag, lastUpdate] = result;
        return {
          validatorAddress,
          agentId,
          response,
          tag,
          lastUpdate
        };
      } catch (error) {
        return null;
      }
    },
    async requestExists(requestHash) {
      const exists = await publicClient.readContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "requestExists",
        args: [requestHash]
      });
      return exists;
    },
    async getAgentValidations(agentId) {
      const requestHashes = await publicClient.readContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "getAgentValidations",
        args: [agentId]
      });
      return requestHashes;
    },
    async getValidatorRequests(validatorAddress) {
      const requestHashes = await publicClient.readContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "getValidatorRequests",
        args: [validatorAddress]
      });
      return requestHashes;
    },
    async getSummary(agentId, options2 = {}) {
      const validatorAddresses = options2.validatorAddresses ?? [];
      const tag = options2.tag ?? DEFAULT_TAG;
      const result = await publicClient.readContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "getSummary",
        args: [agentId, validatorAddresses, tag]
      });
      const [count, avgResponse] = result;
      return {
        count,
        avgResponse
      };
    }
  };
}

// src/init.ts
async function createAgentIdentity(options = {}) {
  const {
    domain,
    autoRegister = true,
    chainId,
    registryAddress,
    rpcUrl,
    privateKey,
    trustModels = ["feedback", "inference-validation"],
    trustOverrides,
    env,
    logger,
    makeClients
  } = options;
  const viemFactory = makeClients ?? await makeViemClientsFromEnv({
    env,
    rpcUrl,
    privateKey
  });
  const bootstrapOptions = {
    domain,
    chainId,
    registryAddress,
    rpcUrl,
    env,
    logger,
    makeClients: viemFactory,
    registerIfMissing: autoRegister,
    trustOverrides: {
      trustModels,
      ...trustOverrides
    }
  };
  const result = await bootstrapIdentity(bootstrapOptions);
  let status;
  let isNewRegistration = false;
  if (result.didRegister) {
    status = "Successfully registered agent in ERC-8004 registry";
    if (result.signature) {
      status += " (with domain proof signature)";
    }
    isNewRegistration = true;
  } else if (result.record) {
    status = "Found existing registration in ERC-8004 registry";
    if (result.signature) {
      status += " (with domain proof signature)";
    }
  } else if (result.trust) {
    status = "ERC-8004 identity configured";
  } else {
    status = "No ERC-8004 identity - agent will run without on-chain identity";
  }
  const resolvedDomain = domain ?? (typeof env === "object" ? env?.AGENT_DOMAIN : void 0);
  let clients;
  if (viemFactory) {
    try {
      const resolvedChainId = chainId ?? (env && typeof env === "object" ? parseInt(env.CHAIN_ID || "84532") : 84532);
      const resolvedRpcUrl = rpcUrl ?? (env && typeof env === "object" ? env.RPC_URL : void 0);
      if (resolvedRpcUrl) {
        const vClients = await viemFactory({
          chainId: resolvedChainId,
          rpcUrl: resolvedRpcUrl,
          env: env ?? {}
        });
        if (vClients?.publicClient) {
          const registryAddresses = getRegistryAddresses(resolvedChainId);
          const identityAddress = registryAddress ?? registryAddresses.IDENTITY_REGISTRY;
          clients = {
            identity: createIdentityRegistryClient({
              address: identityAddress,
              chainId: resolvedChainId,
              publicClient: vClients.publicClient,
              walletClient: vClients.walletClient
            }),
            reputation: createReputationRegistryClient({
              address: registryAddresses.REPUTATION_REGISTRY,
              chainId: resolvedChainId,
              publicClient: vClients.publicClient,
              walletClient: vClients.walletClient,
              identityRegistryAddress: identityAddress
            }),
            validation: createValidationRegistryClient({
              address: registryAddresses.VALIDATION_REGISTRY,
              chainId: resolvedChainId,
              publicClient: vClients.publicClient,
              walletClient: vClients.walletClient,
              identityRegistryAddress: identityAddress
            })
          };
        }
      }
    } catch (error) {
      const log = logger ?? { warn: console.warn };
      log.warn?.(
        "[agent-kit-identity] Failed to create registry clients",
        error
      );
    }
  }
  const identity = {
    ...result,
    status,
    domain: resolvedDomain,
    isNewRegistration,
    clients
  };
  if (identity.didRegister && identity.domain) {
    const log = logger ?? { info: console.log };
    const metadata = generateAgentMetadata(identity);
    log.info?.("\n\u{1F4CB} Host this metadata at your domain:");
    log.info?.(
      `   https://${identity.domain}/.well-known/agent-metadata.json
`
    );
    log.info?.(JSON.stringify(metadata, null, 2));
    log.info?.("");
  }
  return identity;
}
async function registerAgent(options) {
  return createAgentIdentity({
    ...options,
    autoRegister: true
  });
}
function getTrustConfig(result) {
  return result.trust;
}
function generateAgentMetadata(identity, options) {
  const metadata = {
    name: options?.name || "Agent",
    description: options?.description || "An AI agent",
    domain: identity.domain
  };
  if (identity.record?.owner) {
    metadata.address = identity.record.owner;
  }
  if (options?.capabilities && options.capabilities.length > 0) {
    metadata.capabilities = options.capabilities;
  }
  if (identity.trust?.trustModels && identity.trust.trustModels.length > 0) {
    metadata.trustModels = identity.trust.trustModels;
  }
  return metadata;
}

export { DEFAULT_CHAIN_ID, DEFAULT_NAMESPACE, DEFAULT_TRUST_MODELS, SUPPORTED_CHAINS, ZERO_ADDRESS, bootstrapIdentity, bootstrapTrust, buildDomainProofMessage, buildFeedbackAuthMessage, buildMetadataURI, buildTrustConfigFromIdentity, buildValidationRequestMessage, createAgentIdentity, createIdentityRegistryClient, createReputationRegistryClient, createValidationRegistryClient, generateAgentMetadata, getRegistryAddress, getRegistryAddresses, getTrustConfig, hashMessageEIP191, isChainSupported, isERC8004Registry, makeViemClientsFromEnv, normalizeAddress, normalizeDomain, recoverSigner, registerAgent, sanitizeAddress, signAgentDomainProof, signDomainProof, signFeedbackAuth, signMessageWithViem, signTypedDataWithViem, signValidationRequest, toCaip10, verifySignature };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map