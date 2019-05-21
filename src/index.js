const rqst = require('request');
const contentType = require('content-type');
const util = require('util');
const zlib = require('zlib');
const { decompressStream } = require('iltorb');
const _ = require('underscore');

const suppressTunnelAgentAssertError = require('./supress_tunnel_agent_assert_error');
const { REQUEST_DEFAULT_OPTIONS, TRUNCATED_ERROR_CHARS } = require('./constants');

class RequestError extends Error {
    constructor(message, response, statusCode) {
        super(message);
        this.response = response;
        this.statusCode = statusCode;
    }
}
let tunnelAgentExceptionListener;

/**
 * Gets more info about the error.
 * Errors are often sent as JSON, so attempt to parse them, despite Accept header being set to something different.
 * @param {http.IncomingMessage} response
 * @param {Object} cType
 * @param {String} cType.type
 * @param {String} cType.encoding
 * @returns {Promise<Error>}
 * @ignore
 */
async function getMoreErrorInfo(response, cType) {
    const { type, encoding } = cType;
    const { status } = response;
    let body;
    try {
        body = await readStreamIntoString(response, encoding);
    } catch (err) {
        // Error in reading the body.
        return err;
    }

    if (type === 'application/json') {
        let errorResponse;
        let message;
        try {
            errorResponse = JSON.parse(body);
            message = errorResponse.message; // eslint-disable-line
            if (!message) {
                message = util.inspect(errorResponse, {
                    depth: 1,
                    maxArrayLength: 10,
                });
            }
        } catch (e) {
            message = `${body.substr(0, TRUNCATED_ERROR_CHARS)}...`;
        }

        return new Error(`${status} - ${message}`);
    }
    // It's not a JSON so it's probably some text. Get the first 100 chars of it.
    return new Error(`utils.requestBetter: ${status} - Internal Server Error: ${body.substr(0, TRUNCATED_ERROR_CHARS)}...`);
}

/**
 * Flushes the provided stream into a Buffer and transforms
 * it to a String using the provided encoding or utf-8 as default.
 *
 *
 * @param {http.IncomingMessage} response
 * @param {String} [encoding]
 * @returns {Promise<String>}
 * @ignore
 */
async function readStreamIntoString(response, encoding) { // eslint-disable-line class-methods-use-this
    const stream = decompress(response);

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
 * @param {http.IncomingMessage} response
 * @returns {http.IncomingMessage|Stream} - Decompressed response
 * @ignore
 */
function decompress(response) {
    const compression = response.headers['content-encoding'];
    let stream = response;
    if (compression) {
        let decompressor;
        switch (compression) {
        case 'gzip':
            decompressor = zlib.createGunzip();
            break;
        case 'deflate':
            decompressor = zlib.createInflate();
            break;
        case 'br':
            decompressor = decompressStream();
            break;
        case undefined:
            break;
        default:
            throw new Error(`requestBetter: Invalid Content-Encoding header. Expected gzip, deflate or br, but received: ${compression}`);
        }
        stream = response.pipe(decompressor);
    }
    return stream;
}

/**
 * Sends a HTTP request and returns the response.
 * The function has similar functionality and options as the [request](https://www.npmjs.com/package/request) NPM package,
 * but it brings several additional improvements and fixes:
 *
 * - It support not only Gzip compression, but also Brotli and Deflate. To activate this feature,
 *   simply add `Accept-Encoding: gzip, deflate, br` to `options.headers` (or a combination).
 * - Enables abortion of the request based on the response headers, before the data is downloaded.
 *   See `options.abortFunction` parameter.
 *
 * @param options.url
 *  URL of the target endpoint. Supports both HTTP and HTTPS schemes.
 * @param [options.method=GET]
 *  HTTP method.
 * @param [options.headers={}]
 *  HTTP headers.
 *  Note that the function generates several headers itself, unless
 *  they are defined in the `headers` parameter, in which case the function leaves them untouched.
 *  For example, even if you define `{ 'Content-Length': null }`, the function doesn't define
 *  the 'Content-Length' header and the request will not contain it (due to the `null` value).
 * @param [options.payload]
 *  HTTP payload for PATCH, POST and PUT requests. Must be a `Buffer` or `String`.
 * @param [options.followRedirect=true]
 *  Follow HTTP 3xx responses as redirects (default: true).
 *  OPTIONALLY: This property can also be implemented as function which gets response object as
 *  a single argument and should return `true` if redirects should continue or `false` otherwise.
 * @param [options.maxRedirects=20]
 *  The maximum number of redirects to follow.
 * @param [options.timeoutSecs=30]
 *  Integer containing the number of milliseconds to wait for a server to send
 *  response headers (and start the response body) before aborting the request.
 *  Note that if the underlying TCP connection cannot be established, the OS-wide
 *  TCP connection timeout will overrule the timeout option (the default in Linux can be anywhere from 20-120 seconds).
 * @param [options.proxyUrl]
 *  An HTTP proxy to be used. Supports proxy authentication with Basic Auth.
 * @param [options.ignoreSslErrors=false]
 *  If `true`, requires SSL/TLS certificates to be valid.
 * @param [options.abortFunction=null]
 *  A function that determines whether the request should be aborted. It is called when the server
 *  responds with the HTTP headers, but before the actual data is downloaded.
 *  The function receives a single argument - an instance of Node's
 *  [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
 *  class and it should return `true` if request should be aborted, or `false` otherwise.
 * @param [options.throwOnHttpError=false]
 *  If set to true function throws and error on 4XX and 5XX response codes.
 * @param [options.decodeBody=true]
 *  If set to true decoded body is returned. Cannot be set to false if the [options.parsedBody] is true
 * @param [options.parsedBody=true]
 *  If set to true parsed body is returned
 * @return {http.IncomingMessage}
 * @name httpRequest
 */
module.exports = async (options) => {
    tunnelAgentExceptionListener = suppressTunnelAgentAssertError(tunnelAgentExceptionListener);
    let result;
    try {
        result = await new Promise((resolve, reject) => {
            const opts = _.defaults({}, options, REQUEST_DEFAULT_OPTIONS);

            const {
                url,
                method,
                headers,
                followRedirect,
                maxRedirects,
                throwOnHttpError,
                abortFunction,
                timeoutSecs,
                ignoreSslErrors,
                decodeBody,
                parseBody,
                proxyUrl,
                payload,
            } = opts;

            if (parseBody && !decodeBody) {
                throw new Error('If parseBody is set to true the decodeBody must be also true.');
            }


            const requestOptions = {
                url,
                method: method.toLowerCase(),
                headers,
                followRedirect,
                maxRedirects,
                timeout: timeoutSecs * 1000,
                proxy: proxyUrl,
                strictSSL: !ignoreSslErrors,
                body: payload,
            };
            console.log(headers, 'HEADERS');

            // Using the streaming API of Request to be able to
            const request = rqst(requestOptions);
            request
                .on('error', err => reject(err))
                .on('response', async (res) => {
                    let shouldAbort;

                    try {
                        shouldAbort = abortFunction && abortFunction(res);
                    } catch (e) {
                        reject(e);
                    }

                    if (shouldAbort) {
                        request.abort();
                        res.destroy();

                        return reject(new RequestError(`Request for ${url} aborted due to abortFunction`));
                    }

                    let cType;
                    try {
                        cType = contentType.parse(res);
                    } catch (err) {
                        res.destroy();
                        // No reason to parse the body if the Content-Type header is invalid.
                        console.log(err, res.headers);
                        return reject(new RequestError(`Invalid Content-Type header for URL: ${url}, ${err}`));
                    }

                    const { encoding } = cType;

                    // 5XX and 4XX codes are handled as errors, requests will be retried.
                    const status = res.statusCode;

                    if (status >= 400 && throwOnHttpError) {
                        const error = await getMoreErrorInfo(res, cType);
                        return reject(error);
                    }

                    // Content-Type is fine. Read the body and respond.
                    try {
                        res.body = await readStreamIntoString(res, encoding);
                        resolve(res);
                    } catch (err) {
                        // Error in reading the body.
                        reject(err);
                    }
                });
        });
        process.removeListener('uncaughtException', tunnelAgentExceptionListener);
        tunnelAgentExceptionListener = null;
    } catch (e) {
        process.removeListener('uncaughtException', tunnelAgentExceptionListener);
        tunnelAgentExceptionListener = null;
        throw e;
    }

    return result;
};
