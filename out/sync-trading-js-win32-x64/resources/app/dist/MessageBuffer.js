'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageBuffer = void 0;
var MessageBuffer = /** @class */ (function () {
    function MessageBuffer(delimiter) {
        this.delimiter = "\n";
        this.delimiter = delimiter;
        this.buffer = "";
    }
    MessageBuffer.prototype.isFinished = function () {
        if (this.buffer.length === 0 ||
            this.buffer.indexOf(this.delimiter) === -1) {
            return true;
        }
        return false;
    };
    MessageBuffer.prototype.push = function (data) {
        this.buffer += data;
    };
    MessageBuffer.prototype.getMessage = function () {
        var delimiterIndex = this.buffer.indexOf(this.delimiter);
        if (delimiterIndex !== -1) {
            var message = this.buffer.slice(0, delimiterIndex);
            this.buffer = this.buffer.replace(message + this.delimiter, "");
            return message;
        }
        return null;
    };
    MessageBuffer.prototype.handleData = function () {
        /**
         * Try to accumulate the buffer with messages
         *
         * If the server isnt sending delimiters for some reason
         * then nothing will ever come back for these requests
         */
        var message = this.getMessage();
        return message;
    };
    return MessageBuffer;
}());
exports.MessageBuffer = MessageBuffer;
//# sourceMappingURL=MessageBuffer.js.map