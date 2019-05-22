/**
 * Extended Error class to handle errors.
 */
class RequestError extends Error {
    /**
     * constructor
     * @param {string} message
     * @param {PassThrough} response
     * @param {number} statusCode
     */
    constructor(message, response, statusCode) {
        super(message);
        this.response = response;
        this.statusCode = statusCode;
    }
}

module.exports = RequestError;
