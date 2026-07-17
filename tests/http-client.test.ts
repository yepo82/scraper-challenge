import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpClient, HttpRequestError, upgradeInsecureRedirectProtocol } from '../src/http/http-client.js';

let server: http.Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

function listen(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve, reject) => {
    server = http.createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

describe('HttpClient', () => {
  it('resolves GET requests with matching data and status', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello world');
    });

    const client = new HttpClient({
      baseUrl,
      timeoutMs: 5000,
      maxRetries: 2,
      baseDelayMs: 10,
      maxBackoffMs: 100,
      minTimeBetweenRequestsMs: 0,
    });

    const response = await client.get('/greeting');

    expect(response.status).toBe(200);
    expect(response.data).toBe('hello world');
  });

  it('POSTs a plain object as application/x-www-form-urlencoded', async () => {
    let receivedContentType: string | undefined;
    let receivedBody: string | undefined;

    const baseUrl = await listen((req, res) => {
      receivedContentType = req.headers['content-type'];
      readBody(req)
        .then((body) => {
          receivedBody = body;
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
    });

    const client = new HttpClient({
      baseUrl,
      timeoutMs: 5000,
      maxRetries: 2,
      baseDelayMs: 10,
      maxBackoffMs: 100,
      minTimeBetweenRequestsMs: 0,
    });

    const response = await client.post('/submit', { foo: 'bar' });

    expect(response.status).toBe(200);
    expect(receivedContentType).toBe('application/x-www-form-urlencoded');
    expect(receivedBody).toBe('foo=bar');
  });

  it('retries a 429 response with backoff then resolves with the eventual success', async () => {
    let requestCount = 0;

    const baseUrl = await listen((req, res) => {
      requestCount += 1;
      if (requestCount <= 2) {
        res.writeHead(429, { 'Content-Type': 'text/plain' });
        res.end('too many requests');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('finally ok');
    });

    const client = new HttpClient({
      baseUrl,
      timeoutMs: 5000,
      maxRetries: 5,
      baseDelayMs: 10,
      maxBackoffMs: 100,
      minTimeBetweenRequestsMs: 0,
    });

    const response = await client.get('/flaky');

    expect(response.status).toBe(200);
    expect(response.data).toBe('finally ok');
    expect(requestCount).toBe(3);
  });

  it('throws a controlled HttpRequestError when retries are exhausted', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('server error');
    });

    const client = new HttpClient({
      baseUrl,
      timeoutMs: 5000,
      maxRetries: 2,
      baseDelayMs: 10,
      maxBackoffMs: 50,
      minTimeBetweenRequestsMs: 0,
    });

    await expect(client.get('/always-fails')).rejects.toThrow(HttpRequestError);

    try {
      await client.get('/always-fails');
      throw new Error('expected client.get to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpRequestError);
      const httpError = error as HttpRequestError;
      expect(httpError.status).toBe(500);
      expect(httpError.attempts).toBeGreaterThan(0);
    }
  });

  it('fails immediately on a non-retryable 404 without retrying', async () => {
    let requestCount = 0;

    const baseUrl = await listen((req, res) => {
      requestCount += 1;
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    });

    const client = new HttpClient({
      baseUrl,
      timeoutMs: 5000,
      maxRetries: 5,
      baseDelayMs: 10,
      maxBackoffMs: 100,
      minTimeBetweenRequestsMs: 0,
    });

    await expect(client.get('/missing')).rejects.toThrow(HttpRequestError);
    expect(requestCount).toBe(1);
  });

  it('persists cookies across requests on the same client instance', async () => {
    let secondRequestCookieHeader: string | undefined;
    let requestCount = 0;

    const baseUrl = await listen((req, res) => {
      requestCount += 1;
      if (requestCount === 1) {
        res.writeHead(200, { 'Set-Cookie': 'session=abc123', 'Content-Type': 'text/plain' });
        res.end('first');
        return;
      }
      secondRequestCookieHeader = req.headers.cookie;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('second');
    });

    const client = new HttpClient({
      baseUrl,
      timeoutMs: 5000,
      maxRetries: 2,
      baseDelayMs: 10,
      maxBackoffMs: 100,
      minTimeBetweenRequestsMs: 0,
    });

    await client.get('/set-cookie');
    await client.get('/check-cookie');

    expect(secondRequestCookieHeader).toBe('session=abc123');
  });

  it('follows a 302 redirect transparently and carries the Set-Cookie from the first hop to the redirect target', async () => {
    let redirectTargetCookieHeader: string | undefined;

    const baseUrl = await listen((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, {
          'Set-Cookie': 'jsessionid=redirect-test-session',
          Location: '/resultado',
        });
        res.end();
        return;
      }
      if (req.url === '/resultado') {
        redirectTargetCookieHeader = req.headers.cookie;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('landed on resultado');
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const client = new HttpClient({
      baseUrl,
      timeoutMs: 5000,
      maxRetries: 2,
      baseDelayMs: 10,
      maxBackoffMs: 100,
      minTimeBetweenRequestsMs: 0,
    });

    const response = await client.get('/start');

    expect(response.status).toBe(200);
    expect(response.data).toBe('landed on resultado');
    expect(redirectTargetCookieHeader).toBe('jsessionid=redirect-test-session');
  });

  it('download() returns the exact bytes received from the server', async () => {
    const expectedBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]);

    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(expectedBytes);
    });

    const client = new HttpClient({
      baseUrl,
      timeoutMs: 5000,
      maxRetries: 2,
      baseDelayMs: 10,
      maxBackoffMs: 100,
      minTimeBetweenRequestsMs: 0,
    });

    const buffer = await client.download('/file.pdf');

    expect(Buffer.compare(buffer, expectedBytes)).toBe(0);
  });
});

describe('upgradeInsecureRedirectProtocol', () => {
  // Hallazgo empírico contra el sitio real (Fase 5): el Location de la redirección 302 tras el
  // POST de búsqueda usa http:// (quirk del servidor/proxy real), pero el origin real solo
  // acepta HTTPS -- el puerto 80 devuelve connection-refused. axios/follow-redirects NO hace
  // este upgrade solo: hay que forzarlo vía el hook beforeRedirect de la config de axios.
  // El upgrade solo se aplica cuando la petición ORIGINAL ya era https: forzar siempre a https
  // rompería sitios legítimamente http-only (incluido el test de redirect+cookie de este mismo
  // archivo, que corre contra un server de prueba en http plano); limitarlo a "nunca degradar
  // una petición que empezó segura" es la política correcta y de alcance acotado.
  it('rewrites the protocol to https: and clears the port when the originating request was https', () => {
    const options: { protocol?: string; port?: string | number } = { protocol: 'http:', port: 80 };

    upgradeInsecureRedirectProtocol(options, undefined, { url: 'https://jurisprudencia.pj.gob.pe/x' });

    expect(options.protocol).toBe('https:');
    expect(options.port).toBe('');
  });

  it('leaves the redirect target untouched when the originating request was already http', () => {
    const options: { protocol?: string; port?: string | number } = { protocol: 'http:', port: 80 };

    upgradeInsecureRedirectProtocol(options, undefined, { url: 'http://127.0.0.1:1234/x' });

    expect(options.protocol).toBe('http:');
    expect(options.port).toBe(80);
  });

  it('leaves an already-https redirect target untouched', () => {
    const options: { protocol?: string; port?: string | number } = { protocol: 'https:', port: 443 };

    upgradeInsecureRedirectProtocol(options, undefined, { url: 'https://jurisprudencia.pj.gob.pe/x' });

    expect(options.protocol).toBe('https:');
    expect(options.port).toBe(443);
  });

  it('leaves options without a protocol field untouched and does not throw when requestDetails is missing', () => {
    const options: { protocol?: string; port?: string | number } = {};

    expect(() => upgradeInsecureRedirectProtocol(options)).not.toThrow();
    expect(options.protocol).toBeUndefined();
  });
});
