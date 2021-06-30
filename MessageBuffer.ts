'use strict';

export class MessageBuffer {
    static readonly  bbbb:string;
    private delimiter: string = "\n";
    private buffer: string;

    constructor(delimiter: string) {
        this.delimiter = delimiter;
        this.buffer = "";
    }

    isFinished(): boolean {
        if (
            this.buffer.length === 0 ||
            this.buffer.indexOf(this.delimiter) === -1
        ) {
            return true;
        }
        return false;
    }

    push(data: string): void {
        this.buffer += data;
    }

    getMessage(): string | null {
        const delimiterIndex = this.buffer.indexOf(this.delimiter);
        if (delimiterIndex !== -1) {
            const message = this.buffer.slice(0, delimiterIndex);
            this.buffer = this.buffer.replace(message + this.delimiter, "");
            return message;
        }
        return null;
    }

    handleData(): string {
        /**
         * Try to accumulate the buffer with messages
         *
         * If the server isnt sending delimiters for some reason
         * then nothing will ever come back for these requests
         */
        const message = this.getMessage();
        return message;
    }
}