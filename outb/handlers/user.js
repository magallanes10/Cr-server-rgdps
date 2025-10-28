"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../utils");
const packet_1 = require("../types/packet");
const package_json_1 = require("../../package.json");
const logging_1 = __importDefault(require("../logging"));
const node_crypto_1 = require("node:crypto");
async function isModerator(state, userID) {
    return (await state.dbState.getModeratorsIds()).includes(userID);
}
const userHandlers = {
    5001: async (socket, args, data, state) => {
        let modVersion = args.version.replace("v", "");
        if (modVersion !== package_json_1.version) {
            socket.close(1000, `version mismatch: mod version <cy>${modVersion}</c> does not equal server version <cy>${package_json_1.version}</c>`);
            return;
        }
        if (!(await state.dbState.isValidToken(args.account.accountID, args.token))) {
            (0, utils_1.sendPacket)(socket, packet_1.Packet.InvalidTokenPacket, {});
            return;
        }
        state.socketCount++;
        if (state.socketCount > state.peakSocketCount) {
            state.peakSocketCount = state.socketCount;
        }
        data.account = args.account;
        data.loggedIn = true;
        (0, utils_1.sendPacket)(socket, packet_1.Packet.LoggedInPacket, {});
        logging_1.default.info(`new connection! ${data.account.name} (ID: ${data.account.userID}, connection #${state.socketCount})`);
    },
    5002: async (socket, args, data, state) => {
        if (!(await isModerator(state, data.account?.accountID || 0))) {
            (0, utils_1.sendError)(socket, "you are not a moderator");
            return;
        }
        if (await state.dbState.banUser(state, data, args.username, args.reason) == 0) {
            (0, utils_1.sendPacket)(socket, packet_1.Packet.BannedUserPacket, {});
        }
    },
    5003: async (socket, args, data, state) => {
        if (!(await isModerator(state, data.account?.accountID || 0))) {
            (0, utils_1.sendError)(socket, "you are not a moderator");
            return;
        }
        const result = await state.dbState.authorizeUser(data, args.password);
        if (!result) {
            (0, utils_1.sendError)(socket, "unable to authorize; did you enter the correct password?");
            return;
        }
        (0, utils_1.sendPacket)(socket, packet_1.Packet.AuthorizedUserPacket, {});
    },
    5004: async (socket, args, data, state) => {
        const token = (0, node_crypto_1.randomBytes)(10).toString('hex');
        state.verifyCodes[args.account_id] = token;
        (0, utils_1.sendPacket)(socket, packet_1.Packet.ReceiveAuthCodePacket, { code: token, botAccID: state.serverConfig.botAccountID });
    },
    5005: async (socket, args, data, state) => {
        state.authManager?.accountsToAuth.push({
            socket,
            account: args.account
        });
    },
    5006: async (socket, args, data, state) => {
        if (!(await isModerator(state, data.account?.accountID || 0))) {
            (0, utils_1.sendError)(socket, "you are not a moderator");
            return;
        }
        await state.dbState.unbanUser(args.account_id);
    },
    5007: (socket, _, __, ___) => {
        (0, utils_1.sendPacket)(socket, packet_1.Packet.PongPacket, {});
    }
};
exports.default = userHandlers;
