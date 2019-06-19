/**
 * Gets decompressed response from response if the brotli compression is used.
 * Got package by default supports br encoded contents only for Node.js 11.7.0 or later.
 * @param {PassThrough} response
 * @param {boolean} useBrotli
 * @returns {PassThrough|Stream} - Decompressed response
 * @ignore
 */
module.exports = function maybeDecompressBrotli(response, useBrotli) {
    const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);

    const compression = response.headers['content-encoding'];

    if (compression !== 'br' || !useBrotli || nodeVersion >= 12) {
        return response;
    }

    let decompressFunction;
    try {
            decompressFunction = require('iltorb').decompressStream; // eslint-disable-line
    } catch (e) {
        throw new Error('You must have iltorb peer dependency installed to use brotli decompression');
    }

    return response.pipe(decompressFunction());
};
