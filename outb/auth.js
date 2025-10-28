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
            const response = await this.sendAuthenticatedBoomlingsReq("database/getGJMessages20.php", {});
            
            // Handle empty response or no messages
            if (!response || response === "-1" || response === "-2") {
                logging_1.default.info("No messages found or error response");
                this.cachedMessages = {};
                return;
            }

            const messagesStr = response.split("|");
            logging_1.default.info("refreshing cache");
            
            this.cachedMessages = {};
            const outdatedMessages = [];

            for (const messageStr of messagesStr) {
                if (!messageStr || messageStr.trim() === "") continue;
                
                try {
                    const msgObj = parseKeyMap(messageStr);
                    
                    // Validate required fields
                    if (!msgObj["1"] || !msgObj["2"] || !msgObj["3"]) {
                        logging_1.default.warn("Skipping message with missing required fields");
                        continue;
                    }

                    const msgID = parseInt(msgObj["1"]);
                    const accountID = parseInt(msgObj["2"]);
                    const playerID = parseInt(msgObj["3"]);

                    if (isNaN(msgID) || isNaN(accountID) || isNaN(playerID)) {
                        logging_1.default.warn("Skipping message with invalid numeric fields");
                        continue;
                    }

                    this.cachedMessages[msgID] = {
                        accountID: accountID,
                        age: msgObj["7"] || "",
                        messageID: msgID,
                        playerID: playerID,
                        title: msgObj["4"] ? Buffer.from(msgObj["4"], "base64").toString("ascii") : "",
                        username: msgObj["6"] || ""
                    };

                    // Check if this message is for authentication
                    for (const acc of this.accountsToAuth) {
                        if (accountID === acc.account.accountID && this.cachedMessages[msgID].title === this.state.verifyCodes[acc.account.accountID]) {
                            const token = await this.state.dbState.registerUser(acc.account);
                            (0, utils_1.sendPacket)(acc.socket, packet_1.Packet.ReceiveTokenPacket, { token });
                            outdatedMessages.push(msgID);
                            logging_1.default.info(`Successfully authenticated account ID: ${accountID}`);
                        }
                    }
                } catch (error) {
                    logging_1.default.error(`Error processing message string: ${messageStr}`, error);
                    continue;
                }
            }

            // Remove processed accounts from auth queue
            this.accountsToAuth = this.accountsToAuth.filter(acc => 
                !outdatedMessages.some(msgID => 
                    this.cachedMessages[msgID]?.accountID === acc.account.accountID
                )
            );

            // Delete processed messages
            if (outdatedMessages.length > 0) {
                await this.sendAuthenticatedBoomlingsReq("deleteGJMessages20.php", {
                    messages: outdatedMessages.join(",")
                });
                logging_1.default.info(`Deleted ${outdatedMessages.length} processed messages`);
            }
        } catch (error) {
            logging_1.default.error("Error updating messages cache:", error);
        }
    }
    async sendMessage(toAccID, subject, body) {
        return await this.sendAuthenticatedBoomlingsReq("uploadGJMessage20.php", {
            toAccountID: toAccID.toString(),
            subject: this.urlsafeb64(subject),
            body: this.urlsafeb64(this.xor(body, "14251"))
        });
    }
    // helper function for converting to URL-safe b64
    urlsafeb64(input) {
        return Buffer.from(input, "utf8").toString("base64");
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
}
exports.AuthManager = AuthManager;
