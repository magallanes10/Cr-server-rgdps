"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Swap = void 0;
const utils_1 = require("../utils");
const packet_1 = require("./packet");
const logging_1 = __importDefault(require("../logging"));
const DUMMY_LEVEL_DATA = {
    level: {
        levelName: "THIS IS DUMMY DATA I REPEAT THIS IS DUMMY DATA",
        levelString: "THIS IS DUMMY DATA I REPEAT THIS IS DUMMY DATA",
        songID: 6942042069,
        songIDs: "THIS IS DUMMY DATA I REPEAT THIS IS DUMMY DATA"
    },
    accountID: 6942042069
};
class Swap {
    constructor(lobbyCode, state) {
        this.lobbyCode = lobbyCode;
        this.lobby = state.lobbies[lobbyCode];
        this.currentTurn = 0;
        this.serverState = state;
        this.totalTurns = (0, utils_1.getLength)(this.lobby.accounts) * this.lobby.settings.turns;
        this.levels = [];
        this.currentlySwapping = false;
        this.isSwapEnding = false;
        // initialize swap order
        this.swapOrder = this.lobby.accounts.map(acc => acc.accountID);
    }
    swap(ending = false, reason = "") {
        this.levels = [];
        this.currentTurn++;
        this.currentlySwapping = true;
        this.isSwapEnding = ending;
        this.closeReason = reason;
        logging_1.default.debug(this.swapOrder);
        (0, utils_1.emitToLobby)(this.serverState, this.lobbyCode, packet_1.Packet.TimeToSwapPacket, {});
    }
    addLevel(level, accId) {
        const idx = this.swapOrder.indexOf(accId);
        this.levels.push({
            accountID: parseInt((0, utils_1.offsetArray)(this.swapOrder, 1)[idx]),
            level
        });
        this.checkSwap();
    }
    checkSwap() {
        if (!this.currentlySwapping)
            return;
        this.lobby.accounts.forEach((acc, index) => {
            if (this.serverState.lobbies[this.lobbyCode].accounts.findIndex(lobbyAcc => lobbyAcc.accountID === acc.accountID) !== -1)
                return;
            this.levels.splice(index, 1);
        });
        if ((0, utils_1.getLength)(this.levels) < this.lobby.accounts.length)
            return;
        this.currentlySwapping = false;
        if (!this.isSwapEnding) {
            (0, utils_1.emitToLobby)(this.serverState, this.lobbyCode, packet_1.Packet.ReceiveSwappedLevelPacket, { levels: this.levels });
            this.levels = [];
            if (this.currentTurn >= this.totalTurns) {
                this.swapEnded = true;
                setTimeout(() => (0, utils_1.emitToLobby)(this.serverState, this.lobbyCode, packet_1.Packet.SwapEndedPacket, {}), 750); // 0.75 seconds
                return;
            }
            this.scheduleNextSwap();
        }
        // else {
        //     this.swapEnded = true
        //     this.levels = offsetArray(this.levels, this.totalTurns - this.currentTurn)
        //     emitToLobby(this.serverState, this.lobbyCode, Packet.ReceiveSwappedLevelPacket, { levels: this.levels })
        //     Object.values(this.serverState.sockets[this.lobbyCode]).forEach(socket => {
        //         socket.close(1000, this.closeReason)
        //     })
        // }
    }
    scheduleNextSwap() {
        if (this.swapEnded)
            return;
        this.timeout = setTimeout(() => {
            this.swap();
        }, this.lobby.settings.minutesPerTurn * 60_000);
    }
    unscheduleNextSwap() {
        clearTimeout(this.timeout);
    }
}
exports.Swap = Swap;
