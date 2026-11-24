const assert = require('node:assert/strict');
const { PassThrough, Writable } = require('node:stream');
const { PNG } = require('pngjs');
const { after, beforeEach, afterEach, test } = require('node:test');

const originalApiKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;
process.env.OPENAI_API_KEY = 'test-key-no-network';
const { server } = require('../server');
const packageInfo = require('../package.json');

// Real PNG fixtures exercise the output dimensions without paid image generation.
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1kAAAAASUVORK5CYII=';
const image = 'data:image/png;base64,' + pngBase64;

function createPng(width, height, { opaque = false, colorType = 6, pixels = [] } = {}) {
  const png = new PNG({ width, height });
  png.data.fill(0);
  if (opaque) {
    for (let offset = 3; offset < png.data.length; offset += 4) png.data[offset] = 255;
  }
  for (const { x, y, rgba } of pixels) {
    png.data.set(rgba, (y * width + x) * 4);
  }
  return PNG.sync.write(png, { colorType });
}

const fixturePixels = [
  { x: 1152, y: 864, rgba: [0, 0, 0, 255], expected: [0, 0, 0, 255] },
  { x: 1153, y: 864, rgba: [97, 58, 23, 255], expected: [97, 58, 23, 255] },
  { x: 1154, y: 864, rgba: [12, 34, 230, 255], expected: [12, 34, 230, 255] },
  { x: 1155, y: 864, rgba: [200, 100, 50, 128], expected: [100, 138, 57, 255] },
  { x: 1156, y: 864, rgba: [0, 0, 0, 64], expected: [0, 133, 48, 255] },
  // RGB values underneath zero alpha must not leak into the final background.
  { x: 0, y: 0, rgba: [255, 10, 200, 0], expected: [0, 177, 64, 255] }
];
const outputBase64 = createPng(2304, 1728, { pixels: fixturePixels }).toString('base64');

function decodedOutput(body) {
  assert.match(body.image, /^data:image\/png;base64,/);
  return PNG.sync.read(Buffer.from(body.image.split(',')[1], 'base64'));
}

function pixelAt(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return Array.from(png.data.subarray(offset, offset + 4));
}

function foregroundFixture({ left, top, width, height }) {
  const png = new PNG({ width: 2304, height: 1728 });
  png.data.fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let rgba = [97, 58, 23, 255];
      if (x < 12 || y < 12 || x >= width - 12 || y >= height - 12) {
        rgba = [200, 100, 50, 128];
      } else if (y > height * 0.35 && y < height * 0.65) {
        if (x > width * 0.2 && x < width * 0.4) rgba = [0, 0, 0, 255];
        if (x > width * 0.6 && x < width * 0.8) rgba = [12, 34, 230, 255];
      }
      png.data.set(rgba, ((top + y) * png.width + left + x) * 4);
    }
  }
  return PNG.sync.write(png).toString('base64');
}

function foregroundBounds(png) {
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      assert.equal(png.data[offset + 3], 255, 'the whole output must stay opaque');
      if (png.data[offset] === 0 && png.data[offset + 1] === 177 && png.data[offset + 2] === 64) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

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

test('uses one image API call and composites a 2304×1728 opaque PNG onto exact #00B140', async () => {
  const response = await request('/api/generate', {
    method: 'POST', body: { images: [image, image] }
  });

  assert.equal(response.status, 200, response.body.error);
  const output = decodedOutput(response.body);
  assert.equal(output.width, 2304);
  assert.equal(output.height, 1728);
  for (const { x, y, expected } of fixturePixels) {
    assert.deepEqual(pixelAt(output, x, y), expected, 'composited pixel at ' + x + ',' + y);
  }
  const subjectOffsets = new Set(fixturePixels.map(({ x, y }) => (y * output.width + x) * 4));
  for (let offset = 0; offset < output.data.length; offset += 4) {
    assert.equal(output.data[offset + 3], 255, 'the downloadable PNG must be fully opaque');
    if (!subjectOffsets.has(offset)) {
      assert.equal(output.data[offset], 0);
      assert.equal(output.data[offset + 1], 177);
      assert.equal(output.data[offset + 2], 64);
    }
  }
  assert.equal(calls.length, 1, 'one generation must make exactly one paid API request');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits');
  assert.equal(calls[0].options.method, 'POST');
  const form = calls[0].options.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('size'), '2304x1728');
  assert.equal(form.get('quality'), 'high');
  assert.equal(form.get('background'), 'transparent');
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

test('shrinks a tall offset foreground to at most 60% height, centered with its proportions and fur edges preserved', async () => {
  const original = { left: 80, top: 20, width: 600, height: 1600 };
  upstream = () => Response.json({ data: [{ b64_json: foregroundFixture(original) }] });
  const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
  assert.equal(response.status, 200, response.body.error);
  const output = decodedOutput(response.body);
  const bounds = foregroundBounds(output);
  const maxHeight = Math.floor(1728 * 0.60);
  assert.equal(output.width, 2304);
  assert.equal(output.height, 1728);
  assert.equal(bounds.height, maxHeight, 'an oversized subject should fit the 1036-pixel height cap');
  assert.ok(Math.abs(bounds.width - original.width * maxHeight / original.height) <= 1,
    'width must use the same scale as height, within integer pixel rounding');
  assert.ok(Math.abs(bounds.left + bounds.right - (output.width - 1)) <= 1,
    'the resized foreground must be horizontally centered');
  assert.ok(Math.abs(bounds.top + bounds.bottom - (output.height - 1)) <= 1,
    'the resized foreground must be vertically centered');

  const middleY = bounds.top + Math.floor(bounds.height / 2);
  assert.deepEqual(pixelAt(output, bounds.left + Math.floor(bounds.width * 0.3), middleY), [0, 0, 0, 255],
    'opaque black fur must survive scaling and must not become background');
  assert.deepEqual(pixelAt(output, bounds.left + Math.floor(bounds.width * 0.5), middleY), [97, 58, 23, 255]);
  assert.deepEqual(pixelAt(output, bounds.left + Math.floor(bounds.width * 0.7), middleY), [12, 34, 230, 255]);
  assert.deepEqual(pixelAt(output, bounds.left + 2, middleY), [100, 138, 57, 255],
    'the semi-transparent boundary must be alpha-composited once onto #00B140');
  assert.deepEqual(pixelAt(output, bounds.left + Math.floor(bounds.width / 2), bounds.top + 2), [100, 138, 57, 255]);
  for (const [x, y] of [[0, 0], [2303, 1727], [80, 20], [bounds.left - 1, middleY]]) {
    assert.deepEqual(pixelAt(output, x, y), [0, 177, 64, 255], 'empty canvas stays exactly #00B140');
  }
  assert.equal(calls.length, 1, 'resizing and compositing must not request another paid generation');
});

test('a foreground already at the 60% limit keeps its original size and offset position', async () => {
  const original = { left: 150, top: 40, width: 120, height: Math.floor(1728 * 0.60) };
  upstream = () => Response.json({ data: [{ b64_json: foregroundFixture(original) }] });
  const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
  assert.equal(response.status, 200, response.body.error);
  const output = decodedOutput(response.body);
  assert.deepEqual(foregroundBounds(output), {
    left: original.left,
    top: original.top,
    right: original.left + original.width - 1,
    bottom: original.top + original.height - 1,
    width: original.width,
    height: original.height
  });
  assert.deepEqual(pixelAt(output, original.left + 2, original.top + 500), [100, 138, 57, 255]);
  assert.deepEqual(pixelAt(output, original.left + 60, original.top + 500), [97, 58, 23, 255]);
  assert.deepEqual(pixelAt(output, 1152, 864), [0, 177, 64, 255], 'a small subject must not be moved to the center');
  assert.equal(calls.length, 1);
});

test('requests a small single-subject transparent wideshot for later #00B140 compositing', async () => {
  const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
  assert.equal(response.status, 200, response.body.error);
  const prompt = calls[0].options.body.get('prompt');
  assert.match(prompt, /한 마리/);
  assert.match(prompt, /20\s*[°도]/);
  assert.match(prompt, /4\s*:\s*3/);
  assert.match(prompt, /고정 와이드숏/);
  assert.match(prompt, /프레임 높이의 약 35%/);
  assert.match(prompt, /위아래 여백은 합쳐서 프레임 높이의 60~70%/);
  assert.match(prompt, /투명/);
  assert.match(prompt, /#00B140/i);
  assert.match(prompt, /그림자[\s\S]*반사[\s\S]*제외/);
  assert.equal(calls.length, 1);
});

test('accepts both one and the supported maximum of six reference photos', async () => {
  for (const count of [1, 6]) {
    const response = await request('/api/generate', {
      method: 'POST', body: { images: Array(count).fill(image) }
    });
    assert.equal(response.status, 200, response.body.error);
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

test('rejects opaque RGB and fully opaque RGBA output without replacing black fur or regenerating', async () => {
  for (const colorType of [2, 6]) {
    const b64_json = createPng(2304, 1728, { opaque: true, colorType }).toString('base64');
    upstream = () => Response.json({ data: [{ b64_json }] });
    const callsBefore = calls.length;
    const response = await request('/api/generate', { method: 'POST', body: { images: [image] } });
    assert.equal(response.status, 502, 'opaque PNG color type ' + colorType);
    assert.match(response.body.error, /투명|알파/);
    assert.equal(response.body.image, undefined);
    assert.equal(calls.length - callsBefore, 1, 'opaque output must not trigger another paid generation');
  }
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
