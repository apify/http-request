const zlib = require('zlib');

const inflate = require('./inflate');

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
                throw new Error('You must have iltorb peer dependency installed to use brotli decompression or use NodeJs v12+');
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
