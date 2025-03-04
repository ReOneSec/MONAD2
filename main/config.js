// config.js
require('dotenv').config(); // Load environment variables from .env file
const fs = require('fs');

// Default contract ABI - can be updated at runtime
const DEFAULT_CONTRACT_ABI = [{
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

// Load contract configuration from file if exists
let contractConfig = {
  address: process.env.CONTRACT_ADDRESS || '0x1aa689f843077dca043df7d0dc0b3f62dbc6180d',
  abi: DEFAULT_CONTRACT_ABI
};

const CONTRACT_CONFIG_FILE = './contract_config.json';

// Try to load saved contract configuration
try {
  if (fs.existsSync(CONTRACT_CONFIG_FILE)) {
    const savedConfig = JSON.parse(fs.readFileSync(CONTRACT_CONFIG_FILE, 'utf8'));
    contractConfig = {
      address: savedConfig.address || contractConfig.address,
      abi: savedConfig.abi || contractConfig.abi
    };
    console.log(`Loaded contract config from file: ${contractConfig.address}`);
  }
} catch (error) {
  console.error('Error loading contract configuration:', error);
}

// Save contract configuration to file
function saveContractConfig() {
  try {
    fs.writeFileSync(CONTRACT_CONFIG_FILE, JSON.stringify(contractConfig, null, 2));
    console.log('Contract configuration saved to file');
  } catch (error) {
    console.error('Error saving contract configuration:', error);
  }
}

// Main configuration object
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
  
  // Contract Settings (can be updated at runtime)
  CONTRACT_ADDRESS: contractConfig.address,
  CONTRACT_ABI: contractConfig.abi,

  // Security Settings
  MASTER_PASSWORD: process.env.MASTER_PASSWORD || 'change-this-in-production',
  TX_TIMEOUT: parseInt(process.env.TX_TIMEOUT || '120000'), // 2 minutes
  MAX_RETRY_COUNT: parseInt(process.env.MAX_RETRY_COUNT || '2'),
  MAX_POLLING_RETRIES: parseInt(process.env.MAX_POLLING_RETRIES || '5'),
  
  // File paths
  WALLET_FILE: process.env.WALLET_FILE || './secure_wallets.json',
  HISTORY_FILE: process.env.HISTORY_FILE || './tx_history.json'
};

// Function to update contract configuration
function updateContractConfig(address, abi) {
  CONFIG.CONTRACT_ADDRESS = address;
  CONFIG.CONTRACT_ABI = abi;
  contractConfig.address = address;
  contractConfig.abi = abi;
  saveContractConfig();
  return { address, abi };
}

module.exports = {
  CONFIG,
  updateContractConfig
};
