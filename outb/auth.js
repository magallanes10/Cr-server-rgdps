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
        setInterval(() => {
            if (this.accountsToAuth.length <= 0)
                return;
            this.updateMessagesCache();
        }, 4500); // 4500 = 4.5 seconds in milliseconds
    }
    async sendBoomlingsReq(url, data, method = "POST") {
        return (await fetch(`${this.state.serverConfig.boomlingsUrl}`, {
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
        const messagesStr = (await this.sendAuthenticatedBoomlingsReq("/getGJMessages20.php", {}))
            .split("|");
        logging_1.default.info("refreshing cache");
        this.cachedMessages = {};
        messagesStr.forEach(async (messageStr) => {
            const msgObj = parseKeyMap(messageStr);
            const msgID = parseInt(msgObj["1"]);
            this.cachedMessages[msgID] = {
                accountID: parseInt(msgObj["2"]),
                age: msgObj["7"],
                messageID: msgID,
                playerID: parseInt(msgObj["3"]),
                title: Buffer.from(msgObj["4"], "base64").toString("ascii"),
                username: msgObj["6"]
            };
        });
        let outdatedMessages = [];
        Object.values(this.cachedMessages).forEach(async (message) => {
            this.accountsToAuth.forEach(async (acc) => {
                if (message.accountID !== acc.account.accountID)
                    return;
                if (message.title === this.state.verifyCodes[acc.account.accountID]) {
                    const token = await this.state.dbState.registerUser(acc.account);
                    (0, utils_1.sendPacket)(acc.socket, packet_1.Packet.ReceiveTokenPacket, { token });
                    outdatedMessages.push(message.messageID);
                }
            });
        });
        this.accountsToAuth = [];
        await this.sendAuthenticatedBoomlingsReq("/deleteGJMessages20.php", {
            messages: outdatedMessages.join(",")
        });
    }
    async sendMessage(toAccID, subject, body) {
        return await this.sendAuthenticatedBoomlingsReq("/uploadGJMessage20.php", {
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
