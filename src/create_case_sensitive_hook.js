/**
 * Overrides got lower-cased headers to case sensitive ones.
 * @param requestOptions {Object} - Got options
 */
module.exports = (requestOptions) => {
    return ({ headers: finalHeaders }) => {
        Object.entries(requestOptions.headers).forEach(([key, value]) => {
            if (finalHeaders[key.toLowerCase()]) {
                delete finalHeaders[key.toLowerCase()];
                finalHeaders[key] = value;
            }
        });
    };
};
