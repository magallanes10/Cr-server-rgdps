"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.offsetArray = offsetArray;
exports.hashPsw = hashPsw;
exports.sendPacket = sendPacket;
exports.sendError = sendError;
exports.emitToLobby = emitToLobby;
exports.broadcastLobbyUpdate = broadcastLobbyUpdate;
exports.generateCode = generateCode;
exports.getLength = getLength;
exports.disconnectFromLobby = disconnectFromLobby;
const packet_1 = require("./types/packet");
const logging_1 = __importDefault(require("./logging"));
const node_crypto_1 = require("node:crypto");
function offsetArray(arr, n) {
    let array = [...arr];
    const len = array.length;
    array.push(...array.splice(0, (-n % len + len) % len));
    return array;
}
function hashPsw(password) {
    return (0, node_crypto_1.createHash)("sha256").update(password).digest("base64");
}
function sendPacket(socket, packetId, args) {
    // someone's gonna cringe at this code
    let realArgs = {};
    if (Object.keys(args).length == 0) {
        realArgs = {
            // thank you cereal for not allowing
            // me to serialize nothing!
            dummy: ""
        };
    }
    else {
        realArgs = args;
    }
    socket.send(`${packetId}|${JSON.stringify({ packet: realArgs })}`);
    logging_1.default.packet(`sent packet ${packetId}`);
}
function sendError(socket, error) {
    sendPacket(socket, packet_1.Packet.ErrorPacket, { error });
}
function emitToLobby(state, lobbyCode, packetId, args) {
    if (!state.sockets[lobbyCode])
        return;
    Object.values(state.sockets[lobbyCode]).forEach((socket) => {
        sendPacket(socket, packetId, args);
    });
}
function broadcastLobbyUpdate(state, lobbyCode) {
    emitToLobby(state, lobbyCode, packet_1.Packet.LobbyUpdatedPacket, { info: state.lobbies[lobbyCode] });
}
// https://stackoverflow.com/a/7228322
function generateCode() {
    return Math.floor(Math.random() * (999_999) + 1).toString().padStart(6, "0");
    // return "000001" // this is so that i dont suffer
}
function getLength(obj) {
    return Object.keys(obj).length;
}
function disconnectFromLobby(data, state) {
    const { currentLobbyCode: lobbyCode, account } = data;
    if (!lobbyCode) {
        logging_1.default.error("could not find lobby");
        return;
    }
    if (!account) {
        logging_1.default.error("could not find account");
        return;
    }
    let isDeletingLobby = false;
    if (Object.keys(state.lobbies).includes(lobbyCode)) {
        const index = state.lobbies[lobbyCode].accounts.map(e => e.userID).indexOf(account.userID);
        state.lobbies[lobbyCode].accounts.splice(index, 1);
        if (data.account?.userID === state.lobbies[lobbyCode].settings.owner.userID) {
            Object.values(state.sockets[lobbyCode]).forEach((socket) => {
                socket.close(1000, "owner left, lobby closed");
            });
        }
        if (getLength(state.lobbies[lobbyCode].accounts) == 0) {
            delete state.lobbies[lobbyCode];
            delete state.kickedUsers[lobbyCode];
            delete state.sockets[lobbyCode];
            isDeletingLobby = true;
        }
        if (Object.keys(state.swaps).includes(lobbyCode)) {
            if (isDeletingLobby) {
                state.swaps[lobbyCode].unscheduleNextSwap();
                delete state.swaps[lobbyCode];
            }
            else if (state.swaps[lobbyCode]) {
                if (getLength(state.swaps[lobbyCode].levels) !== 0) {
                    state.swaps[lobbyCode].checkSwap();
                }
            }
        }
    }
    logging_1.default.info(`disconnected ${account.name} (${account.userID}) from lobby with code ${data.currentLobbyCode}`);
    if (!isDeletingLobby) {
        broadcastLobbyUpdate(state, lobbyCode);
    }
}
