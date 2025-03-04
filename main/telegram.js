// telegram.js
const TelegramBot = require('node-telegram-bot-api');
const { CONFIG } = require('./config');
const { logger, logAction } = require('./logger');

// Message formatting utilities
const TelegramFormatter = {
  bold: text => `*${text}*`,
  italic: text => `_${text}_`,
  code: text => `\`${text}\``,
  pre: (text, language = '') => `\`\`\`${language}\n${text}\n\`\`\``,
  link: (text, url) => `[${text}](${url})`,
  
  // Message templates
  transactionSuccess: (txHash, address) => {
    const explorerUrl = `${CONFIG.EXPLORER_URL}${txHash}`;
    return `✅ *Mint successful!*\n` +
           `From: \`${address}\`\n` +
           `[View on Explorer](${explorerUrl})`;
  },
  
  transactionFailed: (error, address) => {
    return `❌ *Transaction Failed*\n` +
           `From: \`${address}\`\n` +
           `Error: \`${error.substring(0, 100)}\``;
  },
  
  walletList: (wallets) => {
    if (wallets.length === 0) return '📝 No wallets configured';
    
    let message = '📝 *Configured Wallets*\n\n';
    wallets.forEach((wallet, index) => {
      const status = wallet.active ? '✅ Active' : '❌ Inactive';
      const lastUsed = wallet.lastUsed ? 
        new Date(wallet.lastUsed).toLocaleString() : 'Never';
      
      message += `*${index + 1}. ${wallet.label}*\n` +
                 `Address: \`${wallet.address}\`\n` +
                 `Status: ${status}\n` +
                 `Last Used: ${lastUsed}\n\n`;
    });
    
    return message;
  },
  
  supplyStatus: (total, max) => {
    const percentage = ((total / max) * 100).toFixed(2);
    const remaining = max - total;
    
    return `📊 *Supply Status*\n\n` +
           `Current: ${total}/${max} (${percentage}%)\n` +
           `Remaining: ${remaining}\n`;
  },
  
  helpText: () => `
*🤖 MONAD Mint Bot*

*Commands:*
/mint - Start minting with all active wallets
/mintwallet [address] - Mint from a specific wallet
/wallets - List all configured wallets
/addwallet [privateKey] [label] - Add a new wallet
/togglewallet [address] - Enable/disable a wallet
/removewallet [address] - Remove a wallet
/status - Check contract supply
/history [limit] - View recent transactions
/wallethistory [address] - View wallet transactions
/settings - View or change bot settings
`
};

// Initialize Telegram Bot with retry mechanism
function initBot() {
  let pollingRetries = 0;
  
  const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { 
    polling: true,
    request: {
      timeout: 30000 // 30 second timeout
    }
  });
  
  // Add polling error handler
  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.code, error.message || String(error));
    
    logger.error('telegram_polling_error', { 
      code: error.code,
      message: error.message || String(error),
      retry: pollingRetries
    });
    
    // Implement retry logic for recoverable errors
    if (pollingRetries < CONFIG.MAX_POLLING_RETRIES) {
      pollingRetries++;
      console.log(`Attempting to restart polling (${pollingRetries}/${CONFIG.MAX_POLLING_RETRIES})...`);
      
      // Wait before trying to restart polling
      setTimeout(() => {
        bot.stopPolling()
          .then(() => {
            console.log('Polling stopped, restarting...');
            return bot.startPolling();
          })
          .then(() => {
            console.log('Polling successfully restarted');
          })
          .catch(restartError => {
            console.error('Failed to restart polling:', restartError);
            logger.error('polling_restart_failed', { 
              error: restartError.message 
            });
          });
      }, 5000 * pollingRetries); // Increase delay with each retry
    } else {
      console.error('Maximum polling retries reached. Bot may not be functioning properly.');
      logger.error('max_polling_retries_reached');
    }
  });
  
  return bot;
}

module.exports = {
  TelegramFormatter,
  initBot
};
