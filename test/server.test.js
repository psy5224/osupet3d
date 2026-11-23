const assert = require('node:assert/strict');
const { PassThrough, Writable } = require('node:stream');
const { deflateSync } = require('node:zlib');
const { after, beforeEach, afterEach, test } = require('node:test');

const originalApiKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;
process.env.OPENAI_API_KEY = 'test-key-no-network';
const { server } = require('../server');
const packageInfo = require('../package.json');

// Real PNG fixtures exercise the output dimensions without paid image generation.
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1kAAAAASUVORK5CYII=';
const image = 'data:image/png;base64,' + pngBase64;

function createPng(width, height) {
  function chunk(type, data) {
    const contents = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of contents) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, contents, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2; // Opaque RGB; zero-filled scanlines make a black fixture.
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const outputBase64 = createPng(2304, 1728).toString('base64');
const outputImage = 'data:image/png;base64,' + outputBase64;
let calls;
let upstream;

class TestResponse extends Writable {
  constructor(resolve, reject) {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.on('error', reject);
    this.on('finish', () => {
      try {
        resolve({
          status: this.statusCode,
          headers: this.headers,
          body: JSON.parse(Buffer.concat(this.chunks).toString('utf8'))
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  writeHead(status, headers) {
    this.statusCode = status;
    this.headers = headers;
    return this;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}

// Dispatch through the actual HTTP router without listening on a local port.
function request(route, { method = 'GET', body, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    const req = new PassThrough();
    Object.assign(req, {
      method,
      url: route,
      headers: payload === undefined ? {} : {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    });
    req.on('error', reject);
    server.emit('request', req, new TestResponse(resolve, reject));
    req.end(payload === undefined ? undefined : Buffer.from(payload));
  });
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key-no-network';
  calls = [];
  upstream = () => Response.json({ data: [{ b64_json: outputBase64 }] });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return upstream(url, options);
  };
});

afterEach(() => { globalThis.fetch = originalFetch; });

after(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
});

test('generates one 2304×1728 PNG using only the uploaded photos and returns its original bytes', async () => {
  const response = await request('/api/generate', {
    method: 'POST', body: { images: [image, image] }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { image: outputImage });
  assert.equal(calls.length, 1, 'one generation must make exactly one paid API request');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits');
  assert.equal(calls[0].options.method, 'POST');
  const form = calls[0].options.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('size'), '2304x1728');
  assert.equal(form.get('quality'), 'high');
  assert.equal(form.get('background'), 'opaque');
  assert.equal(form.get('output_format'), 'png');
  assert.equal(form.get('n'), '1');
  const references = form.getAll('image[]');
  assert.equal(references.length, 2, 'no additional style reference should be sent');
  for (const [index, reference] of references.entries()) {
    assert.equal(reference.name, 'pet-' + (index + 1) + '.png');
    assert.equal(reference.type, 'image/png');
    assert.deepEqual(Buffer.from(await reference.arrayBuffer()), Buffer.from(pngBase64, 'base64'));
  }
});

test('the generation request carries the single-subject black-background wideshot requirements', async () => {
  const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
  assert.equal(response.status, 200);
  const prompt = calls[0].options.body.get('prompt');
  assert.match(prompt, /한 마리/);
  assert.match(prompt, /20\s*[°도]/);
  assert.match(prompt, /4\s*:\s*3/);
  assert.match(prompt, /고정 와이드숏/);
  assert.match(prompt, /프레임 높이의 약 절반/);
  assert.match(prompt, /#000000/);
  assert.match(prompt, /그림자[\s\S]*반사[\s\S]*제외/);
  assert.equal(calls.length, 1);
});

test('accepts both one and the supported maximum of six reference photos', async () => {
  for (const count of [1, 6]) {
    const response = await request('/api/generate', {
      method: 'POST', body: { images: Array(count).fill(image) }
    });
    assert.equal(response.status, 200);
    assert.equal(calls.at(-1).options.body.getAll('image[]').length, count);
  }
  assert.equal(calls.length, 2);
});

test('rejects malformed requests and invalid uploads before contacting the image API', async () => {
  const invalidBodies = [
    null,
    {},
    { images: [] },
    { images: 'not-an-array' },
    { images: Array(7).fill(image) },
    { images: [null] },
    { images: [42] },
    { images: ['https://example.com/photo.png'] },
    { images: ['data:image/gif;base64,R0lGODlh'] },
    { images: ['data:image/png;base64,'] },
    { images: ['data:image/png;base64,!!!'] }
  ];
  for (const body of invalidBodies) {
    const response = await request('/api/generate', { method: 'POST', body });
    assert.equal(response.status, 400, 'invalid body: ' + JSON.stringify(body));
    assert.equal(typeof response.body.error, 'string');
  }
  const malformed = await request('/api/generate', { method: 'POST', rawBody: '{invalid json' });
  assert.equal(malformed.status, 400);
  assert.equal(calls.length, 0);
});

test('reports a missing OpenAI API key without making an upstream request', async () => {
  delete process.env.OPENAI_API_KEY;
  const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /OPENAI_API_KEY/);
  assert.equal(calls.length, 0);
});

test('reports upstream API errors without retrying a potentially paid request', async () => {
  upstream = () => Response.json({ error: { message: 'Image service unavailable' } }, { status: 429 });
  const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
  assert.equal(response.status, 502);
  assert.equal(typeof response.body.error, 'string');
  assert.ok(response.body.error.length > 0);
  assert.equal(calls.length, 1);
  assert.equal(response.body.image, undefined);
});

test('reports network failures without retrying or returning an empty successful image', async () => {
  upstream = () => { throw new Error('Simulated connection failure'); };
  const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
  assert.equal(response.status, 502);
  assert.equal(typeof response.body.error, 'string');
  assert.equal(calls.length, 1);
  assert.equal(response.body.image, undefined);
});

test('rejects upstream success responses with no generated image', async () => {
  for (const body of [{}, { data: [] }, { data: [{}] }, { data: [{ b64_json: '' }] }]) {
    upstream = () => Response.json(body);
    const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
    assert.equal(response.status, 502);
    assert.equal(typeof response.body.error, 'string');
    assert.equal(response.body.image, undefined);
  }
  assert.equal(calls.length, 4, 'failed output validation must not trigger automatic regeneration');
});

test('rejects invalid PNGs and wrong dimensions instead of stretching or regenerating them', async () => {
  const invalidOutputs = [
    Buffer.from('not a PNG').toString('base64'),
    createPng(230, 173).toString('base64'),
    createPng(1728, 2304).toString('base64')
  ];
  for (const b64_json of invalidOutputs) {
    upstream = () => Response.json({ data: [{ b64_json }] });
    const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
    assert.equal(response.status, 502);
    assert.equal(typeof response.body.error, 'string');
    assert.equal(response.body.image, undefined);
  }
  assert.equal(calls.length, invalidOutputs.length);
});

test('serves its own package version without an upstream request', async () => {
  const response = await request('/api/version');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { version: packageInfo.version, updatedAt: packageInfo.appUpdatedAt });
  assert.equal(calls.length, 0);
});

test('3D and remesh routes are absent and cannot start paid jobs', async () => {
  const routes = [
    ['POST', '/api/3d'],
    ['POST', '/api/remesh'],
    ['GET', '/api/3d/test-task'],
    ['GET', '/api/remesh/test-task'],
    ['GET', '/api/3d/test-task/model.glb?download=1'],
    ['GET', '/api/remesh/test-task/model.glb?download=1']
  ];
  for (const [method, route] of routes) {
    const response = await request(route, { method, ...(method === 'POST' ? { body: { image } } : {}) });
    assert.equal(response.status, 404, method + ' ' + route);
  }
  assert.equal(calls.length, 0);
});
