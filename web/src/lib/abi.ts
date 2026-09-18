export const settlementProofsAbi = [
  {
    type: "function",
    name: "getProof",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "refId", type: "bytes32" },
          { name: "payee", type: "address" },
          { name: "amountUSDC", type: "uint256" },
          { name: "paidAt", type: "uint64" },
          { name: "srcTxHash", type: "bytes32" },
          { name: "memo", type: "string" },
          { name: "recordedAt", type: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProofAt",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "refId", type: "bytes32" },
          { name: "payee", type: "address" },
          { name: "amountUSDC", type: "uint256" },
          { name: "paidAt", type: "uint64" },
          { name: "srcTxHash", type: "bytes32" },
          { name: "memo", type: "string" },
          { name: "recordedAt", type: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proofCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proofsByPayee",
    inputs: [{ name: "payee", type: "address" }],
    outputs: [
      {
        name: "proofs",
        type: "tuple[]",
        components: [
          { name: "refId", type: "bytes32" },
          { name: "payee", type: "address" },
          { name: "amountUSDC", type: "uint256" },
          { name: "paidAt", type: "uint64" },
          { name: "srcTxHash", type: "bytes32" },
          { name: "memo", type: "string" },
          { name: "recordedAt", type: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSettled",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "PaymentRecorded",
    inputs: [
      { name: "refId", type: "bytes32", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "amountUSDC", type: "uint256", indexed: false },
      { name: "paidAt", type: "uint64", indexed: false },
      { name: "srcTxHash", type: "bytes32", indexed: false },
      { name: "memo", type: "string", indexed: false },
    ],
  },
] as const;
