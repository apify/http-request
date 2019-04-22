const { expect } = require('chai');
const zlib = require('zlib');
const express = require('express');
const { compress } = require('iltorb');
const sinon = require('sinon');
const httpRequest = require('../src/index');
const log = require("apify-shared/log")

const CONTENT = 'CONTENT';
const HOST = '127.0.0.1';
const ERROR_BODY = 'CUSTOM_ERROR';
const JSON_BODY = {
    message: ERROR_BODY,
};

const startExpressAppPromise = (app, port) => {
    return new Promise((resolve) => {
        const server = app.listen(port, () => resolve(server));
    });
};

describe('httpRequest', () => {
    let mochaListener;
    let port;
    let server;
    before(async () => {
        mochaListener = process.listeners('uncaughtException').shift();
        process.removeListener('uncaughtException', mochaListener);
        const app = express();

        app.get('/406', (req, res) => {
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.status(406);
            res.send(CONTENT);
        });

        app.get('/echo', (req, res) => {
            res.send(CONTENT);
        });

        app.get('/invalidContentType', (req, res) => {
            res.setHeader('content-type', 'application/json');
            res.send(CONTENT);
        });

        app.get('/gzip', (req, res) => {
            zlib.gzip(CONTENT, (error, result) => {
                if (error) throw error;
                res.setHeader('content-encoding', 'gzip');
                res.send(result);
            });
        });

        app.get('/deflate', (req, res) => {
            // return zlib.compress(CONTENT);
            zlib.deflate(CONTENT, (error, result) => {
                if (error) throw error;
                res.setHeader('content-encoding', 'deflate');
                res.send(result);
            });
        });

        app.get('/brotli', async (req, res) => {
            // return zlib.compress(CONTENT);
            const compressed = await compress(Buffer.from(CONTENT, 'utf8'));

            res.setHeader('content-encoding', 'br');
            res.send(compressed);
        });

        app.get('/500', (req, res) => {
            res.status(500);
            res.send(ERROR_BODY);
        });

        app.get('/500/invalidBody', async (req, res) => {
            const compressed = await compress(Buffer.from(CONTENT, 'utf8'));

            res.setHeader('content-encoding', 'deflate');
            res.status(500);
            res.send(compressed);
        });

        app.get('/500/json', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.status(500);
            res.send(JSON.stringify(JSON_BODY));
        });

        app.get('/invalidContentHeader', (req, res) => {
            res.setHeader('Content-Type', 'non-existent-content-type');
            res.send(CONTENT);
        });

        app.get('/invalidBody', async (req, res) => {
            const compressed = await compress(Buffer.from(CONTENT, 'utf8'));

            res.setHeader('content-encoding', 'deflate');
            res.status(500);
            res.send(compressed);
        });

        app.get('/empty', async (req, res) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send();
        });

        server = await startExpressAppPromise(app, 0);
        port = server.address().port; //eslint-disable-line
    });

    after(() => {
        server.close();
        process.on('uncaughtException', mochaListener);
    });

    describe('httpRequest', async () => {
        it('works', async () => {
            const data = {
                url: 'https://api.apify.com/v2/browser-info',
            };
            const response = await httpRequest(data);
            expect(response.statusCode)
                .to
                .eql(200);
        });

        it('passes response to abortFunction and aborts request', async () => {
            let constructorName;
            let aborted = false;
            const data = {
                url: `http://${HOST}:${port}/empty`,
                abortFunction: (response) => {
                    constructorName = response.constructor.name;
                    response.request.on('abort', () => {
                        aborted = true;
                    });
                    return true;
                },

            };

            let error;
            try {
                await httpRequest(data);
            } catch (e) {
                error = e;
            }

            expect(constructorName).to.be.eql('IncomingMessage');
            expect(error.message).to.eql(`utils.requestBetter: Request for ${data.url} aborted due to abortFunction`);
            expect(aborted).to.be.eql(true);
        });

        it('should suppress tunnel-agent errors', async () => {
            const throwNextTick = (err) => {
                process.nextTick(() => {
                    throw err;
                });
            };
            const abortFunction = async () => {
                const err = new Error();
                err.code = 'ERR_ASSERTION';
                err.name = 'AssertionError [ERR_ASSERTION]';
                err.operator = '==';
                err.expected = 0;
                err.stack = ('xxx/tunnel-agent/index.js/yyyy');
                throwNextTick(err);
                // will never resolve
                await new Promise(() => {
                });
            };
            const data = {
                url: `http://${HOST}:${port}/gzip`,
                abortFunction,

            };
            let message;
            const stubbedErrorLog = sinon
                .stub(log, 'error')
                .callsFake(async (msg) => {
                    message = msg;
                });
            let error;
            try {
                await httpRequest(data);
            } catch (e) {
                error = e;
            }

            expect(message).to.be.eql('utils.requestExtended: Tunnel-Agent assertion error intercepted.');
            expect(error).to.exist //eslint-disable-line

            stubbedErrorLog.restore();
        });

        it('it does not aborts request when aborts function returns false', async () => {
            let aborted = false;
            const data = {
                url: `http://${HOST}:${port}/gzip`,
                abortFunction: (response) => {
                    response.on('aborted', () => {
                        aborted = true;
                    });
                    return false;
                },

            };
            await httpRequest(data);
            expect(aborted).to.be.eql(false);
        });

        it('decompress gzip', async () => {
            const options = {
                url: `http://${HOST}:${port}/gzip`,

            };

            const response = await httpRequest(options);
            expect(response.body)
                .to
                .eql(CONTENT);
        });

        it('decompress deflate', async () => {
            const options = {
                url: `http://${HOST}:${port}/deflate`,

            };

            const response = await httpRequest(options);
            expect(response.body)
                .to
                .eql(CONTENT);
        });

        it('decompress brotli', async () => {
            const options = {
                url: `http://${HOST}:${port}/brotli`,

            };

            const response = await httpRequest(options);
            expect(response.body).to.eql(CONTENT);
        });

        it('it does not throw error for 400+ error codes when throwOnHttpError is false', async () => {
            const options = {
                url: `http://${HOST}:${port}/500`,

            };
            let error;
            try {
                await httpRequest(options);
            } catch (e) {
                error = e;
            }
            expect(error).to.be.undefined; // eslint-disable-line
        });

        it('it does not throw error for 400+ error codes when throwOnHttpError is true', async () => {
            const options = {
                url: `http://${HOST}:${port}/500`,
                throwOnHttpError: true,

            };
            let error;
            try {
                await httpRequest(options);
            } catch (e) {
                error = e;
            }
            expect(error.message).to.exist; // eslint-disable-line
            expect(error.message.includes(ERROR_BODY)).to.be.eql(true);
        });

        it('it throws error when the body cannot be parsed and the code is 500 when throwOnHttpError is true', async () => {
            const options = {
                url: `http://${HOST}:${port}/500/invalidBody`,
                throwOnHttpError: true,

            };
            let error;
            try {
                await httpRequest(options);
            } catch (e) {
                error = e;
            }
            expect(error.message).to.exist; // eslint-disable-line
        });

        it('it throws error when the body cannot be parsed', async () => {
            const options = {
                url: `http://${HOST}:${port}/invalidBody`,

            };
            let error;
            try {
                await httpRequest(options);
            } catch (e) {
                error = e;
            }
            expect(error.message).to.exist; // eslint-disable-line
        });

        it('it returns json when 500 even if content-type is different, throwOnHttpError is true ', async () => {
            const options = {
                url: `http://${HOST}:${port}/500/json`,
                throwOnHttpError: true,

            };
            let error;
            try {
                await httpRequest(options);
            } catch (e) {
                error = e;
            }
            expect(error.message).to.exist; // eslint-disable-line
            expect(error.message.includes(JSON_BODY.message)).to.be.eql(true);
        });
    });
});
