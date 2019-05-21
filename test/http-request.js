const { expect } = require('chai');
const zlib = require('zlib');
const express = require('express');
const bodyParser = require('body-parser');
const { compress } = require('iltorb');
const sinon = require('sinon');
const log = require('apify-shared/log');
const httpRequest = require('../src/index');

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
        app.use(bodyParser());
        app.get('/timeOut', async (req, res) => {
            const timeout = parseInt(req.query.timeout, 10);
            await new Promise(resolve => setTimeout(resolve, timeout));
            res.status(200);
            res.send(CONTENT);
        });

        app.post('/echo', (req, res) => {
            res.setHeader('content-type', req.headers['content-type']);
            console.log(req.body, 'REQUEST BODY');
            res.send(req.body);
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

        app.get('/invalidBody', async (req, res) => {
            const compressed = await compress(Buffer.from(CONTENT, 'utf8'));

            res.setHeader('content-encoding', 'deflate');
            res.status(500);
            res.send(compressed);
        });

        server = await startExpressAppPromise(app, 0);
        port = server.address().port; //eslint-disable-line
    });

    after(() => {
        server.close();
        process.on('uncaughtException', mochaListener);
    });

    it('throws error when decode body is false and parse body is true', async () => {
        const data = {
            url: `http://${HOST}:${port}/gzip`,
            decodeBody: false,
            parseBody: true,

        };
        let error;

        try {
            await httpRequest(data);
        } catch (e) {
            error = e;
        }

        expect(error.message).to.be.eql('If parseBody is set to true the decodeBody must be also true.');
    });

    it('sends payload', async () => {
        const body = {
            TEST: 'TEST',
        };
        const options = {
            url: `http://${HOST}:${port}/echo`,
            payload: JSON.stringify(body),
            method: 'POST',
            parseBody: false,
            decodeBody: true,
            headers: {
                'content-type': 'application/json',
            },
        };
        const response = await httpRequest(options);

        console.log(response, response.body, 'BODY');
        expect(true).to.be.eql(false);
    });

    it('uses proxy (proxyUrl)', async () => {
        expect(true).to.be.eql(false);
    });

    it('has timeout parameter working', async () => {
        const waitTime = 1000;
        const options = {
            url: `http://${HOST}:${port}/timeout?timeout=${waitTime}`,
            timeoutSecs: 0.2,
        };
        let error;
        const start = Date.now();
        try {
            await httpRequest(options);
        } catch (e) {
            error = e;
        }
        const end = Date.now();
        expect((end - start) > waitTime).to.eql(false);
        expect(error.message).to.be.eql('ESOCKETTIMEDOUT');
    });

    it('has valid return value', async () => {
        expect(true).to.be.eql(false);
    });

    it('ignores SSL Errors', async () => {
        expect(true).to.be.eql(false);
    });


    it('passes response to abortFunction and aborts request', async () => {
        let constructorName;
        let aborted = false;
        const data = {
            url: `http://${HOST}:${port}/gzip`,
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
        expect(error.message).to.eql(`Request for ${data.url} aborted due to abortFunction`);
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
