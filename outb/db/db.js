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
exports.DBState = exports.DB_PATH = void 0;
const sqlite_1 = require("sqlite");
const sqlite3_1 = __importDefault(require("sqlite3"));
const path = __importStar(require("path"));
const app_root_path_1 = require("app-root-path");
const logging_1 = __importDefault(require("../logging"));
const utils_1 = require("../utils");
const node_crypto_1 = require("node:crypto");
exports.DB_PATH = path.join(__dirname, "database.db");
class DBState {
    constructor() {
        this.openDB().then((db) => {
            this.db = db;
            this.db.migrate({
                migrationsPath: path.join(app_root_path_1.path, "migrations")
            });
            logging_1.default.info("database migrated");
        });
    }
    async openDB() {
        return (0, sqlite_1.open)({
            filename: path.join(app_root_path_1.path, "database.db"),
            driver: sqlite3_1.default.Database
        });
    }
    // -1 = you are not logged in
    // 0  = you are not a moderator
    // 1  = user banned!
    async banUser(state, data, username, reason) {
        if (!data.account) {
            return -1;
        }
        if (!(await this.getModeratorsIds()).includes(data.account.accountID)) {
            return 0; // error
        }
        const response = await this.db.get(`SELECT account_id FROM users WHERE username LIKE ?`, username.toLowerCase());
        if (!response) {
            logging_1.default.info("response failed :(");
            return -2;
        }
        const { account_id } = response;
        this.db.run(`
            INSERT INTO banned_users (account_id, issued_by, reason)
            VALUES (?, ?, ?)
            `, account_id, data.account.accountID, reason);
        return 1; // success!
    }
    async unbanUser(account_id) {
        this.db.run(`
            DELETE FROM banned_users
            WHERE account_id = ?
            `, account_id);
    }
    async promoteUser(account_id) {
        const password = (0, node_crypto_1.randomBytes)(10).toString("hex");
        await this.db.run(`
            INSERT INTO moderators (account_id, passw)
            VALUES (?, ?)
            `, account_id, (0, utils_1.hashPsw)(password));
        return password;
    }
    async demoteUser(account_id) {
        if (!(await this.getModeratorsIds()).includes(account_id)) {
            return "Could not demote someone who is already demoted.";
        }
        await this.db.run(`
            DELETE FROM moderators
            WHERE account_id = ?
            `, account_id);
        return "Demoted sucessfully";
    }
    async hasAuthenticated(accountID) {
        return await this.db.get("SELECT * FROM users WHERE account_id = ?", accountID) !== undefined;
    }
    async registerUser(account) {
        const token = (0, node_crypto_1.randomBytes)(30).toString("hex");
        await this.db.run(`
            INSERT INTO users (account_id, user_id, username, token)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (account_id) DO
            UPDATE SET user_id = ?, username = ?, token = ?
            `, account.accountID, account.userID, account.name, token, account.userID, account.name, token);
        return token;
    }
    async isValidToken(accountID, token) {
        // if we haven't even authenticated yet, the token is invalid
        if (!this.hasAuthenticated(accountID))
            return false;
        const response = await this.db.get(`
            SELECT token FROM users WHERE account_id = ?
            `, accountID);
        if (!response)
            return false;
        const { token: acc_token } = response;
        return token == acc_token;
    }
    async authorizeUser(data, password) {
        if (!(await this.getModeratorsIds()).includes(data.account?.accountID || 0)) {
            return false;
        }
        const { passw: hashedPassw } = await this.db.get("SELECT passw FROM moderators WHERE account_id = ?", data.account?.accountID);
        data.is_authorized = (0, utils_1.hashPsw)(password) === hashedPassw;
        if (data.is_authorized) {
            logging_1.default.log("ADMIN", `user ${data.account?.name} has logged in to the admin panel`);
        }
        return data.is_authorized;
    }
    async getUsers() {
        return await this.db.all("SELECT * FROM users");
    }
    async getModeratorsIds() {
        return (await this.db.all("SELECT account_id FROM moderators")).map(val => val.account_id);
    }
    async getBannedIds() {
        return (await this.db.all("SELECT account_id FROM banned_users")).map(val => val.account_id);
    }
}
exports.DBState = DBState;
