const got = require('got');
const ProxyAgent = require('proxy-agent');

const { PassThrough } = require('stream');
const { readStreamToString } = require('apify-shared/streams_utilities');
const RequestError = require('./request_error');
const decompress = require('./decompress');
const addResponsePropertiesToStream = require('./add_response_properties_to_stream');
const createCaseSensitiveHook = require('./create_case_sensitive_hook');


/**
 * Sends a HTTP request and returns the response.
 * The function has similar functionality and options as the [request](https://www.npmjs.com/package/request) NPM package,
 * but it brings several additional improvements and fixes:
 *
 * - It support not only Gzip compression, but also Brotli and Deflate. To activate this feature,
 *   simply add `Accept-Encoding: gzip, deflate, br` to `options.headers` (or a combination).
 *
 * - Fixes old Gzip decompression see (CheerioCrawler's gzip decompression fails on certain pages)[https://github.com/apifytech/apify-js/issues/266]
 *
 * - Fixes socket handling see (Too many sockets of Ubuntu with 'CLOSE_WAIT')[https://github.com/request/request/issues/2440]
 *
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
 *  class and it should return `true` if request should be aborted, or `false` otherwise.
 *  It won't work if you have the `options.stream` set to true.
 * @param [options.throwHttpErrors=false]
 *  If set to true function throws and error on 4XX and 5XX response codes.
 * @param [options.decodeBody=true]
 *  If set to true decoded body is returned. Cannot be set to false if the [options.parsedBody] is true
 * @param [options.json=false]
 *  If set to true parsed body is returned. And content-type header is set to `application/json`
 *  It won't work if you have the `options.stream` set to true.
 * @param [options.stream=false]
 *  If set to true decompressed stream is returned.
 * @param [options.useBrotli=false]
 *  If set to true you must have the peer dependency `iltorb`
 *  * @param [options.useCaseSensitiveHeaders=false]
 *  If set to true headers will not be lower cased. Experimental feature. Might not work on all versions of Node.Js.
 * @return {Promise<object>} - The response object will typically be a
 * [Node.js HTTP response stream](https://nodejs.org/api/http.html#http_class_http_incomingmessage),
 * however, if returned from the cache it will be a [response-like object](https://github.com/lukechilds/responselike) which behaves in the same way.

 * @name httpRequest
 */

module.exports = async (options) => {
    const {
        url,
        method = 'GET',
        headers = {},
        followRedirect = true,
        maxRedirects = 20,
        throwOnHttpErrors = false,
        abortFunction = null,
        timeoutSecs = 30,
        ignoreSslErrors = false,
        decodeBody = true,
        json = false,
        stream = false,
        useBrotli = false,
        proxyUrl,
        payload,
        useCaseSensitiveHeaders,
        ...possibleGotOptions // Such as cookieJar.
    } = options;

    const requestOptions = {
        ...possibleGotOptions, // Add it first to be overridden in case of conflict.
        url,
        method,
        headers: Object.assign({}, headers, { 'Accept-Encoding': `gzip, deflate${useBrotli ? ', br' : ''}` }),
        followRedirect,
        maxRedirects,
        timeout: timeoutSecs * 1000,
        rejectUnauthorized: !ignoreSslErrors,
        body: payload,
        json,
        throwHttpErrors: false,
        stream: true,
        decompress: false,
        retry: { retries: 0, maxRetryAfter: 0 },
        hooks: {
            beforeRequest: [],
        },
    };

    if (json && !decodeBody) {
        throw new Error('If the "json" parameter is true, "decodeBody" must be also true.');
    }

    if (proxyUrl) {
        const agent = new ProxyAgent(proxyUrl);

        requestOptions.agent = {
            https: agent,
            http: agent,
        };
    }

    if (json) {
        requestOptions.headers = Object.assign({}, requestOptions.headers, { 'Content-Type': 'application/json' });
    }

    if (useCaseSensitiveHeaders) {
        requestOptions.hooks.beforeRequest.push(createCaseSensitiveHook(requestOptions));
    }

    return new Promise((resolve, reject) => {
        const requestStream = got(requestOptions)
            .on('error', err => reject(err))
            .on('response', async (res) => {
                let body;
                let shouldAbort;

                if (throwOnHttpErrors && res.statusCode >= 400) {
                    return reject(
                        new RequestError('Request failed', res),
                    );
                }

                try {
                    shouldAbort = abortFunction && abortFunction(res);
                } catch (e) {
                    requestStream.destroy();
                    res.destroy();
                    return reject(e);
                }

                if (shouldAbort) {
                    requestStream.destroy();
                    res.destroy();

                    return reject(
                        new RequestError(`Request for ${url} aborted due to abortFunction`, res),
                    );
                }
                let decompressedResponse;

                if (decodeBody) {
                    decompressedResponse = decompress(res, useBrotli);
                } else {
                    decompressedResponse = res;
                }

                // Error handler for decompress stream
                decompressedResponse.on('error', error => reject(error));

                if (stream) {
                    // Stream need to piped to PassThrough to stay readable
                    const passThrough = new PassThrough();
                    decompressedResponse.pipe(passThrough);
                    // Add http.IncomingMessage properties to decompress stream.
                    const streamWithResponseAttributes = addResponsePropertiesToStream(passThrough, res);

                    return resolve(streamWithResponseAttributes);
                }

                try {
                    body = await readStreamToString(decompressedResponse);
                } catch (e) {
                    if (e.message === 'incorrect header check') {
                        console.log('Incorrect header check. Try to use different accept-encoding header');
                    }
                    return reject(new RequestError('Could not convert stream to string', decompressedResponse));
                }

                if (json) {
                    try {
                        body = await JSON.parse(body);
                    } catch (e) {
                        return reject(new RequestError('Could not parse the body', decompressedResponse));
                    }
                }

                res.body = body;

                return resolve(res);
            }).resume();
    });
};
