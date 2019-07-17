const zlib = require('zlib');

const inflate = require('./inflate');

/**
 * Decompress function handling br, deflate, gzip compressions
 * Functions checks if you have "iltorb" peer dependency installed in case of Node.js version older than 12.
 * If node version 12+ is installed function uses Node.js brotli decompress function, otherwise "iltorb" is used
 * @param response {Stream} - Node.js response stream
 * @param useBrotli {boolean} - if true brotli decompression  is enabled
 * @return {Stream} - in case of know compression decompressed stream is returner otherwise raw stream is returned
 */

function decompress(response, useBrotli) {
    const compression = response.headers['content-encoding'] || 'identity';
    const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);

    let decompressor;

    switch (compression) {
    case 'br':
        if (!useBrotli) {
            return response;
        }

        if (nodeVersion >= 12) {
                decompressor = require('zlib').createBrotliDecompress(); // eslint-disable-line
        } else {
            try {
                    decompressor = require('iltorb').decompressStream(); // eslint-disable-line
            } catch (e) {
                throw new Error('You must have the "iltorb" peer dependency installed to use brotli decompression or use Node.js 12 or later');
            }
        }
        break;
    case 'deflate':
        decompressor = inflate.createInflate();
        break;
    case 'gzip':
        decompressor = zlib.createGunzip();
        break;
    case 'identity':
        return response;
    default:
        throw new Error(`Invalid Content-Encoding header. Expected gzip, deflate or br, but received: ${compression}`);
    }

    return response.pipe(decompressor);
}

module.exports = decompress;
