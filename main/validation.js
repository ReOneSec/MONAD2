// validation.js
const { Web3 } = require('web3');
const { CONFIG } = require('./config');

const web3 = new Web3(CONFIG.RPC_URL);

const Validator = {
  isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },
  
  isValidPrivateKey(key) {
    // Remove 0x prefix if present for validation
    const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
    return /^[a-fA-F0-9]{64}$/.test(cleanKey);
  },
  
  sanitizeInput(input) {
    // Basic sanitization to prevent injection
    return String(input)
      .replace(/[<>]/g, '')
      .trim();
  },
  
  validateGasSettings(gasPrice, gasLimit) {
    const minGasPrice = web3.utils.toWei('0.1', 'gwei');
    const maxGasPrice = web3.utils.toWei('10', 'gwei');
    const minGasLimit = 21000;
    const maxGasLimit = 1000000;
    
    const gasPriceWei = String(gasPrice).match(/^\d+$/) ? 
      gasPrice : web3.utils.toWei(gasPrice, 'gwei');
    
    // Use BigInt for comparison in Web3.js v4.x
    if (BigInt(gasPriceWei) < BigInt(minGasPrice) || 
        BigInt(gasPriceWei) > BigInt(maxGasPrice)) {
      throw new Error(`Gas price must be between 0.1 and 10 Gwei`);
    }
    
    if (gasLimit < minGasLimit || gasLimit > maxGasLimit) {
      throw new Error(`Gas limit must be between ${minGasLimit} and ${maxGasLimit}`);
    }
    
    return {
      gasPrice: gasPriceWei,
      gasLimit: Number(gasLimit)
    };
  },

  // Validate JSON ABI
  isValidABI(abiString) {
    try {
      const abi = JSON.parse(abiString);
      
      // Basic validation: check if it's an array
      if (!Array.isArray(abi)) {
        return false;
      }
      
      // Check if it contains required functions for our bot
      const hasMint = abi.some(item => 
        item.type === 'function' && 
        item.name === 'mint'
      );
      
      const hasTotalSupply = abi.some(item => 
        item.type === 'function' && 
        item.name === 'totalSupply' && 
        item.stateMutability === 'view'
      );
      
      const hasMaxSupply = abi.some(item => 
        item.type === 'function' && 
        item.name === 'MAX_SUPPLY' && 
        item.stateMutability === 'view'
      );
      
      // At minimum, we need the mint function
      if (!hasMint) {
        return false;
      }
      
      // Return true even if not all view functions are present
      // This allows for flexibility in contract implementation
      return true;
    } catch (error) {
      return false;
    }
  }
};

module.exports = Validator;
