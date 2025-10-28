"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const utils_1 = require("./utils");
const packet_1 = require("./types/packet");
const logging_1 = __importDefault(require("./logging"));

// thanks prevter!
const parseKeyMap = (keyMap) => keyMap.split(":")
    .reduce((acc, key, index, array) => {
    if (index % 2 === 0) {
        acc[key] = array[index + 1];
    }
    return acc;
}, {});

class AuthManager {
    constructor(state) {
        this.state = state;
        this.accountsToAuth = [];
        this.cachedMessages = {};
        this.isUpdatingCache = false;
        
        // Start periodic cache updates
        this.startCacheUpdates();
    }

    startCacheUpdates() {
        setInterval(async () => {
            if (this.accountsToAuth.length <= 0 || this.isUpdatingCache) return;
            await this.updateMessagesCache();
        }, 4500); // 4500 = 4.5 seconds in milliseconds
    }

    async sendBoomlingsReq(endpoint, data, method = "POST") {
        try {
            const response = await fetch(`${this.state.serverConfig.boomlingsUrl}${endpoint}`, {
                headers: {
                    "User-Agent": "",
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                method,
                body: new URLSearchParams({
                    secret: "Wmfd2893gb7",
                    ...data
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.text();
        } catch (error) {
            // Use info instead of error if warn is not available
            if (logging_1.default.error) {
                logging_1.default.error(`Boomlings request failed: ${error.message}`);
            } else if (logging_1.default.info) {
                logging_1.default.info(`Boomlings request failed: ${error.message}`);
            }
            throw error;
        }
    }

    async sendAuthenticatedBoomlingsReq(endpoint, data) {
        return await this.sendBoomlingsReq(endpoint, {
            gjp2: this.state.serverConfig.botAccountGJP2,
            accountID: `${this.state.serverConfig.botAccountID}`,
            ...data
        });
    }

    async getMessages() {
        // If cache is empty, try to populate it
        if (Object.keys(this.cachedMessages).length === 0) {
            await this.updateMessagesCache();
        }
        return this.cachedMessages;
    }

    async updateMessagesCache() {
        if (this.isUpdatingCache) {
            // Use info instead of warn
            if (logging_1.default.info) {
                logging_1.default.info("Cache update already in progress, skipping...");
            }
            return;
        }

        this.isUpdatingCache = true;

        try {
            const messagesResponse = await this.sendAuthenticatedBoomlingsReq("/getGJMessages20.php", {});
            
            if (!messagesResponse || messagesResponse === "-1" || messagesResponse === "-2") {
                // Use info instead of warn
                if (logging_1.default.info) {
                    logging_1.default.info("No messages found or authentication failed");
                }
                this.cachedMessages = {};
                return;
            }

            const messagesStr = messagesResponse.split("|").filter(msg => msg.trim() !== "");
            if (logging_1.default.info) {
                logging_1.default.info(`Refreshing cache with ${messagesStr.length} messages`);
            }

            const newCachedMessages = {};
            
            for (const messageStr of messagesStr) {
                try {
                    const msgObj = parseKeyMap(messageStr);
                    const msgID = parseInt(msgObj["1"]);
                    
                    if (isNaN(msgID)) continue;

                    newCachedMessages[msgID] = {
                        accountID: parseInt(msgObj["2"]),
                        age: msgObj["7"],
                        messageID: msgID,
                        playerID: parseInt(msgObj["3"]),
                        title: Buffer.from(msgObj["4"], "base64").toString("ascii"),
                        username: msgObj["6"],
                        read: parseInt(msgObj["8"]) === 1
                    };
                } catch (error) {
                    if (logging_1.default.error) {
                        logging_1.default.error(`Failed to parse message: ${error.message}`);
                    } else if (logging_1.default.info) {
                        logging_1.default.info(`Failed to parse message: ${error.message}`);
                    }
                }
            }

            this.cachedMessages = newCachedMessages;
            await this.processPendingAuthentications();
            
        } catch (error) {
            // Use info instead of error if needed
            if (logging_1.default.error) {
                logging_1.default.error(`Failed to update messages cache: ${error.message}`);
            } else if (logging_1.default.info) {
                logging_1.default.info(`Failed to update messages cache: ${error.message}`);
            }
        } finally {
            this.isUpdatingCache = false;
        }
    }

    async processPendingAuthentications() {
        const outdatedMessages = [];
        const failedAuthentications = [];

        for (const acc of this.accountsToAuth) {
            let found = false;
            
            for (const message of Object.values(this.cachedMessages)) {
                if (message.accountID === acc.account.accountID && 
                    message.title === this.state.verifyCodes[acc.account.accountID]) {
                    
                    try {
                        const token = await this.state.dbState.registerUser(acc.account);
                        (0, utils_1.sendPacket)(acc.socket, packet_1.Packet.ReceiveTokenPacket, { token });
                        outdatedMessages.push(message.messageID);
                        found = true;
                        if (logging_1.default.info) {
                            logging_1.default.info(`Successfully authenticated account ID: ${acc.account.accountID}`);
                        }
                        break;
                    } catch (error) {
                        if (logging_1.default.error) {
                            logging_1.default.error(`Failed to register user ${acc.account.accountID}: ${error.message}`);
                        } else if (logging_1.default.info) {
                            logging_1.default.info(`Failed to register user ${acc.account.accountID}: ${error.message}`);
                        }
                        failedAuthentications.push(acc);
                    }
                }
            }
            
            if (!found) {
                // If not found in current cache, keep it for next attempt
                failedAuthentications.push(acc);
            }
        }

        // Update the pending authentications list
        this.accountsToAuth = failedAuthentications;

        // Delete processed messages
        if (outdatedMessages.length > 0) {
            await this.deleteMessages(outdatedMessages);
        }
    }

    async deleteMessages(messageIDs) {
        try {
            await this.sendAuthenticatedBoomlingsReq("/deleteGJMessages20.php", {
                messages: messageIDs.join(",")
            });
            if (logging_1.default.info) {
                logging_1.default.info(`Deleted ${messageIDs.length} verification messages`);
            }
        } catch (error) {
            if (logging_1.default.error) {
                logging_1.default.error(`Failed to delete messages: ${error.message}`);
            } else if (logging_1.default.info) {
                logging_1.default.info(`Failed to delete messages: ${error.message}`);
            }
        }
    }

    async addAccountForAuth(account, socket) {
        this.accountsToAuth.push({ account, socket });
        if (logging_1.default.info) {
            logging_1.default.info(`Added account ${account.accountID} for authentication`);
        }
        
        // Trigger immediate cache update if not already updating
        if (!this.isUpdatingCache) {
            await this.updateMessagesCache();
        }
    }

    async sendMessage(toAccID, subject, body) {
        try {
            const response = await this.sendAuthenticatedBoomlingsReq("/uploadGJMessage20.php", {
                toAccountID: toAccID.toString(),
                subject: this.urlsafeb64(subject),
                body: this.urlsafeb64(this.xor(body, "14251"))
            });

            if (response === "1") {
                if (logging_1.default.info) {
                    logging_1.default.info(`Message sent successfully to account ID: ${toAccID}`);
                }
                return true;
            } else {
                if (logging_1.default.error) {
                    logging_1.default.error(`Failed to send message to ${toAccID}. Response: ${response}`);
                } else if (logging_1.default.info) {
                    logging_1.default.info(`Failed to send message to ${toAccID}. Response: ${response}`);
                }
                return false;
            }
        } catch (error) {
            if (logging_1.default.error) {
                logging_1.default.error(`Error sending message to ${toAccID}: ${error.message}`);
            } else if (logging_1.default.info) {
                logging_1.default.info(`Error sending message to ${toAccID}: ${error.message}`);
            }
            return false;
        }
    }

    async sendVerificationMessage(toAccID, username) {
        const verifyCode = this.generateVerificationCode();
        this.state.verifyCodes[toAccID] = verifyCode;
        
        const subject = "Account Verification";
        const body = `Hello ${username}!\n\nYour verification code is: ${verifyCode}\n\nPlease wait for the system to automatically verify your account.`;
        
        const success = await this.sendMessage(toAccID, subject, body);
        
        if (success) {
            if (logging_1.default.info) {
                logging_1.default.info(`Verification message sent to ${username} (ID: ${toAccID})`);
            }
        } else {
            if (logging_1.default.error) {
                logging_1.default.error(`Failed to send verification message to ${username} (ID: ${toAccID})`);
            } else if (logging_1.default.info) {
                logging_1.default.info(`Failed to send verification message to ${username} (ID: ${toAccID})`);
            }
        }
        
        return success;
    }

    generateVerificationCode() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    // helper function for converting to URL-safe b64
    urlsafeb64(input) {
        return Buffer.from(input, "utf8").toString("base64")
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    // cycle xor algorithm from
    // https://wyliemaster.github.io/gddocs/#/topics/encryption/xor
    xor(input, key) {
        let result = "";
        const encoder = new TextEncoder();
        for (let i = 0; i < input.length; i++) {
            let byte = encoder.encode(input[i])[0];
            let xkey = encoder.encode(key[i % key.length])[0];
            result += String.fromCharCode(byte ^ xkey);
        }
        return result;
    }

    // Cleanup method to remove old verification codes
    cleanupOldVerificationCodes(maxAge = 15 * 60 * 1000) { // 15 minutes default
        const now = Date.now();
        for (const [accountID, code] of Object.entries(this.state.verifyCodes)) {
            // Assuming verifyCodes stores objects with timestamp, or we need to track time separately
            // This is a placeholder - you might need to adjust based on your actual data structure
            if (typeof code === 'object' && code.timestamp && (now - code.timestamp) > maxAge) {
                delete this.state.verifyCodes[accountID];
            }
        }
    }

    // Get pending authentication count
    getPendingAuthCount() {
        return this.accountsToAuth.length;
    }

    // Clear specific account from auth queue
    removeAccountFromAuthQueue(accountID) {
        this.accountsToAuth = this.accountsToAuth.filter(acc => acc.account.accountID !== accountID);
    }
}

exports.AuthManager = AuthManager;
