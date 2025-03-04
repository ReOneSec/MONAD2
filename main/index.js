// index.js
const express = require('express');
const { CONFIG, updateContractConfig } = require('./config');
const { logger, logAction } = require('./logger');
const { TelegramFormatter, initBot } = require('./telegram');
const WalletManager = require('./wallet');
const { web3, contract, initializeContract, TransactionManager } = require('./transaction');
const Validator = require('./validation');

// Initialize Express app
const app = express();

// Initialize managers
const walletManager = new WalletManager(CONFIG.MASTER_PASSWORD);
const txManager = new TransactionManager();

// Initialize Telegram bot
const bot = initBot();

// Core mint function - defined here to avoid circular dependencies
async function sendMonadMintTx(walletAddress, chatId, retryCount = 0) {
  try {
    // Get wallet from secure storage
    const wallet = walletManager.getWallet(walletAddress);
    if (!wallet || !wallet.active) {
      throw new Error(`Wallet ${walletAddress} not found or inactive`);
    }
    
    // Log the attempt
    logAction('mint_attempt', { 
      address: walletAddress, 
      retryCount
    });
    
    // Get account from private key
    const account = web3.eth.accounts.privateKeyToAccount(wallet.privateKey);
    
    // Get secure nonce
    const nonce = await txManager.getNonce(account.address);
    
    // Get mint data from current contract
    const mintData = txManager.getMintData();
    
    // Prepare transaction
    const tx = {
      from: account.address,
      to: CONFIG.CONTRACT_ADDRESS,
      data: mintData,
      gas: CONFIG.GAS_LIMIT,
      gasPrice: CONFIG.GAS_PRICE,
      chainId: CONFIG.CHAIN_ID,
      nonce
    };

    // Sign the transaction
    const signedTx = await account.signTransaction(tx);
    
    // Send message that we're processing
    bot.sendMessage(
      chatId,
      `⏳ Processing mint from ${TelegramFormatter.code(account.address.substring(0, 10) + '...')}`,
      { parse_mode: 'Markdown' }
    );
    
    // Send transaction with timeout and tracking
    const receipt = await txManager.sendTransaction(signedTx, account.address, {
      to: CONFIG.CONTRACT_ADDRESS,
      gasPrice: CONFIG.GAS_PRICE,
      gasLimit: CONFIG.GAS_LIMIT,
      timeout: CONFIG.TX_TIMEOUT
    });
    
    // Update wallet last used timestamp
    walletManager.updateLastUsed(account.address);
    
    // Send success message
    bot.sendMessage(
      chatId,
      TelegramFormatter.transactionSuccess(receipt.transactionHash, account.address),
      { parse_mode: 'Markdown' }
    );
    
    return receipt;
  } catch (error) {
    if (retryCount < CONFIG.MAX_RETRY_COUNT) {
      bot.sendMessage(
        chatId,
        `🔄 Retrying (${retryCount + 1}/${CONFIG.MAX_RETRY_COUNT})...\nError: ${error.message.substring(0, 100)}`,
        { parse_mode: 'Markdown' }
      );
      
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      return sendMonadMintTx(walletAddress, chatId, retryCount + 1);
    }
    
    // Log the final failure
    logger.error('mint_failed', { 
      address: walletAddress, 
      error: error.message,
      stack: error.stack
    });
    
    bot.sendMessage(
      chatId,
      TelegramFormatter.transactionFailed(error.message, walletAddress),
      { parse_mode: 'Markdown' }
    );
    
    throw error;
  }
}

// Register Telegram command handlers
bot.onText(/\/start/, (msg) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  bot.sendMessage(
    msg.chat.id, 
    TelegramFormatter.helpText(), 
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/mint/, (msg) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  const activeWallets = walletManager.getActiveWallets();
  
  if (activeWallets.length === 0) {
    return bot.sendMessage(
      msg.chat.id,
      '❌ No active wallets configured. Use /addwallet to add wallets.'
    );
  }
  
  bot.sendMessage(
    msg.chat.id,
    `🚀 Starting batch mint with ${activeWallets.length} wallets...`
  );
  
  Promise.all(activeWallets.map(wallet => 
    sendMonadMintTx(wallet.address, msg.chat.id)
  ))
  .then(receipts => {
    const successful = receipts.filter
