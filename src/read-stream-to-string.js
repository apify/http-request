const { decompressStream } = require('iltorb');

/**
 * Flushes the provided stream into a Buffer and transforms
 * it to a String using the provided encoding or utf-8 as default.
 * Got package by default supports br encoded contents only for Node.js 11.7.0 or later.
 *
 * @param {PassThrough} response
 * @param {String} [encoding]
 * @returns {Promise<String>}
 * @ignore
 */
async function readStreamToString(response, encoding) {
    let stream = response;
    const compression = response.headers['content-encoding'];

    if (compression === 'br') {
        stream = decompressBrotli(response);
    }

    return new Promise((resolve, reject) => {
        const chunks = [];
        stream
            .on('data', chunk => chunks.push(chunk))
            .on('error', err => reject(err))
            .on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.toString(encoding));
            });
    });
}

/**
 * Gets decompressed response from
 * If the stream data is compressed, decompresses it using the Content-Encoding header.
 * @param {PassThrough} response
 * @returns {PassThrough|Stream} - Decompressed response
 * @ignore
 */
function decompressBrotli(response) {
    return response.pipe(decompressStream());
}

module.exports = readStreamToString;
