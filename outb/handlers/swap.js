"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../utils");
const swap_1 = require("../types/swap");
const packet_1 = require("../types/packet");
const swapHandlers = {
    2007: (socket, _, data, state) => {
        const { currentLobbyCode: lobbyCode, account } = data;
        if (!lobbyCode || !account)
            return;
        if (!Object.keys(state.lobbies).includes(lobbyCode))
            return;
        if (state.lobbies[lobbyCode].settings.owner.userID != account.userID) {
            (0, utils_1.sendError)(socket, "you are not the owner of this lobby");
            return;
        }
        if (state.lobbies[lobbyCode].accounts.length <= 1) {
            (0, utils_1.sendError)(socket, "you are the only person in the lobby, cannot start level swap");
            return;
        }
        (0, utils_1.emitToLobby)(state, lobbyCode, packet_1.Packet.SwapStartedPacket, {});
        state.swaps[lobbyCode] = new swap_1.Swap(lobbyCode, state);
        state.swaps[lobbyCode].scheduleNextSwap();
    },
    3001: (socket, args, data, state) => {
        const { currentLobbyCode: code } = data;
        if (!code) {
            (0, utils_1.sendError)(socket, "you are not in a lobby");
            return;
        }
        state.swaps[code].addLevel(args.level, data.account?.accountID || 0);
    }
};
exports.default = swapHandlers;
