// wallet.js
const crypto = require('crypto');
const fs = require('fs');
const { Web3 } = require('web3');
const { CONFIG } = require('./config');
const { logger, logAction } = require('./logger');
const Validator = require('./validation');

// Initialize Web3
const web3 = new Web3(CONFIG.RPC_URL);

// Wallet encryption class
class WalletEncryption {
  constructor(masterPassword) {
    this.algorithm = 'aes-256-gcm';
    // Create a key from the password using PBKDF2
    this.key = crypto.pbkdf2Sync(masterPassword, 'monad-mint-salt', 100000, 32, 'sha512');
  }

  encrypt(walletKey) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(walletKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return {
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      authTag
    };
  }

  decrypt(encryptedWallet) {
    const iv = Buffer.from(encryptedWallet.iv, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(Buffer.from(encryptedWallet.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedWallet.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// Wallet manager class
class WalletManager {
  constructor(masterPassword) {
    this.encryption = new WalletEncryption(masterPassword);
    this.walletFile = CONFIG.WALLET_FILE;
    this.wallets = this.loadWallets();
  }

  loadWallets() {
    try {
      if (fs.existsSync(this.walletFile)) {
        return JSON.parse(fs.readFileSync(this.walletFile, 'utf8'));
      }
      return [];
    } catch (error) {
      logger.error('Error loading wallets:', error);
      return [];
    }
  }

  saveWallets() {
    fs.writeFileSync(this.walletFile, JSON.stringify(this.wallets, null, 2));
  }

  addWallet(privateKey, label = '') {
    // Clean the private key
    const cleanKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    
    // Validate the key
    if (!Validator.isValidPrivateKey(cleanKey)) {
      throw new Error('Invalid private key format');
    }
    
    // Check if wallet already exists
    const account = web3.eth.accounts.privateKeyToAccount(cleanKey);
    const existingWallet = this.wallets.find(w => 
      w.address.toLowerCase() === account.address.toLowerCase()
    );
    
    if (existingWallet) {
      throw new Error('Wallet already exists');
    }
    
    // Encrypt and store
    const encryptedWallet = this.encryption.encrypt(cleanKey);
    
    this.wallets.push({
      address: account.address,
      encryptedKey: encryptedWallet,
      label: label || `Wallet ${this.wallets.length + 1}`,
      active: true,
      lastUsed: null,
      addedAt: Date.now()
    });
    
    this.saveWallets();
    logAction('wallet_added', { address: account.address });
    return account.address;
  }

  getWallet(address) {
    const wallet = this.wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
    if (!wallet) return null;
    
    const privateKey = this.encryption.decrypt(wallet.encryptedKey);
    return { ...wallet, privateKey };
  }

  getActiveWallets() {
    return this.wallets.filter(w => w.active);
  }

  toggleWallet(address) {
    const walletIndex = this.wallets.findIndex(w => 
      w.address.toLowerCase() === address.toLowerCase()
    );
    
    if (walletIndex >= 0) {
      this.wallets[walletIndex].active = !this.wallets[walletIndex].active;
      this.saveWallets();
      logAction('wallet_toggled', { 
        address, 
        active: this.wallets[walletIndex].active 
      });
      return this.wallets[walletIndex].active;
    }
    return null;
  }

  removeWallet(address) {
    const initialLength = this.wallets.length;
    this.wallets = this.wallets.filter(w => 
      w.address.toLowerCase() !== address.toLowerCase()
    );
    
    if (this.wallets.length < initialLength) {
      this.saveWallets();
      logAction('wallet_removed', { address });
      return true;
    }
    return false;
  }

  updateLastUsed(address, timestamp = Date.now()) {
    const walletIndex = this.wallets.findIndex(w => 
      w.address.toLowerCase() === address.toLowerCase()
    );
    
    if (walletIndex >= 0) {
      this.wallets[walletIndex].lastUsed = timestamp;
      this.saveWallets();
    }
  }
  
  migrateWallets(legacyWallets) {
    let migrated = 0;
    
    legacyWallets.forEach((privateKey, index) => {
      try {
        // Skip if not a valid key
        if (!Validator.isValidPrivateKey(privateKey)) {
          logger.warn('Invalid wallet key during migration', { index });
          return;
        }
        
        // Get the address to check if already exists
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const exists = this.wallets.some(w => 
          w.address.toLowerCase() === account.address.toLowerCase()
        );
        
        if (!exists) {
          this.addWallet(privateKey, `Migrated Wallet ${index + 1}`);
          migrated++;
        }
      } catch (error) {
        logger.error('Wallet migration failed', { 
          index, 
          error: error.message 
        });
      }
    });
    
    return migrated;
  }
}

module.exports = WalletManager;
