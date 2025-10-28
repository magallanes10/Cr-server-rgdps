"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../utils");
const packet_1 = require("../types/packet");
const logging_1 = __importDefault(require("../logging"));
const obscenity_1 = require("obscenity");
const matcher = new obscenity_1.RegExpMatcher({
    ...obscenity_1.englishDataset.build(),
    ...obscenity_1.englishRecommendedTransformers
});
function correctLobby(lobby) {
    if (lobby.settings.minutesPerTurn > 60) {
        lobby.settings.minutesPerTurn = 60;
    }
    if (lobby.settings.minutesPerTurn <= 0) {
        lobby.settings.minutesPerTurn = 1;
    }
    if (lobby.settings.turns > 25) {
        lobby.settings.turns = 25;
    }
    if (lobby.settings.turns <= 0) {
        lobby.settings.turns = 1;
    }
}
function sendMessageToLobby(state, lobbyCode, message, author) {
    (0, utils_1.emitToLobby)(state, lobbyCode, packet_1.Packet.MessageSentPacket, {
        message: {
            message: message,
            timestamp: Math.floor(Date.now() / 1000),
            author
        }
    });
}
const lobbyHandlers = {
    2001: async (socket, args, data, state) => {
        if (matcher.hasMatch(args.settings.name) && args.settings.isPublic) {
            (0, utils_1.sendError)(socket, "the lobby name cannot contain profane terminology. please pick a different name.");
            return;
        }
        if (!data.account)
            return;
        if ((await state.dbState.getBannedIds()).includes(data.account.accountID) && args.settings.isPublic) {
            (0, utils_1.sendError)(socket, "you have been restricted from Creation Rotation; you cannot create public lobbies");
            return;
        }
        const newLobby = {
            code: (0, utils_1.generateCode)(),
            accounts: [],
            settings: args.settings
        };
        correctLobby(newLobby);
        state.sockets[newLobby.code] = {};
        state.kickedUsers[newLobby.code] = [];
        state.lobbies[newLobby.code] = newLobby;
        setTimeout(() => {
            if (state.swaps[newLobby.code])
                return;
            // the line below not existing has spammed
            // server errors :thumbs_up:
            if (!state.sockets[newLobby.code])
                return;
            Object.values(state.sockets[newLobby.code]).forEach(socket => {
                socket.close(1000, "lobby timeout; swap hasn't been started in an hour");
            });
        }, 3_600_000); // 3_600_000 = one hour in milliseconds
        (0, utils_1.sendPacket)(socket, packet_1.Packet.LobbyCreatedPacket, {
            info: newLobby
        });
    },
    2002: async (socket, args, data, state) => {
        const { code } = args;
        const { account } = data;
        if (!account) {
            logging_1.default.error("not logged in!");
            return;
        }
        if (!Object.keys(state.lobbies).includes(code)) {
            (0, utils_1.sendError)(socket, `lobby with code '${code}' does not exist`);
            return;
        }
        if (state.lobbies[code].accounts.filter(acc => acc.accountID == account.accountID).length >= 1) {
            (0, utils_1.sendError)(socket, "you are already in this lobby");
            return;
        }
        if (Object.keys(state.swaps).includes(code)) {
            (0, utils_1.sendError)(socket, `creation rotation with code '${code}' is already in session`);
            return;
        }
        if (state.kickedUsers[code].includes(account.userID)) {
            (0, utils_1.sendError)(socket, `you have been kicked from lobby <cy>"${state.lobbies[code].settings.name}"</c>. you cannot rejoin`);
            return;
        }
        if ((await state.dbState.getBannedIds()).includes(account.accountID) && state.lobbies[code].settings.isPublic) {
            (0, utils_1.sendError)(socket, "you have been restricted from Creation Rotation; you cannot join public lobbies");
            return;
        }
        state.lobbies[code].accounts.push(account);
        state.sockets[code][account.userID] = socket;
        logging_1.default.info(`user ${account.name} has joined lobby ${state.lobbies[code].settings.name}`);
        data.currentLobbyCode = code;
        (0, utils_1.sendPacket)(socket, packet_1.Packet.JoinedLobbyPacket, {});
        (0, utils_1.broadcastLobbyUpdate)(state, code);
    },
    2003: (socket, _, data, state) => {
        const { currentLobbyCode: code } = data;
        if (!code) {
            (0, utils_1.sendError)(socket, "you are not in a lobby");
            return;
        }
        if (!Object.keys(state.lobbies).includes(code))
            return;
        (0, utils_1.sendPacket)(socket, packet_1.Packet.ReceiveAccountsPacket, { accounts: state.lobbies[code].accounts });
    },
    2004: (socket, _, data, state) => {
        const { currentLobbyCode: code } = data;
        if (!code) {
            (0, utils_1.sendError)(socket, "you are not in a lobby");
            return;
        }
        if (!Object.keys(state.lobbies).includes(code))
            return;
        (0, utils_1.sendPacket)(socket, packet_1.Packet.ReceiveLobbyInfoPacket, { info: state.lobbies[code] });
    },
    2005: (socket) => {
        socket.close();
        // this is probably not needed anymore
        // disconnectFromLobby(data)
    },
    2006: (socket, args, data, state) => {
        if (matcher.hasMatch(args.settings.name) && args.settings.isPublic) {
            (0, utils_1.sendError)(socket, "the lobby name cannot contain profane terminology. please pick a different name.");
            return;
        }
        const { currentLobbyCode: code } = data;
        if (!code)
            return;
        if (!Object.keys(state.lobbies).includes(code)) {
            (0, utils_1.sendError)(socket, "lobby doesn't exist");
            return;
        }
        if (state.lobbies[code].settings.owner.userID !== data.account?.userID) {
            (0, utils_1.sendError)(socket, "you are not the owner of this lobby");
            return;
        }
        const { code: _, ...newArgs } = args;
        const oldSettings = state.lobbies[code].settings;
        state.lobbies[code].settings = {
            ...oldSettings,
            ...newArgs.settings
        };
        correctLobby(state.lobbies[code]);
        (0, utils_1.broadcastLobbyUpdate)(state, code);
    },
    2008: (socket, args, data, state) => {
        const { currentLobbyCode: lobbyCode, account } = data;
        const { userID } = args;
        if (!lobbyCode || !account)
            return;
        if (!Object.keys(state.lobbies).includes(lobbyCode)) {
            (0, utils_1.sendError)(socket, "invalid lobby code received");
            return;
        }
        if (state.lobbies[lobbyCode].settings.owner.userID != account.userID) {
            (0, utils_1.sendError)(socket, "you are not the owner of this lobby");
            return;
        }
        if (account.userID == userID) {
            (0, utils_1.sendError)(socket, "you cannot kick yourself");
            return;
        }
        state.sockets[lobbyCode][userID].close(1000, "kicked from lobby by owner; you can no longer rejoin");
        state.kickedUsers[lobbyCode].push(userID);
    },
    2009: (socket, _, __, state) => {
        (0, utils_1.sendPacket)(socket, packet_1.Packet.ReceivePublicLobbiesPacket, { lobbies: Object.values(state.lobbies)
                .filter((lobby) => lobby.settings.isPublic && !Object.keys(state.swaps).includes(lobby.code))
                .sort((a, b) => b.accounts.length - a.accounts.length) });
    },
    2010: async (socket, args, data, state) => {
        if (matcher.hasMatch(args.message)) {
            return;
        }
        if (!data.account)
            return;
        if (!data.currentLobbyCode)
            return;
        const lobby = state.lobbies[data.currentLobbyCode];
        if ((await state.dbState.getBannedIds()).includes(data.account.accountID) && lobby.settings.isPublic) {
            (0, utils_1.sendError)(socket, "you have been restricted from public use of Creation Rotation; you cannot send messages in public lobbies");
            return;
        }
        sendMessageToLobby(state, data.currentLobbyCode || "", args.message, data.account);
    }
};
exports.default = lobbyHandlers;
