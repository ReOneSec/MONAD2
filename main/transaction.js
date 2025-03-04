// transaction.js
const fs = require('fs');
const { Web3 } = require('web3');
const { CONFIG } = require('./config');
const { logger } = require('./logger');

// Initialize Web3
const web3 = new Web3(CONFIG.RPC_URL);

// Initialize contract with current config
let contract = new web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.CONTRACT_ADDRESS);

// Function to initialize/update the contract
function initializeContract(address = CONFIG.CONTRACT_ADDRESS, abi = CONFIG.CONTRACT_ABI) {
  try {
    contract = new web3.eth.Contract(abi, address);
    logger.info('Contract initialized', { address });
    return contract;
  } catch (error) {
    logger.error('Contract initialization failed', { error: error.message });
    throw error;
  }
}

// Initialize contract with current configuration
initializeContract();

class TransactionManager {
  constructor() {
    this.pendingNonces = new Map();
    this.txHistory = [];
    this.maxHistoryItems = 100;
    this.historyFile = CONFIG.HISTORY_FILE;
    
    // Load transaction history if available
    this.loadHistory();
  }
  
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        this.txHistory = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        logger.info('Transaction history loaded', { 
          count: this.txHistory.length 
        });
      }
    } catch (error) {
      logger.error('Error loading transaction history', { 
        error: error.message 
      });
    }
  }
  
  saveHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.txHistory, null, 2));
    } catch (error) {
      logger.error('Error saving transaction history', { 
        error: error.message 
      });
    }
  }

  async getNonce(address) {
    // Get the on-chain nonce
    const onChainNonce = await web3.eth.getTransactionCount(address);
    
    // Get our tracked pending nonce, or use on-chain if none
    const pendingNonce = this.pendingNonces.get(address) || onChainNonce;
    
    // Use whichever is higher
    const nonce = Math.max(onChainNonce, pendingNonce);
    
    // Update our tracking
    this.pendingNonces.set(address, nonce + 1);
    
    return nonce;
  }

  async sendTransaction(signedTx, walletAddress, options = {}) {
    const txHash = web3.utils.sha3(signedTx.rawTransaction);
    const startTime = Date.now();
    
    // Record the transaction in history
    const txRecord = {
      hash: txHash,
      from: walletAddress,
      to: options.to || 'unknown',
      timestamp: startTime,
      status: 'pending',
      gasPrice: options.gasPrice || 'unknown',
      gasLimit: options.gasLimit || 'unknown'
    };
    
    this.txHistory.unshift(txRecord);
    if (this.txHistory.length > this.maxHistoryItems) {
      this.txHistory.pop();
    }
    
    // Save history
    this.saveHistory();
    
    // Set up timeout
    const timeout = options.timeout || CONFIG.TX_TIMEOUT;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Transaction timeout')), timeout);
    });
    
    try {
      // Race the transaction against the timeout
      const receipt = await Promise.race([
        web3.eth.sendSignedTransaction(signedTx.rawTransaction),
        timeoutPromise
      ]);
      
      // Update history with success
      txRecord.status = 'confirmed';
      txRecord.blockNumber = receipt.blockNumber;
      txRecord.gasUsed = receipt.gasUsed;
      this.saveHistory();
      
      return receipt;
    } catch (error) {
      // Update history with failure
      txRecord.status = 'failed';
      txRecord.error = error.message;
      this.saveHistory();
      
      // If it was a nonce error, reset our nonce tracking for this address
      if (error.message.includes('nonce') || error.message.includes('underpriced')) {
        this.pendingNonces.delete(walletAddress);
      }
      
      throw error;
    }
  }

  getTransactionHistory(address = null, limit = 10) {
    if (address) {
      return this.txHistory
        .filter(tx => tx.from.toLowerCase() === address.toLowerCase())
        .slice(0, limit);
    }
    return this.txHistory.slice(0, limit);
  }
  
  // Method to get contract supply information
  async getContractSupply() {
    try {
      const [total, max] = await Promise.all([
        contract.methods.totalSupply().call(),
        contract.methods.MAX_SUPPLY().call()
      ]);
      return { total, max };
    } catch (error) {
      logger.error('Error fetching supply', { error: error.message });
      throw error;
    }
  }
  
  // Method to get mint data
  getMintData() {
    return contract.methods.mint().encodeABI();
  }
}

module.exports = {
  web3,
  contract,
  initializeContract,
  TransactionManager
};
