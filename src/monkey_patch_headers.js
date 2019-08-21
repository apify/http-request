const assert = require('assert');
const http = require('http');

/**
 * Function that finds a corresponding Symbol for headers.
 * @param symbolName {String} - Name of the symbol
 * @return {symbol}
 */
function findOutHeadersSymbol(symbolName) {
    const x = new http.OutgoingMessage();
    const s = Object.getOwnPropertySymbols(x);
    const symbol = s.find(sym => typeof sym === 'symbol'
        && sym.toString() === `Symbol(${symbolName})`);
    assert(symbol.toString() === `Symbol(${symbolName})`);

    return symbol;
}

/**
 * Function that overrides native Node.Js headers lower casing.
 * Http headers are by specification compared in case insensitive mode, however browsers sends capitalized headers.
 * This hack is done because we need to have the headers exactly same as in the browser in the `requestAsBrowser`
 * util function from (Apify)[https://www.npmjs.com/package/apify] NPM package
 * @param options
 * @return {Function}
 */
function monkeyPatchHeaders(options) {
    const keys = Object.keys(options.headers);
    const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);
    let symbolName = 'outHeadersKey';

    const getKey = (name) => {
        const foundHeader = keys.find(header => header.toLowerCase() === name);
        if (foundHeader) {
            return foundHeader;
        }
        return name;
    };

    // Node.Js V8 handles the headers in a different way.
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

    if (nodeVersion < 12) {
        // Version 10,9,11 handles the headers in a same way
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
    // for version 12+
    return function (name, value) {
        symbolName = 'kOutHeaders';

        const outHeadersKey = findOutHeadersSymbol(symbolName);
        if (this[outHeadersKey] === null) {
            this[outHeadersKey] = Object.create(null);
        }
        const key = getKey(name);


        this[outHeadersKey][key] = [key, value];
    };
}

module.exports = monkeyPatchHeaders;
