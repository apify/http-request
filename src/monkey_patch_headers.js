const assert = require('assert');
const http = require('http');

function findOutHedersSymbol() {
    const x = new http.OutgoingMessage();
    const s = Object.getOwnPropertySymbols(x);
    assert(typeof s[0] === 'symbol'
        && s[0].toString() === 'Symbol(outHeadersKey)');
    return s[0];
}

function monkeyPatchHeaders(options) {
    const keys = Object.keys(options.headers);

    return function (name, value) {
        const outHeadersKey = findOutHedersSymbol();
        let headers = this[outHeadersKey];
        if (headers === null) {
            this[outHeadersKey] = headers = Object.create(null); // eslint-disable-line
        }

        let key;
        const foundHeader = keys.find(header => header.toLowerCase() === name);
        if (foundHeader) {
            key = foundHeader;
        } else {
            key = name.toLowerCase();
        }
        headers[key] = [key, value];
    };
}

module.exports = monkeyPatchHeaders;
