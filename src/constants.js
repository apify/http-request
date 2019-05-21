const REQUEST_DEFAULT_OPTIONS = {
    maxRedirects: 20,
    followRedirect: true,
    headers: {},
    method: 'GET',
    throwOnHttpError: false,
    abortFunction: null,
    timeoutSecs: 30,
    ignoreSslErrors: false,
    decodeBody: true,
    parseBody: true,
    stream: false,

};

const TRUNCATED_ERROR_CHARS = 100;


module.exports = {
    REQUEST_DEFAULT_OPTIONS,
    TRUNCATED_ERROR_CHARS,
};
