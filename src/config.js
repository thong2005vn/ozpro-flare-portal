// ---------------------------------------------
// FLARE MAINNET CONTRACT ADDRESSES
// ---------------------------------------------

export const WNAT = "0x1D80c49BbBCd1C09124fA18aF6C5BfC1f6a47c1c";
export const REWARD_MANAGER = "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B";
export const CLAIM_SETUP_MANAGER = "0x1000000000000000000000000000000000000003";

// ---------------------------------------------
// WNAT ABI (tối thiểu)
// ---------------------------------------------

export const WNAT_ABI = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "delegate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_bips", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "delegatesOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [
      { name: "_delegateAddresses", type: "address[]" },
      { name: "_bips", type: "uint256[]" },
      { name: "_count", type: "uint256" },
      { name: "_delegationMode", type: "uint256" },
    ],
  },
];

// ---------------------------------------------
// REWARD MANAGER ABI
// ---------------------------------------------

export const REWARD_ABI = [
  {
    name: "getStateOfRewards",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_rewardOwner", type: "address" }],
    outputs: [
      { name: "claimableRewards", type: "uint256" },
      { name: "totalRewards", type: "uint256" },
      { name: "claimedRewards", type: "uint256" },
    ],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_rewardOwner", type: "address" }],
    outputs: [],
  },
];

// ---------------------------------------------
// CLAIM SETUP MANAGER ABI
// ---------------------------------------------

export const CLAIM_SETUP_MANAGER_ABI = [
  {
    inputs: [{ internalType: "address", name: "_owner", type: "address" }],
    name: "accountToDelegationAccount",
    outputs: [{ internalType: "address", name: "pda", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];