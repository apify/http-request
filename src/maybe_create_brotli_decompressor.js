/**
 * Gets decompressed response from response if the brotli compression is used.
 * Got package by default supports br encoded contents only for Node.js 11.7.0 or later.
 * @param {Stream} response
 * @param {boolean} useBrotli
 * @returns {PassThrough|Stream} - Decompressed response
 * @ignore
 */
module.exports = function maybeCreateBrotliDecompressor(response, useBrotli) {
    const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);

    if (!useBrotli) {
        return response;
    }

    let decompressor;

    if (nodeVersion >= 10.16) {
        decompressor = require('zlib').createBrotliDecompress(); // eslint-disable-line
    } else {
        try {
            decompressor = require('iltorb').decompressStream; // eslint-disable-line
        } catch (e) {
            throw new Error('You must have iltorb peer dependency installed to use brotli decompression or use NodeJs v10.16.0+');
        }
    }

    return decompressor;
};
