/**
 * Extended Error class to handle errors.
 */
class RequestError extends Error {
    /**
     * constructor
     * @param {string} message
     * @param {PassThrough} response
     * @param {Error} originalError
     */
    constructor(message, response, originalError) {
        super(message);
        this.response = response;
        this.statusCode = response.status;
        this.error = originalError;
    }
}

module.exports = RequestError;
