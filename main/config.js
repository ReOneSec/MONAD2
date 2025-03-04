// config.js
require('dotenv').config(); // Load environment variables from .env file

const CONFIG = {
  // MONAD Network Settings
  RPC_URL: process.env.RPC_URL || 'https://testnet-rpc.monad.xyz',
  EXPLORER_URL: process.env.EXPLORER_URL || 'https://testnet.monadexplorer.com/tx/',
  CHAIN_ID: parseInt(process.env.CHAIN_ID || '10143'),
  GAS_PRICE: process.env.GAS_PRICE || '1000000000', // 1 Gwei in wei
  GAS_LIMIT: parseInt(process.env.GAS_LIMIT || '500000'),

  // Telegram Settings
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '8044535899:AAGeJtCM8gV2GH-vlWerY-ie-y_K6phFmwY',
  ADMIN_ID: parseInt(process.env.ADMIN_ID || '6668515216'),
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS || '0x1aa689f843077dca043df7d0dc0b3f62dbc6180d',

  // Security Settings
  MASTER_PASSWORD: process.env.MASTER_PASSWORD || 'change-this-in-production',
  TX_TIMEOUT: parseInt(process.env.TX_TIMEOUT || '120000'), // 2 minutes
  MAX_RETRY_COUNT: parseInt(process.env.MAX_RETRY_COUNT || '2'),
  MAX_POLLING_RETRIES: parseInt(process.env.MAX_POLLING_RETRIES || '5'),
  
  // File paths
  WALLET_FILE: process.env.WALLET_FILE || './secure_wallets.json',
  HISTORY_FILE: process.env.HISTORY_FILE || './tx_history.json'
};

// NFT Contract ABI
const CONTRACT_ABI = [{
  "inputs": [],
  "name": "mint",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
}, {
  "inputs": [],
  "name": "totalSupply",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "MAX_SUPPLY",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
}];

module.exports = {
  CONFIG,
  CONTRACT_ABI
};
