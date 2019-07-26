const assert = require('assert');
const http = require('http');

function findOutHeadersSymbol() {
    const x = new http.OutgoingMessage();
    const s = Object.getOwnPropertySymbols(x);
    const symbol = s.find(sym => typeof sym === 'symbol'
        && sym.toString() === 'Symbol(outHeadersKey)');
    assert(symbol.toString() === 'Symbol(outHeadersKey)');
    return symbol;
}

function monkeyPatchHeaders(options) {
    const keys = Object.keys(options.headers);
    const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);

    const getKey = (name) => {
        const foundHeader = keys.find(header => header.toLowerCase() === name);
        if (foundHeader) {
            return foundHeader;
        }
        return name.toLowerCase();
    };

    if (nodeVersion <= 8.10) {
        return function (name, value) {
            const outHeadersKey = findOutHeadersSymbol();
            let headers = this[outHeadersKey];
            if (headers === null) {
                this[outHeadersKey] = headers = Object.create(null); // eslint-disable-line
            }

            const key = getKey(name);
            headers[key] = [key, value];
        };
    }
    return function (name, value) {
        const outHeadersKey = findOutHeadersSymbol();

        if (!this[outHeadersKey]) this[outHeadersKey] = {};

        const key = getKey(name);
        this[outHeadersKey][key] = [key, value];

            switch (key.length) { //eslint-disable-line
        case 10:
            if (key === 'connection') this._removedConnection = false;
            break;
        case 14:
            if (key === 'content-length') this._removedContLen = false;
            break;
        case 17:
            if (key === 'transfer-encoding') this._removedTE = false;
            break;
        }
    };
}

module.exports = monkeyPatchHeaders;
