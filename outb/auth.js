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
        this.cachedMessages = {}; // Initialize cachedMessages
        setInterval(() => {
            if (this.accountsToAuth.length <= 0)
                return;
            this.updateMessagesCache();
        }, 4500); // 4500 = 4.5 seconds in milliseconds
    }
    async sendBoomlingsReq(url, data, method = "POST") {
        return (await fetch(`${this.state.serverConfig.boomlingsUrl}/${url}`, {
            headers: {
                "User-Agent": ""
            },
            method,
            body: new URLSearchParams({
                secret: "Wmfd2893gb7",
                ...data
            })
        })).text();
    }
    async sendAuthenticatedBoomlingsReq(url, data) {
        return await this.sendBoomlingsReq(url, {
            gjp2: this.state.serverConfig.botAccountGJP2,
            accountID: `${this.state.serverConfig.botAccountID}`,
            ...data
        });
    }
    async getMessages() {
        return this.cachedMessages;
    }
    async updateMessagesCache() {
        try {
            const messagesResponse = await this.sendAuthenticatedBoomlingsReq("/getGJMessages20.php", {});
            
            // Check if response is valid
            if (!messagesResponse || messagesResponse === "-1" || messagesResponse === "-2") {
                logging_1.default.warn("No messages found or invalid response");
                this.cachedMessages = {};
                return;
            }

            const messagesStr = messagesResponse.split("|");
            logging_1.default.info("refreshing cache");
            
            this.cachedMessages = {};
            
            for (const messageStr of messagesStr) {
                if (!messageStr) continue;
                
                try {
                    const msgObj = parseKeyMap(messageStr);
                    const msgID = parseInt(msgObj["1"]);
                    
                    // Validate required fields
                    if (!msgObj["1"] || !msgObj["2"] || !msgObj["4"]) {
                        logging_1.default.warn("Skipping message with missing required fields");
                        continue;
                    }
                    
                    // Safely decode base64 title
                    const titleBase64 = msgObj["4"];
                    let title = "";
                    try {
                        if (titleBase64 && typeof titleBase64 === "string") {
                            title = Buffer.from(titleBase64, "base64").toString("ascii");
                        }
                    } catch (decodeError) {
                        logging_1.default.warn(`Failed to decode message title: ${decodeError}`);
                        title = "[Decode Error]";
                    }
                    
                    this.cachedMessages[msgID] = {
                        accountID: parseInt(msgObj["2"]),
                        age: msgObj["7"] || "",
                        messageID: msgID,
                        playerID: parseInt(msgObj["3"] || "0"),
                        title: title,
                        username: msgObj["6"] || ""
                    };
                } catch (parseError) {
                    logging_1.default.warn(`Failed to parse message: ${parseError}`);
                    continue;
                }
            }
            
            const outdatedMessages = [];
            const authPromises = [];
            
            for (const message of Object.values(this.cachedMessages)) {
                for (const acc of this.accountsToAuth) {
                    if (message.accountID !== acc.account.accountID) continue;
                    
                    if (message.title === this.state.verifyCodes[acc.account.accountID]) {
                        authPromises.push((async () => {
                            try {
                                const token = await this.state.dbState.registerUser(acc.account);
                                (0, utils_1.sendPacket)(acc.socket, packet_1.Packet.ReceiveTokenPacket, { token });
                                outdatedMessages.push(message.messageID);
                            } catch (authError) {
                                logging_1.default.error(`Authentication failed for account ${acc.account.accountID}: ${authError}`);
                            }
                        })());
                    }
                }
            }
            
            // Wait for all authentication promises
            await Promise.all(authPromises);
            
            // Clear accounts to auth only after processing
            this.accountsToAuth = this.accountsToAuth.filter(acc => 
                !outdatedMessages.some(msgId => {
                    const message = this.cachedMessages[msgId];
                    return message && message.accountID === acc.account.accountID;
                })
            );
            
            // Delete outdated messages if any exist
            if (outdatedMessages.length > 0) {
                try {
                    await this.sendAuthenticatedBoomlingsReq("/deleteGJMessages20.php", {
                        messages: outdatedMessages.join(",")
                    });
                    logging_1.default.info(`Deleted ${outdatedMessages.length} verification messages`);
                } catch (deleteError) {
                    logging_1.default.error(`Failed to delete messages: ${deleteError}`);
                }
            }
            
        } catch (error) {
            logging_1.default.error(`Error updating messages cache: ${error}`);
        }
    }
    async sendMessage(toAccID, subject, body) {
        try {
            // Validate inputs
            if (!toAccID || !subject || !body) {
                throw new Error("Missing required parameters for sendMessage");
            }
            
            const safeSubject = typeof subject === "string" ? subject : String(subject);
            const safeBody = typeof body === "string" ? body : String(body);
            
            return await this.sendAuthenticatedBoomlingsReq("/uploadGJMessage20.php", {
                toAccountID: toAccID.toString(),
                subject: this.urlsafeb64(safeSubject),
                body: this.urlsafeb64(this.xor(safeBody, "14251"))
            });
        } catch (error) {
            logging_1.default.error(`Error sending message: ${error}`);
            throw error;
        }
    }
    // helper function for converting to URL-safe b64
    urlsafeb64(input) {
        if (input === undefined || input === null) {
            throw new Error("Input cannot be undefined or null for urlsafeb64");
        }
        const inputStr = typeof input === "string" ? input : String(input);
        return Buffer.from(inputStr, "utf8").toString("base64");
    }
    // cycle xor algorithm from
    // https://wyliemaster.github.io/gddocs/#/topics/encryption/xor
    xor(input, key) {
        if (!input || !key) {
            throw new Error("Input and key are required for xor");
        }
        
        const inputStr = typeof input === "string" ? input : String(input);
        const keyStr = typeof key === "string" ? key : String(key);
        
        let result = "";
        const encoder = new TextEncoder();
        for (let i = 0; i < inputStr.length; i++) {
            let byte = encoder.encode(inputStr[i])[0];
            let xkey = encoder.encode(keyStr[i % keyStr.length])[0];
            result += String.fromCharCode(byte ^ xkey);
        }
        return result;
    }
    
    // Add account to authentication queue
    addAccountToAuth(account, socket) {
        this.accountsToAuth.push({ account, socket });
    }
}
exports.AuthManager = AuthManager;
