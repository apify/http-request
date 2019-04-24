const log = require('apify-shared/log');

/**
 * The handler this function attaches overcomes a long standing bug in
 * the tunnel-agent NPM package that is used by the Request package internally.
 * The package throws an assertion error in a callback scope that cannot be
 * caught by conventional means and shuts down the running process.
 * @return {function} - listener function
 * @ignore
 */
module.exports = function suppressTunnelAgentAssertError(tunnelAgentExceptionListener) {
    // Only set the handler if it's not already set.
    if (tunnelAgentExceptionListener) return;
    const listener = (err) => {
        try {
            const code = err.code === 'ERR_ASSERTION';
            const name = err.name === 'AssertionError [ERR_ASSERTION]';
            const operator = err.operator === '==';
            const value = err.expected === 0;
            const stack = err.stack.includes('/tunnel-agent/index.js');
            // If this passes, we can be reasonably sure that it's
            // the right error from tunnel-agent.
            if (code && name && operator && value && stack) {
                log.error('utils.requestExtended: Tunnel-Agent assertion error intercepted.');
                return;
            }
        } catch (caughtError) {
            // Catch any exception resulting from the duck-typing
            // check. It only means that the error is not the one
            // we're looking for.
        }
        // Rethrow the original error if it's not a match.
        throw err;
    };

    process.on('uncaughtException', listener);

    return listener;
};
