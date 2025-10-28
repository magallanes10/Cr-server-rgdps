"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ws_1 = __importDefault(require("ws"));
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const utils_1 = require("./utils");
const pako_1 = __importDefault(require("pako"));
const logging_1 = __importDefault(require("./logging"));
const db_1 = require("./db/db");
const error_handler_1 = require("./error_handler");
const config_1 = __importDefault(require("./config"));
const auth_1 = require("./auth");
const packet_1 = require("./types/packet");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const wss = new ws_1.default.Server({ server: httpServer });
app.use(express_1.default.json());
let handlers = {};
const dbState = new db_1.DBState();
let state = {
    lobbies: {},
    kickedUsers: {},
    sockets: {},
    swaps: {},
    verifyCodes: {},
    serverConfig: (0, config_1.default)(),
    socketCount: 0,
    peakSocketCount: 0,
    dbState
};
state.authManager = new auth_1.AuthManager(state);
const handlerFiles = ["lobby", "swap", "user"];
handlerFiles.forEach(async (handlerName) => {
    try {
        const importedHandlers = (await Promise.resolve(`${`./handlers/${handlerName}`}`).then(s => __importStar(require(s)))).default;
        handlers = { ...handlers, ...importedHandlers };
    }
    catch {
        logging_1.default.error(`unable to add handlers for file "${handlerName}". did you remember to use \`export default\`?`);
    }
});
const unauthorizedPacketRange = [...Array(1000).keys()].map((val) => val + 5000);
wss.on("connection", (socket) => {
    let data = {
        is_authorized: false
    };
    socket.on("message", (sdata) => {
        let inflatedData;
        try {
            inflatedData = pako_1.default.inflate(sdata, { to: "string" }).toString();
        }
        catch (e) {
            const errorStr = `error while attempting to decompress packet: ${e}`;
            logging_1.default.error(errorStr);
            (0, utils_1.sendError)(socket, errorStr);
            return;
        }
        const args = JSON.parse(inflatedData.toString());
        if (!args || typeof args !== "object") {
            logging_1.default.packet("received invalid packet string");
            return;
        }
        const packetId = args["packet_id"];
        const doTheThing = () => {
            if (!Object.keys(handlers).includes(String(packetId))) {
                logging_1.default.packet(`unhandled packet ${packetId}`);
                return;
            }
            logging_1.default.packet(`handling packet ${packetId}`);
            // we love committing typescript war crimes
            const handlerFunc = handlers[packetId];
            if (handlerFunc) {
                handlerFunc(socket, args["packet"], data, state);
            }
        };
        // handle user packets if we're not authorized
        if (unauthorizedPacketRange.includes(packetId)) {
            doTheThing();
            return;
        }
        if (!data.loggedIn) {
            (0, utils_1.sendPacket)(socket, packet_1.Packet.LoginNotReceivedPacket, {});
            return;
        }
        doTheThing();
    });
    socket.on("close", (code, reason) => {
        if (!data.loggedIn)
            return;
        state.socketCount--;
        (0, utils_1.disconnectFromLobby)(data, state);
    });
    socket.on("error", logging_1.default.error);
});
app.get("/", (req, res) => {
    res.send("the server is up and running!");
});
app.get("/stats", (req, res) => {
    res.send(`
        <h1>Creation Rotation server statistics</h1>
        <p>
            Number of lobbies: <b>${(0, utils_1.getLength)(state.lobbies)}</b>
            <br>
            Number of active swaps: <b>${(0, utils_1.getLength)(state.swaps)}</b>
            <br>
            Lobbies subtract swaps (inactive swaps): <b>${(0, utils_1.getLength)(state.lobbies) - (0, utils_1.getLength)(state.swaps)}</b>
            <br>
            Number of connected clients: <b>${state.socketCount}</b>
            <br>
            Peak number of connected clients: <b>${state.peakSocketCount}</b>
        </p>
    `);
});
app.post("/promote", async (req, res) => {
    if (req.body["password"] !== state.serverConfig.masterPassword) {
        res.send("not authenticated");
        return;
    }
    if (req.body["account_id"]) {
        const passw = await state.dbState.promoteUser(req.body["account_id"]);
        res.send(`password: ${passw}`);
    }
    else {
        res.send("no account_id found");
    }
});
app.post("/demote", async (req, res) => {
    if (req.body["password"] !== state.serverConfig.masterPassword) {
        res.send("not authenticated");
        return;
    }
    res.send(await state.dbState.demoteUser(req.body["account_id"]));
});
const port = process.env.PORT || 3000;
const errHandler = new error_handler_1.ErrorHandler(state);
errHandler.registerListeners();
logging_1.default.info(`listening on port ${port}`);
httpServer.listen(port);
