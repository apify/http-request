const REQUEST_DEFAULT_OPTIONS = {
    maxRedirects: 20,
    followRedirect: true,
    headers: {},
    method: 'GET',
    throwHttpErrors: false,
    abortFunction: null,
    timeoutSecs: 30,
    ignoreSslErrors: false,
    decodeBody: true,
    json: false,
    stream: false,
    useBrotli: false,

};

module.exports = {
    REQUEST_DEFAULT_OPTIONS,
};
