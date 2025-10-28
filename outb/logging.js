"use strict";
//   CREATION ROTATION LOGGING """LIBRARY"""
//   by TechStudent10
Object.defineProperty(exports, "__esModule", { value: true });
var log;
(function (log_1) {
    // https://stackoverflow.com/a/41407246
    let TextColor;
    (function (TextColor) {
        TextColor["White"] = "\u001B[37m";
        TextColor["Red"] = "\u001B[31m";
        TextColor["Green"] = "\u001B[32m";
        TextColor["Yellow"] = "\u001B[33m";
        TextColor["Blue"] = "\u001B[34m";
        TextColor["Magenta"] = "\u001B[35m";
        TextColor["Cyan"] = "\u001B[36m";
        TextColor["RESET"] = "\u001B[0m";
    })(TextColor = log_1.TextColor || (log_1.TextColor = {}));
    function log(level, contents, color) {
        level = level.toUpperCase();
        const timeStr = new Date().toLocaleString();
        const baseStr = `[${timeStr}] [${level}]`.padEnd(32, " ");
        color = color ? color : TextColor.White;
        const actualContents = typeof contents === "string" ?
            contents :
            JSON.stringify(contents, null, 4);
        actualContents.split("\n").forEach((contents) => {
            console.log(`${color}${baseStr} ${contents}${TextColor.RESET}`);
        });
    }
    log_1.log = log;
    function info(contents) {
        log("INFO", contents);
    }
    log_1.info = info;
    function debug(contents) {
        log("DEBUG", contents, TextColor.Cyan);
    }
    log_1.debug = debug;
    function error(contents) {
        log("ERROR", contents, TextColor.Red);
    }
    log_1.error = error;
    function packet(contents) {
        log("PACKET", contents, TextColor.Yellow);
    }
    log_1.packet = packet;
})(log || (log = {}));
exports.default = log;
