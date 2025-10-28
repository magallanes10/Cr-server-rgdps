"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
const logging_1 = __importDefault(require("./logging"));
class ErrorHandler {
    constructor(state) {
        this.webhookUrl = state.serverConfig.webhookUrl || "";
        this.serverState = state;
    }
    notifyError(err) {
        logging_1.default.error(err.stack);
        if (this.webhookUrl == "")
            return;
        fetch(this.webhookUrl, {
            method: "POST",
            body: JSON.stringify({
                embeds: [
                    {
                        title: `gg server error! (\`${err.name}\`, \`${err.message}\`)`,
                        description: `\`\`\`javascript\n${err.stack}\`\`\`` || "no stack found"
                    }
                ]
            }),
            headers: {
                "Content-Type": "application/json"
            }
        })
            .then(() => logging_1.default.info("sent webhook"))
            .catch((reason) => logging_1.default.error(`webhook not sent. reason: ${reason}`));
    }
    registerListeners() {
        const exitServ = () => {
            logging_1.default.info("gracefully exitting server");
            process.exit();
        };
        // todo: make exit finish all swaps
        process.on('uncaughtException', (err) => {
            this.notifyError(err);
        });
        process.on("SIGINT", () => {
            logging_1.default.info("got Control+C");
            exitServ();
        });
        process.on("SIGTERM", () => {
            logging_1.default.info("Process killed");
            exitServ();
        });
        process.on("SIGHUP", () => {
            logging_1.default.info("Process killed");
            exitServ();
        });
        process.on("SIGBREAK", () => {
            logging_1.default.info("Process killed");
            exitServ();
        });
        logging_1.default.info("error handlers registered");
    }
}
exports.ErrorHandler = ErrorHandler;
