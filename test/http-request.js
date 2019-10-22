const { expect } = require('chai');
const zlib = require('zlib');
const express = require('express');
const bodyParser = require('body-parser');
const FormData = require('form-data');
const { compress } = require('iltorb');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const upload = multer();

const { readStreamToString } = require('apify-shared/streams_utilities');
const httpRequest = require('../src/index');

const CONTENT = 'CONTENT';
const HOST = '127.0.0.1';
const ERROR_BODY = 'CUSTOM_ERROR';

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
        const file = fs.createWriteStream('./bigFile.txt');

        for (let i = 0; i <= 1e6; i++) {
            file.write('Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n'); //eslint-disable-line
        }
        file.end();

        const app = express();
        app.use(bodyParser.urlencoded({
            extended: true,
        }));
        app.use(bodyParser.json());

        app.get('/timeOut', async (req, res) => {
            const timeout = parseInt(req.query.timeout, 10);
            await new Promise(resolve => setTimeout(resolve, timeout));
            res.status(200);
            res.send(CONTENT);
        });

        app.get('/invalidJson', (req, res) => {
            res.status(200);
            res.setHeader('content-type', req.headers['content-type']);
            res.send('["test" : 123]');
        });

        app.get('/proxy2', async (req, res) => {
            const ip = req.connection.remoteAddress;
            res.status(200);
            res.send(ip);
        });

        app.post('/echo', (req, res) => {
            res.setHeader('content-type', req.headers['content-type']);
            res.send(req.body);
        });

        app.post('/multipart', upload.single('file'), (req, res) => {
            res.send(req.file);
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

        app.get('/deflate-raw', (req, res) => {
            // return zlib.compress(CONTENT);
            zlib.deflateRaw(CONTENT, (error, result) => {
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

        app.get('/invalidBody', async (req, res) => {
            const compressed = await compress(Buffer.from('{', 'utf8'));

            res.setHeader('content-encoding', 'deflate');
            res.status(500);
            res.send(compressed);
        });

        app.get('/rawHeaders', (req, res) => {
            res.send(JSON.stringify(req.rawHeaders));
        });

        app.get('/bigFile', (req, res) => {
            const src = fs.createReadStream('./bigFile.txt');
            src.pipe(res);
        });

        server = await startExpressAppPromise(app, 0);
        port = server.address().port; //eslint-disable-line
    });

    after(() => {
        server.close();
        process.on('uncaughtException', mochaListener);
        fs.unlinkSync('./bigFile.txt');
    });

    it('Test multipart/form-data format support.', async () => { // multipart/form-data
        const fileName = 'http-request.js';
        const filePath = path.join(__dirname, fileName);
        const form = new FormData();

        form.append('field2', 'my value');
        form.append('file', fs.createReadStream(filePath));

        const opts = {
            url: `http://${HOST}:${port}/multipart`,
            method: 'POST',
            payload: form,

        };
        const response = await httpRequest(opts);
        const body = JSON.parse(response.body);
        expect(response.statusCode).to.be.eql(200);
        expect(body.mimetype).to.be.eql('application/javascript');
        expect(body.fieldname).to.be.eql('file');
    });

    it('throws error when decode body is false and parse body is true', async () => {
        const data = {
            url: `http://${HOST}:${port}/gzip`,
            decodeBody: false,
            json: true,

        };
        let error;

        try {
            await httpRequest(data);
        } catch (e) {
            error = e;
        }

        expect(error.message).to.be.eql('If the "json" parameter is true, "decodeBody" must be also true.');
    });


    it('sends payload', async () => {
        const payload = JSON.stringify({
            TEST: 'TEST',
        });
        const options = {
            url: `http://${HOST}:${port}/echo`,
            payload,
            method: 'POST',
            parseBody: false,
            decodeBody: true,
            useCaseSensitiveHeaders: false,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        const response = await httpRequest(options);

        expect(response.body).to.be.eql(payload);
    });

    it('uses proxy (proxyUrl)', async () => {
        const proxy = 'http://groups-SHADER,session-airbnb_44042475:rgC8JJ8NcrDnDdwsxDqWz7jKS@proxy.apify.com:8000';
        const { body } = await httpRequest({ url: 'https://api.apify.com/v2/browser-info', json: true });
        const { body: proxyBody } = await httpRequest({ url: 'https://api.apify.com/v2/browser-info', proxyUrl: proxy, json: true });
        expect(body.clientIp).to.be.not.eql(proxyBody.clientIp);
    });

    it('decompress deflateRaw when content-encoding is deflate', async () => {
        const { body } = await httpRequest({ url: `http://${HOST}:${port}/deflate-raw` });
        expect(body).to.be.eql(CONTENT);
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
        expect(error.message.includes("Timeout awaiting 'request'")).to.be.eql(true);
    });

    it('has valid return value', async () => {
        const response = await httpRequest({ url: `http://${HOST}:${port}/echo`, parseBody: false });
        expect(response).to.have.property('body');
        expect(response).to.have.property('statusCode');
        expect(response).to.have.property('headers');
        expect(response).to.have.property('request');
    });

    it('catches SSL Errors', async () => {
        let error;
        try {
            await httpRequest({ url: 'https://self-signed.badssl.com/', ignoreSslErrors: false });
        } catch (e) {
            error = e;
        }
        expect(error).to.not.be.undefined; // eslint-disable-line
    });

    it('ignores SSL Errors', async () => {
        let error;
        try {
            await httpRequest({ url: 'https://self-signed.badssl.com/', ignoreSslErrors: true });
        } catch (e) {
            error = e;
        }
        expect(error).to.be.undefined; // eslint-disable-line
    });


    it('passes response to abortFunction', async () => {
        let constructorName;
        const data = {
            url: `http://${HOST}:${port}/gzip`,
            abortFunction: (response) => {
                constructorName = response.constructor.name;
                return false;
            },

        };

        await httpRequest(data);

        expect(constructorName).to.be.eql('Transform');
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

    it('it aborts request', async () => {
        const data = {
            url: `http://${HOST}:${port}/gzip`,
            abortFunction: () => {
                return true;
            },

        };

        let error;

        try {
            await httpRequest(data);
        } catch (e) {
            error = e;
        }

        expect(error.message).to.be.eql(`Request for ${data.url} aborted due to abortFunction`);
    });

    it('decompress gzip', async () => {
        const options = {
            url: `http://${HOST}:${port}/gzip`,
            parseBody: false,

        };

        const response = await httpRequest(options);
        expect(response.body)
            .to
            .eql(CONTENT);
    });

    it('decompress deflate', async () => {
        const options = {
            url: `http://${HOST}:${port}/deflate`,
            parseBody: false,

        };

        const response = await httpRequest(options);
        expect(response.body)
            .to
            .eql(CONTENT);
    });

    it('decompress brotli', async () => {
        const options = {
            url: `http://${HOST}:${port}/brotli`,
            parseBody: false,
            useBrotli: true,

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

    it('it does throw error for 400+ error codes when throwOnHttpErrors is true', async () => {
        const options = {
            url: `http://${HOST}:${port}/500`,
            throwOnHttpErrors: true,

        };
        let error;

        try {
            await httpRequest(options);
        } catch (e) {
            error = e;
        }

        expect(error.message).to.exist; // eslint-disable-line
    });

    it('it throws error when the body cannot be parsed and the code is 500 when throwOnHttpErrors is true', async () => {
        const options = {
            url: `http://${HOST}:${port}/500/invalidBody`,
            throwOnHttpErrors: true,

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
            json: true,

        };
        let error;
        try {
            await httpRequest(options);
        } catch (e) {
            error = e;
        }
            expect(error.message).to.exist; // eslint-disable-line
    });

    it('it returns stream when stream is set to true', async () => {
        const options = {
            url: `http://${HOST}:${port}/gzip`,
            stream: true,

        };
        const stream = await httpRequest(options);

        // check for response properties.
        expect(stream.statusCode).to.equal(200);
        expect(stream.headers).to.exist; //eslint-disable-line
        expect(stream.complete).exist; //eslint-disable-line
        expect(stream.httpVersion).to.eql('1.1');
        expect(stream.rawHeaders).to.exist; //eslint-disable-line
        expect(stream.rawTrailers).to.exist; //eslint-disable-line
        expect(stream.socket).to.exist; //eslint-disable-line
        expect(stream.statusMessage).to.eql('OK');
        expect(stream.trailers).to.exist; //eslint-disable-line
        expect(stream.url).to.exist; //eslint-disable-line
        expect(stream.request).to.exist; //eslint-disable-line
        expect(stream.request.gotOptions).to.exist; //eslint-disable-line
        expect(stream.request.gotOptions).to.exist; //eslint-disable-line

        const content = await readStreamToString(stream);
        expect(content).to.eql(CONTENT);
        expect(stream.constructor.name).to.be.not.eql('Promise');
    });

    it('it catches errors from abort functions and rejects the promise with the same error', async () => {
        const error = new Error('Custom error');
        const options = {
            url: `http://${HOST}:${port}/gzip`,
            stream: false,
            abortFunction: () => {
                throw error;
            },

        };
        let rejectedError;
        try {
            await httpRequest(options);
        } catch (e) {
            rejectedError = e;
        }
        expect(rejectedError.message).to.be.eql(error.message);
    });

    it('it rethrows error if the json body cannot be parsed', async () => {
        const options = {
            url: `http://${HOST}:${port}/invalidJson`,
            json: true,

        };
        let rejectedError;
        try {
            await httpRequest(options);
        } catch (e) {
            rejectedError = e;
        }
        expect(rejectedError.message).to.be.eql('Could not parse the body');
    });

    it('headers work as expected', async () => {
        const options = {
            url: `http://${HOST}:${port}/rawHeaders`,
            json: true,
            useCaseSensitiveHeaders: true,
            headers: {
                'User-Agent': 'Test',
                Host: HOST,
            },

        };
        const { body } = await httpRequest(options);

        expect(body.includes('Host')).to.be.eql(true);
        expect(body.includes('User-Agent')).to.be.eql(true);

        options.useCaseSensitiveHeaders = false;
        const { body: body2 } = await httpRequest(options);

        expect(body2.includes('Host')).to.be.eql(false);
        expect(body2.includes('User-Agent')).to.be.eql(false);
    });

    it('headers should have uniqueValues with useCaseSensitive headers', async () => {
        const options = {
            url: `http://${HOST}:${port}/rawHeaders`,
            json: true,
            useCaseSensitiveHeaders: true,
            headers: {
                'User-Agent': 'Test',
                Host: HOST,
                host: HOST,
                'user-agent': 'TEST',
            },

        };
        const { body } = await httpRequest(options);

        expect(body.includes('Host')).to.be.eql(true);
        expect(body.includes('User-Agent')).to.be.eql(true);
        expect(body.includes('user-agent')).to.be.eql(false);
        expect(body.includes('host')).to.be.eql(false);
    });

    it('gets rejected with error thrown from abort function ', async () => {
        class MyError extends Error {

        }
        const testError = new MyError('TEST');

        const options = {
            url: `http://${HOST}:${port}/rawHeaders`,
            abortFunction: () => {
                throw testError;
            },
        };
        let error;
        try {
            await httpRequest(options);
        } catch (e) {
            error = e;
        }

        expect(error.message).to.be.eql(testError.message);
        expect(error instanceof MyError).to.be.eql(true);
    });

    it('can read a large response using stream API', async () => {
        const options = {
            url: `http://${HOST}:${port}/bigFile`,
            stream: true,
        };
        const response = await httpRequest(options);

        const body = await readStreamToString(response);
        expect(body).to.exist; // eslint-disable-line
    });

    it('can read a large response using promise API', async () => {
        const options = {
            url: `http://${HOST}:${port}/bigFile`,
            stream: false,
        };
        const response = await httpRequest(options);

        expect(response.body).to.exist; // eslint-disable-line
    });
});
