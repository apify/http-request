const { decompressStream } = require('iltorb');

/**
 * Gets decompressed response from response if the brotli compression is used.
 * Got package by default supports br encoded contents only for Node.js 11.7.0 or later.
 * @param {PassThrough} response
 * @returns {PassThrough|Stream} - Decompressed response
 * @ignore
 */
module.exports = function maybeDecompressBrotli(response) {
    const compression = response.headers['content-encoding'];

    if (compression !== 'br') {
        return response;
    }

    return response.pipe(decompressStream());
};
