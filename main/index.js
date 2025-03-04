// index.js
const express = require('express');
const { CONFIG } = require('./config');
const { logger, logAction } = require('./logger');
const { TelegramFormatter, initBot } = require('./telegram');
const WalletManager = require('./wallet');
const { web3, contract, TransactionManager } = require('./transaction');
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
    
    // Prepare transaction
    const tx = {
      from: account.address,
      to: CONFIG.CONTRACT_ADDRESS,
      data: contract.methods.mint().encodeABI(),
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
    const successful = receipts.filter(r => r).length;
    bot.sendMessage(
      msg.chat.id,
      `🎉 Batch mint complete!\n✅ ${successful}/${activeWallets.length} successful`
    );
  })
  .catch(error => {
    logger.error('batch_mint_error', { error: error.message });
    bot.sendMessage(
      msg.chat.id,
      `⚠️ Some mints failed, check /history for details`
    );
  });
});

bot.onText(/\/mintwallet (.+)/, (msg, match) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  const address = match[1].trim();
  
  if (!Validator.isValidAddress(address)) {
    return bot.sendMessage(msg.chat.id, '❌ Invalid wallet address');
  }
  
  sendMonadMintTx(address, msg.chat.id)
    .then(() => {
      // Success message already sent in the function
    })
    .catch(error => {
      // Error already handled in the function
      logger.error('single_mint_error', { 
        address,
        error: error.message
      });
    });
});

bot.onText(/\/status/, async (msg) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  try {
    bot.sendMessage(msg.chat.id, '⏳ Fetching contract status...');
    
    const { total, max } = await txManager.getContractSupply();
    
    bot.sendMessage(
      msg.chat.id,
      TelegramFormatter.supplyStatus(total, max),
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('status_check_error', { error: error.message });
    bot.sendMessage(
      msg.chat.id,
      `❌ Error fetching supply: ${error.message}`
    );
  }
});

bot.onText(/\/addwallet (.+)/, async (msg, match) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  try {
    const input = match[1].trim();
    const parts = input.split(' ');
    
    // Check if we have a private key
    if (!parts[0] || !Validator.isValidPrivateKey(parts[0])) {
      return bot.sendMessage(msg.chat.id, '❌ Invalid private key format');
    }
    
    const privateKey = parts[0].startsWith('0x') ? parts[0] : `0x${parts[0]}`;
    const label = parts.slice(1).join(' ') || '';
    
    const address = walletManager.addWallet(privateKey, label);
    
    bot.sendMessage(
      msg.chat.id, 
      `✅ Wallet added successfully!\nAddress: \`${address}\`\nLabel: ${label || 'None'}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error adding wallet: ${error.message}`);
  }
});

bot.onText(/\/wallets/, (msg) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  const wallets = walletManager.wallets;
  bot.sendMessage(
    msg.chat.id,
    TelegramFormatter.walletList(wallets),
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/togglewallet (.+)/, (msg, match) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  try {
    const address = match[1].trim();
    if (!Validator.isValidAddress(address)) {
      return bot.sendMessage(msg.chat.id, '❌ Invalid wallet address');
    }
    
    const newStatus = walletManager.toggleWallet(address);
    if (newStatus === null) {
      return bot.sendMessage(msg.chat.id, '❌ Wallet not found');
    }
    
    bot.sendMessage(
      msg.chat.id,
      `✅ Wallet ${newStatus ? 'activated' : 'deactivated'}: \`${address}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error toggling wallet: ${error.message}`);
  }
});

bot.onText(/\/removewallet (.+)/, (msg, match) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  try {
    const address = match[1].trim();
    if (!Validator.isValidAddress(address)) {
      return bot.sendMessage(msg.chat.id, '❌ Invalid wallet address');
    }
    
    const success = walletManager.removeWallet(address);
    
    if (success) {
      bot.sendMessage(
        msg.chat.id,
        `✅ Wallet removed: \`${address}\``,
        { parse_mode: 'Markdown' }
      );
    } else {
      bot.sendMessage(msg.chat.id, '❌ Wallet not found');
    }
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error removing wallet: ${error.message}`);
  }
});

bot.onText(/\/history(?:\s+(\d+))?/, (msg, match) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  const limit = match[1] ? parseInt(match[1]) : 5;
  const history = txManager.getTransactionHistory(null, limit);
  
  if (history.length === 0) {
    return bot.sendMessage(msg.chat.id, '📜 No transaction history available');
  }
  
  let message = '📜 *Recent Transactions*\n\n';
  
  history.forEach((tx, index) => {
    const date = new Date(tx.timestamp).toLocaleString();
    const statusEmoji = tx.status === 'confirmed' ? '✅' : 
                        tx.status === 'pending' ? '⏳' : '❌';
    
    message += `*${index + 1}. ${statusEmoji} ${tx.status.toUpperCase()}*\n` +
               `Time: ${date}\n` +
               `From: \`${tx.from.substring(0, 10)}...\`\n` +
               `Tx: [${tx.hash.substring(0, 10)}...](${CONFIG.EXPLORER_URL}${tx.hash})\n\n`;
  });
  
  bot.sendMessage(msg.chat.id, message, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
});

bot.onText(/\/wallethistory (.+)/, (msg, match) => {
  if (msg.from.id !== CONFIG.ADMIN_ID) return;
  
  try {
    const address = match[1].trim();
    if (!Validator.isValidAddress(address)) {
      return bot.sendMessage(msg.chat.id, '❌ Invalid wallet address');
    }
    
    const history = txManager.getTransactionHistory(address, 10);
    
    if (history.length === 0) {
      return bot.sendMessage(
        msg.chat.id, 
        `📜 No transaction history for \`${address}\``,
        { parse_mode: 'Markdown' }
      );
    }
    
    let message = `📜 *Transaction History for*\n\`${address}\`\n\n`;
    
    history.forEach((tx, index) => {
      const date = new Date(tx.timestamp).toLocaleString();
      const statusEmoji = tx.status === 'confirmed' ? '✅' : 
                          tx.status === 'pending' ? '⏳' : '❌';
      
      message += `*${index + 1}. ${statusEmoji} ${tx.status.toUpperCase()}*\n` +
                 `Time: ${date}\n` +
                 `Tx: [${tx.hash.substring(0, 10)}...](${CONFIG.EXPLORER_URL}${tx.hash})\n\n`;
    });
    
    bot.sendMessage(msg.chat.id, message, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

// Setup Express server
app.get('/', (req, res) => res.send('MONAD Mint Bot 🚀'));
app.listen(3000, () => console.log('Server running on port 3000'));

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  bot.stopPolling();
  process.exit(0);
});

console.log('🤖 Bot started!');
                 
