export const settlementProofsAbi = [
  {
    type: "function",
    name: "exists",
    inputs: [{ name: "refId", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProof",
    inputs: [{ name: "refId", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct SettlementProofs.Proof",
        components: [
          { name: "refId", type: "bytes32", internalType: "bytes32" },
          { name: "payee", type: "address", internalType: "address" },
          { name: "amountUSDC", type: "uint256", internalType: "uint256" },
          { name: "paidAt", type: "uint64", internalType: "uint64" },
          { name: "srcTxHash", type: "bytes32", internalType: "bytes32" },
          { name: "memo", type: "string", internalType: "string" },
          { name: "recordedAt", type: "uint64", internalType: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProofAt",
    inputs: [{ name: "index", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct SettlementProofs.Proof",
        components: [
          { name: "refId", type: "bytes32", internalType: "bytes32" },
          { name: "payee", type: "address", internalType: "address" },
          { name: "amountUSDC", type: "uint256", internalType: "uint256" },
          { name: "paidAt", type: "uint64", internalType: "uint64" },
          { name: "srcTxHash", type: "bytes32", internalType: "bytes32" },
          { name: "memo", type: "string", internalType: "string" },
          { name: "recordedAt", type: "uint64", internalType: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proofCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proofsByPayee",
    inputs: [{ name: "payee", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "proofs",
        type: "tuple[]",
        internalType: "struct SettlementProofs.Proof[]",
        components: [
          { name: "refId", type: "bytes32", internalType: "bytes32" },
          { name: "payee", type: "address", internalType: "address" },
          { name: "amountUSDC", type: "uint256", internalType: "uint256" },
          { name: "paidAt", type: "uint64", internalType: "uint64" },
          { name: "srcTxHash", type: "bytes32", internalType: "bytes32" },
          { name: "memo", type: "string", internalType: "string" },
          { name: "recordedAt", type: "uint64", internalType: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recordPayment",
    inputs: [
      { name: "refId", type: "bytes32", internalType: "bytes32" },
      { name: "payee", type: "address", internalType: "address" },
      { name: "amountUSDC", type: "uint256", internalType: "uint256" },
      { name: "paidAt", type: "uint64", internalType: "uint64" },
      { name: "srcTxHash", type: "bytes32", internalType: "bytes32" },
      { name: "memo", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "totalSettled",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "PaymentRecorded",
    inputs: [
      { name: "refId", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "payee", type: "address", indexed: true, internalType: "address" },
      { name: "amountUSDC", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "paidAt", type: "uint64", indexed: false, internalType: "uint64" },
      { name: "srcTxHash", type: "bytes32", indexed: false, internalType: "bytes32" },
      { name: "memo", type: "string", indexed: false, internalType: "string" },
    ],
    anonymous: false,
  },
] as const;

export const erc20TransferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;
