/**
 * Flushes the provided stream into a Buffer and transforms
 * it to a String using the provided encoding or utf-8 as default.
 *
 * @param {PassThrough} response
 * @param {String} [encoding]
 * @returns {Promise<String>}
 * @ignore
 */
async function readStreamToString(response, encoding) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        response
            .on('data', (chunk) => {
                chunks.push(chunk);
            })
            .on('error', (e) => reject(e))
            .on('end', () => {
                const buffer = Buffer.concat(chunks);
                return resolve(buffer.toString(encoding));
            });
    });
}

module.exports = readStreamToString;
