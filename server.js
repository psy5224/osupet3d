const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const STYLE_REFERENCE = 'D:\\Libraries\\Downloads\\magnific_img1-._SObMbD5Ub8.png';
const MESHY_API = 'https://api.meshy.ai/openapi/v1/image-to-3d';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 45_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('요청 형식이 올바르지 않아요.'));
      }
    });
    req.on('error', reject);
  });
}

function imageBlob(value) {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) throw new Error('지원하지 않는 이미지 형식이에요.');
  return {
    blob: new Blob([Buffer.from(match[2], 'base64')], { type: match[1] }),
    ext: match[1].split('/')[1].replace('jpeg', 'jpg')
  };
}

async function generate(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return json(res, 503, { error: '서버에 OPENAI_API_KEY가 설정되지 않았어요.' });
  }

  try {
    const body = await readJson(req);
    const images = body.images;
    if (!Array.isArray(images) || images.length < 1 || images.length > 6) {
      return json(res, 400, { error: '강아지 사진을 1장 이상 6장 이하로 넣어주세요.' });
    }

    const form = new FormData();
    images.forEach((value, index) => {
      const file = imageBlob(value);
      form.append('image[]', file.blob, 'dog-' + (index + 1) + '.' + file.ext);
    });

    const deployedStylePath = path.join(PUBLIC, 'style-reference.png');
    const stylePath = fs.existsSync(deployedStylePath) ? deployedStylePath : STYLE_REFERENCE;
    const hasStyleReference = fs.existsSync(stylePath);
    if (hasStyleReference) {
      form.append('image[]', new Blob([fs.readFileSync(stylePath)], { type: 'image/png' }), 'style-reference.png');
    }

    const dogInputMap = images
      .map((_, index) => 'Image ' + (index + 1) + ': a photograph of the same target dog; use only for identity and anatomy.')
      .join('\n');
    const styleInputMap = hasStyleReference
      ? '\nImage ' + (images.length + 1) + ': STYLE REFERENCE ONLY. Apply its visual language to the target dog, but do not copy its dog, breed, colors, markings, pose, expression, composition, or checkerboard background.'
      : '';
    const prompt = `GOAL - HIGHEST PRIORITY
Create one irresistibly cute, warm, fairy-tale children's picture-book illustration of the same target dog in Images 1-${images.length}. The result must immediately feel like a lovable main character from a premium illustrated storybook, never merely a traced or filtered photograph.

INPUT ROLES
${dogInputMap}${styleInputMap}

TARGET DOG — PRESERVE
Faithfully preserve the photographed dog's recognizable identity: exact coat colors and markings, breed traits, ear shape, muzzle, eye color, body proportions, leg length, paws, tail shape, fur length and texture, and every distinctive feature. Combine the photos only to understand this one dog. Do not average away unique markings or replace them with features from the style reference.

STYLE — MANDATORY
Match the visual style of the STYLE REFERENCE as closely as possible: a charming hand-painted children's storybook character illustration; bold, softly irregular dark ink outlines; rounded and appealing shapes; layered fur tufts drawn with expressive scalloped brush shapes; translucent watercolor washes mixed with soft opaque gouache-like shading; visible colored-pencil and paper texture; gentle tonal modeling; warm golden-brown edge highlights; rich but cozy colors; two large glossy expressive eyes; polished professional picture-book finish. It must feel hand-drawn, warm, whimsical, dimensional, and distinctly fairy-tale-like. Do not make it a flat vector icon, generic digital cartoon, anime, 3D render, photograph, or photorealistic painting.

CUTE CHARACTER DIRECTION - MANDATORY
Make the dog exceptionally adorable and emotionally warm while keeping it unmistakably the photographed dog. Use softly rounded contours, a subtly oversized head, two large luminous glossy eyes, a small softly rounded muzzle, plush layered fur, compact balanced proportions, and a gentle happy expression. Keep all exaggeration tasteful and picture-book-like so breed traits, markings, and identity remain accurate. Avoid a stern, aggressive, uncanny, anatomically distorted, overly realistic, or generic mascot appearance.

CANVAS AND BACKGROUND — MANDATORY
Exact 1:1 square composition. Pure solid white (#FFFFFF) background only. One dog only, full body, centered, with generous white breathing room on every side so ears, nose, paws, and tail are never cropped. No scenery, props, cast shadow, ground shadow, floor line, texture, border, transparency, or checkerboard.

POSE — MANDATORY
Match a full-body front three-quarter portrait angle. Position the dog's body at approximately 30-45 degrees to the camera, with the hindquarters receding toward the right side of the canvas. Turn the head gently toward the camera so the face is nearly frontal, both eyes are clearly visible, the nose is centered, and the chest plus one side of the torso can be seen. The dog looks directly at the camera with a calm, sweet expression. Use a camera at the dog's eye level with a natural neutral perspective, as in a professional pet portrait. No exact side profile, no rear view, no top-down view, no low-angle view, no extreme wide-angle distortion, and no cropped body.

STANCE - MANDATORY
Show the dog calmly standing completely still in a neutral, natural show-stance, regardless of any action poses in the input photos or style reference. All four paws must be firmly planted on the same invisible horizontal ground plane, with legs naturally straight but relaxed, body level, weight evenly balanced, head held calmly, and tail resting in its natural position. Show natural depth between the near and far legs in the three-quarter view, with no paw lifted. No walking, trotting, running, jumping, leaping, floating, sitting, lying down, crouching, play bow, rearing, dancing, or dynamic action pose. Do not draw motion lines or wind-swept motion.

FINAL CONSTRAINTS
No words, letters, logo, watermark, frame, extra animal, extra limb, checkerboard, or photorealism. Identity comes only from Images 1-${images.length}; visual style comes only from the final STYLE REFERENCE image.`;

    form.append('prompt', prompt);
    form.append('model', 'gpt-image-2');
    form.append('quality', 'high');
    form.append('size', '2048x2048');
    form.append('background', 'opaque');
    form.append('output_format', 'png');

    const apiRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      body: form
    });
    const result = await apiRes.json();
    if (!apiRes.ok) {
      throw new Error((result.error && result.error.message) || '이미지를 만들지 못했어요.');
    }

    const b64 = result.data && result.data[0] && result.data[0].b64_json;
    if (!b64) throw new Error('완성 이미지를 받지 못했어요.');
    json(res, 200, { image: 'data:image/png;base64,' + b64 });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message || '잠시 후 다시 시도해주세요.' });
  }
}

function meshyErrorMessage(status, result) {
  const detail = result && (
    result.message ||
    (result.error && result.error.message) ||
    (result.task_error && result.task_error.message)
  );
  if (status === 401) return 'Meshy API 키가 올바르지 않아요.';
  if (status === 402) return 'Meshy 크레딧이 부족해요. Meshy 계정의 잔액을 확인해주세요.';
  if (status === 429) return 'Meshy 요청 한도를 초과했어요. 잠시 후 다시 시도해주세요.';
  return detail || 'Meshy에서 3D 모델을 만들지 못했어요.';
}

async function create3d(req, res) {
  if (!process.env.MESHY_API_KEY) {
    return json(res, 503, { error: '서버에 MESHY_API_KEY가 설정되지 않았어요.' });
  }

  try {
    const body = await readJson(req);
    const image = body.image;
    if (
      typeof image !== 'string' ||
      image.length > 40_000_000 ||
      !/^data:image\/(?:png|jpeg);base64,/.test(image)
    ) {
      return json(res, 400, { error: '3D로 변환할 PNG 또는 JPEG 이미지가 필요해요.' });
    }

    const apiRes = await fetch(MESHY_API, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.MESHY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_url: image,
        model_type: 'standard',
        ai_model: 'latest',
        should_texture: true,
        enable_pbr: true,
        image_enhancement: false,
        remove_lighting: true,
        target_formats: ['glb', 'fbx', 'obj', 'usdz']
      })
    });
    const result = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      return json(res, apiRes.status, { error: meshyErrorMessage(apiRes.status, result) });
    }
    if (!result.result) throw new Error('Meshy 작업 ID를 받지 못했어요.');
    json(res, 202, { taskId: result.result });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message || '3D 변환 요청을 시작하지 못했어요.' });
  }
}

async function get3d(req, res, taskId) {
  if (!process.env.MESHY_API_KEY) {
    return json(res, 503, { error: '서버에 MESHY_API_KEY가 설정되지 않았어요.' });
  }
  if (!/^[0-9a-f-]{20,64}$/i.test(taskId)) {
    return json(res, 400, { error: '올바르지 않은 Meshy 작업 ID예요.' });
  }

  try {
    const apiRes = await fetch(MESHY_API + '/' + encodeURIComponent(taskId), {
      headers: { Authorization: 'Bearer ' + process.env.MESHY_API_KEY }
    });
    const result = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      return json(res, apiRes.status, { error: meshyErrorMessage(apiRes.status, result) });
    }

    const modelUrls = {};
    for (const format of ['glb', 'fbx', 'obj', 'usdz', 'stl']) {
      if (result.model_urls && result.model_urls[format]) {
        modelUrls[format] = result.model_urls[format];
      }
    }

    json(res, 200, {
      taskId: result.id || taskId,
      status: result.status || 'PENDING',
      progress: Number.isFinite(result.progress) ? result.progress : 0,
      modelUrls,
      viewerUrl: modelUrls.glb ? '/api/3d/' + encodeURIComponent(taskId) + '/model.glb' : '',
      thumbnailUrl: result.thumbnail_url || '',
      expiresAt: result.expires_at || null,
      error: result.task_error && result.task_error.message ? result.task_error.message : ''
    });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message || '3D 작업 상태를 확인하지 못했어요.' });
  }
}

async function stream3dModel(req, res, taskId) {
  if (!process.env.MESHY_API_KEY) {
    return json(res, 503, { error: '서버에 MESHY_API_KEY가 설정되지 않았어요.' });
  }
  if (!/^[0-9a-f-]{20,64}$/i.test(taskId)) {
    return json(res, 400, { error: '올바르지 않은 Meshy 작업 ID예요.' });
  }

  try {
    const taskRes = await fetch(MESHY_API + '/' + encodeURIComponent(taskId), {
      headers: { Authorization: 'Bearer ' + process.env.MESHY_API_KEY }
    });
    const task = await taskRes.json().catch(() => ({}));
    if (!taskRes.ok) {
      return json(res, taskRes.status, { error: meshyErrorMessage(taskRes.status, task) });
    }

    const glbUrl = task.model_urls && task.model_urls.glb;
    if (task.status !== 'SUCCEEDED' || !glbUrl) {
      return json(res, 409, { error: '아직 GLB 모델이 준비되지 않았어요.' });
    }

    const parsedUrl = new URL(glbUrl);
    if (parsedUrl.protocol !== 'https:') {
      return json(res, 502, { error: 'Meshy가 올바른 GLB 주소를 반환하지 않았어요.' });
    }

    const assetHeaders = { Accept: 'model/gltf-binary, application/octet-stream' };
    if (req.headers.range) assetHeaders.Range = req.headers.range;
    const modelRes = await fetch(glbUrl, { headers: assetHeaders });
    if (!modelRes.ok || !modelRes.body) {
      return json(res, 502, { error: 'Meshy에서 GLB 파일을 내려받지 못했어요.' });
    }

    const headers = {
      'Content-Type': modelRes.headers.get('content-type') || 'model/gltf-binary',
      'Content-Disposition': 'inline; filename="monggeul-dog.glb"',
      'Cache-Control': 'private, max-age=300'
    };
    for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = modelRes.headers.get(name);
      if (value) headers[name] = value;
    }

    res.writeHead(modelRes.status, headers);
    const stream = Readable.fromWeb(modelRes.body);
    stream.on('error', error => {
      console.error(error);
      res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      json(res, 500, { error: error.message || '3D 모델 파일을 불러오지 못했어요.' });
    } else {
      res.destroy(error);
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate') return generate(req, res);
  if (req.method === 'POST' && req.url === '/api/3d') return create3d(req, res);

  const cleanUrl = req.url.split('?')[0];
  const meshyModelMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/3d\/([0-9a-f-]+)\/model\.glb$/i);
  if (meshyModelMatch) return stream3dModel(req, res, meshyModelMatch[1]);

  const meshyTaskMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/3d\/([0-9a-f-]+)$/i);
  if (meshyTaskMatch) return get3d(req, res, meshyTaskMatch[1]);

  if (req.method !== 'GET') return json(res, 405, { error: '허용되지 않은 요청이에요.' });

  const clean = decodeURIComponent(req.url.split('?')[0]);
  if (clean === '/style-reference.png' && fs.existsSync(STYLE_REFERENCE)) {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return fs.createReadStream(STYLE_REFERENCE).pipe(res);
  }

  const target = path.join(PUBLIC, clean === '/' ? 'index.html' : clean);
  if (!target.startsWith(PUBLIC)) return json(res, 403, { error: '접근할 수 없어요.' });
  fs.readFile(target, (error, data) => {
    if (error) return json(res, 404, { error: '페이지를 찾을 수 없어요.' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log('몽글이 작업실: http://localhost:' + PORT));
}

module.exports = { server };
