import { exact } from 'x402/schemes';
import { recoverTypedDataAddress, getAddress } from 'viem';

const header =
  'eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLCJuZXR3b3JrIjoiYmFzZS1zZXBvbGlhIiwicGF5bG9hZCI6eyJzaWduYXR1cmUiOiIweDI3OTMzZWU3NDAzNDdlOGI4YTQ1ZjFkNmNhZjJmOWU2Y2RiYWNmYzcxYmU5MzRiZTNiNGM0NTQ3MWQ1NjcxNTYwNTgxYjRiNDFlMzg4YjQ2ODk3OWUzOGQzOWMyNTllYWEzYmFiMDVmODZhMzJmMzgzZTUyNjMwOTg2NGE0M2E2MWMiLCJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweGIzMDhlZDM5ZDY3ZDBkNGJhZTViYzJmYWVmNjBjNjZiYmI2YWU0MjkiLCJ0byI6IjB4YjMwOGVkMzlkNjdEMGQ0QkFlNUJDMkZBRUY2MGM2NkJCYjZBRTQyOSIsInZhbHVlIjoiMTAwMCIsInZhbGlkQWZ0ZXIiOiIxNzU5OTA5OTM2IiwidmFsaWRCZWZvcmUiOiIxNzU5OTEwODM2Iiwibm9uY2UiOiIweGQ3NWRlMGU5NDQ4YzE1NDU4NmM3OGVhMWJiMGViN2EyMjE3YzIwOTlmMDA1MmViYjg1YTJjZGIxOTRjMjFlMzUifX19'; // paste literal header

const decoded = exact.evm.decodePayment(header);

const sa = {
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  },
  domain: {
    name: 'USDC',
    version: '2',
    chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  primaryType: 'TransferWithAuthorization',
  message: {
    from: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    to: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    value: '1000',
    validAfter: '1759909672',
    validBefore: '1759910572',
    nonce: '0x8c22c95e16aa1c9eb86bb6834ca3682eb727f91ad2a3a123345dd8c975b74887',
  },
};

const s = {
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  },
  domain: {
    name: 'USDC',
    version: '2',
    chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  primaryType: 'TransferWithAuthorization',
  message: {
    from: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    to: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    value: '1000',
    validAfter: '1759909672',
    validBefore: '1759910572',
    nonce: '0x8c22c95e16aa1c9eb86bb6834ca3682eb727f91ad2a3a123345dd8c975b74887',
  },
};
