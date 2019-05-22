const got = require('got');
const _ = require('underscore');
const ProxyAgent = require('proxy-agent');

const RequestError = require('./request-error');
const readStreamToString = require('./read-stream-to-string');
const { REQUEST_DEFAULT_OPTIONS } = require('./constants');

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
 * @param [options.stream=false]
 *  If set to true parsed body is returned
 * @return {http.IncomingMessage}
 * @name httpRequest
 */
module.exports = async (options) => {
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
        stream,
    } = opts;

    const requestOptions = {
        url,
        method,
        headers,
        followRedirect,
        maxRedirects,
        timeout: timeoutSecs * 1000,
        rejectUnauthorized: ignoreSslErrors,
        body: payload,
        json: parseBody,
        decodeBody: true,
    };

    if (parseBody && !decodeBody) {
        throw new Error('If parseBody is set to true the decodeBody must be also true.');
    }

    if (proxyUrl) {
        const agent = new ProxyAgent(proxyUrl);

        requestOptions.agent = agent;
    }

    if (stream) {
        return got.stream(requestOptions);
    }


    return new Promise((resolve, reject) => {
        const requestStream = got.stream(requestOptions)
            .on('error', err => reject(err))
            .on('response', async (res) => {
                let shouldAbort;

                try {
                    shouldAbort = abortFunction && abortFunction(res);
                } catch (e) {
                    reject(e);
                }

                if (shouldAbort) {
                    requestStream.destroy();
                    res.destroy();

                    return reject(
                        new RequestError(`Request for ${url} aborted due to abortFunction`, res, res.status),
                    );
                }
                try {
                    res.body = await readStreamToString(res);
                } catch (e) {
                    reject(e);
                }
                resolve(res);
            });
    });
};
