const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const APP_PACKAGE = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const APP_INFO = {
  version: APP_PACKAGE.version || '1.0.0',
  updatedAt: APP_PACKAGE.appUpdatedAt || null
};
const STYLE_REFERENCE = 'D:\\Libraries\\Downloads\\magnific_img1-._SObMbD5Ub8.png';
const MESHY_API = 'https://api.meshy.ai/openapi/v1/image-to-3d';
const MESHY_REMESH_API = 'https://api.meshy.ai/openapi/v1/remesh';
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
      return json(res, 400, { error: '강아지 또는 고양이 사진을 1장 이상 6장 이하로 넣어주세요.' });
    }

    const form = new FormData();
    images.forEach((value, index) => {
      const file = imageBlob(value);
      form.append('image[]', file.blob, 'pet-' + (index + 1) + '.' + file.ext);
    });

    const deployedStylePath = path.join(PUBLIC, 'style-reference.png');
    const stylePath = fs.existsSync(deployedStylePath) ? deployedStylePath : STYLE_REFERENCE;
    const hasStyleReference = fs.existsSync(stylePath);
    if (hasStyleReference) {
      form.append('image[]', new Blob([fs.readFileSync(stylePath)], { type: 'image/png' }), 'style-reference.png');
    }

    const petInputMap = images
      .map((_, index) => 'Image ' + (index + 1) + ': a photograph of the same target pet, which is either one dog or one cat; use only for species, identity, and anatomy.')
      .join('\n');
    const styleInputMap = hasStyleReference
      ? '\nImage ' + (images.length + 1) + ': STYLE REFERENCE ONLY. Apply only its visual language to the target pet. Never copy or infer the reference animal\'s species, breed, colors, markings, anatomy, pose, expression, composition, or checkerboard background.'
      : '';
    const prompt = `GOAL - HIGHEST PRIORITY
First determine from Images 1-${images.length} whether the target pet is a dog or a cat. Then create one irresistibly cute, warm, fairy-tale children's picture-book illustration of that exact same pet. The result must immediately feel like a lovable main character from a premium illustrated storybook, never merely a traced or filtered photograph.

INPUT ROLES
${petInputMap}${styleInputMap}

SPECIES AND TARGET IDENTITY — MANDATORY
The output must remain the same species as the photographed pet: dog stays dog, cat stays cat. Never turn a cat into a dog, a dog into a cat, or create a hybrid. Faithfully preserve the pet's recognizable identity: exact coat colors, patches, stripes and markings; breed or mixed-breed traits; ear shape and position; muzzle or feline whisker-pad shape; eye color and shape; nose color; body proportions; leg length; paw shape; tail length, thickness and natural shape; fur length and texture; whiskers for cats; and every distinctive feature. Combine the photos only to understand this one pet. Do not average away unique markings or borrow any animal features from the style reference. The mandatory pose instructions below override the head angle, leg placement, and tail position seen in any input image, but never override the pet's anatomy or identity.

STYLE — MANDATORY
Match the visual style of the STYLE REFERENCE as closely as possible: a charming hand-painted children's storybook character illustration; bold, softly irregular dark ink outlines; rounded and appealing shapes; layered fur tufts drawn with expressive scalloped brush shapes; translucent watercolor washes mixed with soft opaque gouache-like shading; visible colored-pencil and paper texture; gentle tonal modeling; warm golden-brown edge highlights; rich but cozy colors; two large glossy expressive eyes; polished professional picture-book finish. It must feel hand-drawn, warm, whimsical, dimensional, and distinctly fairy-tale-like. Do not make it a flat vector icon, generic digital cartoon, anime, 3D render, photograph, or photorealistic painting.

CUTE CHARACTER DIRECTION - MANDATORY
Make the pet exceptionally adorable and emotionally warm while keeping it unmistakably the photographed dog or cat. Use softly rounded contours, a subtly oversized head, two large luminous glossy eyes, species-appropriate facial anatomy, plush layered fur, compact balanced proportions, and a calm, gentle, sweet expression. For a cat, retain natural feline eyes, whisker pads, whiskers, nose, paws, and tail; do not give it a dog's muzzle, grin, floppy dog ears, or dog-like body. For a dog, retain natural canine muzzle, ears, paws, and proportions. Keep all exaggeration tasteful and picture-book-like so species, breed traits, markings, and identity remain accurate. Avoid a stern, aggressive, uncanny, anatomically distorted, overly realistic, or generic mascot appearance.

NO CLOTHING OR ACCESSORIES — MANDATORY
Show the pet completely natural with uncovered fur and anatomy. Remove and never draw any clothing, costume, shirt, sweater, dress, jacket, cape, hat, hood, bow, ribbon, bandana, collar, harness, leash, tag, jewelry, diaper, socks, shoes, eyewear, or other wearable accessory, even when one appears in the input photos or style reference. Reconstruct the naturally occluded neck, chest, back, and leg fur from the surrounding coat colors, markings, length, and texture so the pet looks complete and recognizable. Wearable removal overrides preservation of photographed objects, but must not alter the pet's true body, fur, or markings.

CANVAS AND BACKGROUND — MANDATORY
Exact 1:1 square composition. Pure solid white (#FFFFFF) background only. One pet only, full body, centered, with generous white breathing room on every side so ears, whiskers, nose, paws, and tail are never cropped. No scenery, props, cast shadow, ground shadow, floor line, texture, border, transparency, or checkerboard.

POSE — MANDATORY
Use a full-body front three-quarter portrait with a precise separation between head direction and body direction. The pet's face must look straight into the camera: the nose points directly toward the viewer, both eyes are equally visible and level, and the facial centerline is vertical. Keep the head perfectly upright with no tilt, curious head cock, roll, or sideways lean. Rotate the body approximately 45 degrees toward the viewer's right, so the chest is partly frontal while the torso and hindquarters extend and recede toward the right side of the canvas. The left side of the pet's body is more visible, creating a clear but natural 45-degree three-quarter body angle. Do not rotate the body toward the viewer's left. Use a camera at the pet's eye level with a natural neutral perspective, as in a professional pet portrait. No exact side profile, rear view, top-down view, low-angle view, wide-angle distortion, or cropped body.

STANCE - MANDATORY
Show the pet calmly standing completely still in a neutral, natural species-appropriate 45-degree stance, regardless of any pose in the input photos or style reference. The entire body must be visible from ears to tail and paws. All four legs and all four paws must be clearly visible as four distinct, anatomically correct limbs. Stagger the near and far legs naturally in the three-quarter view, leaving visible white separation so no front leg, hind leg, or paw is hidden behind another limb or the torso. All four paws must be firmly and evenly planted on the same invisible horizontal ground plane. Distribute the pet's body weight equally across all four legs and all four paws: every leg must be straight but naturally relaxed, vertical, stable, and visibly load-bearing, with the full surface of every paw contacting the ground evenly. Keep the shoulders, spine, chest, abdomen, and hips level and centered. Do not shift weight toward the front, back, left, or right; do not lean, tilt the pelvis, drop one hip or shoulder, bend one supporting leg, stand on tiptoe, or make any paw look light, hovering, or ready to step. The tail must always be raised upward and fully visible behind or beside the body in a natural species-appropriate upward curve; preserve its true length, thickness, fur, and shape, including a naturally short tail, but never let it hang down, tuck between the legs, lie on the floor, disappear behind the body, or be cropped. No paw may be lifted. No walking, trotting, running, jumping, leaping, floating, sitting, lying down, crouching, play bow, rearing, dancing, dynamic action pose, head tilt, motion lines, or wind-swept motion.

FINAL CONSTRAINTS
No words, letters, logo, watermark, frame, clothing, collar, harness, accessory, extra animal, extra limb, checkerboard, or photorealism. Species and identity come only from Images 1-${images.length}; visual style comes only from the final STYLE REFERENCE image.`;

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

async function createRemesh(req, res) {
  if (!process.env.MESHY_API_KEY) {
    return json(res, 503, { error: '서버에 MESHY_API_KEY가 설정되지 않았어요.' });
  }

  try {
    const body = await readJson(req);
    const taskId = body.taskId;
    if (typeof taskId !== 'string' || !/^[0-9a-f-]{20,64}$/i.test(taskId)) {
      return json(res, 400, { error: '리토폴로지할 올바른 3D 작업 ID가 필요해요.' });
    }

    const apiRes = await fetch(MESHY_REMESH_API, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.MESHY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input_task_id: taskId,
        target_formats: ['glb', 'fbx', 'obj', 'usdz'],
        topology: 'quad',
        target_polycount: 8500
      })
    });
    const result = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      return json(res, apiRes.status, { error: meshyErrorMessage(apiRes.status, result) });
    }
    if (!result.result) throw new Error('Meshy 리토폴로지 작업 ID를 받지 못했어요.');
    json(res, 202, { taskId: result.result });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message || '리토폴로지 요청을 시작하지 못했어요.' });
  }
}

async function getRemesh(req, res, taskId) {
  if (!process.env.MESHY_API_KEY) {
    return json(res, 503, { error: '서버에 MESHY_API_KEY가 설정되지 않았어요.' });
  }
  if (!/^[0-9a-f-]{20,64}$/i.test(taskId)) {
    return json(res, 400, { error: '올바르지 않은 리토폴로지 작업 ID예요.' });
  }

  try {
    const apiRes = await fetch(MESHY_REMESH_API + '/' + encodeURIComponent(taskId), {
      headers: { Authorization: 'Bearer ' + process.env.MESHY_API_KEY }
    });
    const result = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      return json(res, apiRes.status, { error: meshyErrorMessage(apiRes.status, result) });
    }

    const modelUrls = {};
    for (const format of ['glb', 'fbx', 'obj', 'usdz', 'blend', 'stl']) {
      if (result.model_urls && result.model_urls[format]) modelUrls[format] = result.model_urls[format];
    }
    json(res, 200, {
      taskId: result.id || taskId,
      status: result.status || 'PENDING',
      progress: Number.isFinite(result.progress) ? result.progress : 0,
      modelUrls,
      viewerUrl: modelUrls.glb ? '/api/remesh/' + encodeURIComponent(taskId) + '/model.glb' : '',
      thumbnailUrl: result.thumbnail_url || '',
      error: result.task_error && result.task_error.message ? result.task_error.message : '',
      consumedCredits: Number.isFinite(result.consumed_credits) ? result.consumed_credits : null,
      topology: 'quad',
      targetPolycount: 8500,
      targetVertexRange: [8000, 9000]
    });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message || '리토폴로지 상태를 확인하지 못했어요.' });
  }
}

function fileTimestamp(date = new Date()) {
  const values = {};
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return values.year + values.month + values.day + '_' + values.hour + values.minute + values.second;
}

async function stream3dAsset(req, res, taskApi, taskId, format, downloadStamp, filenamePrefix) {
  if (!process.env.MESHY_API_KEY) {
    return json(res, 503, { error: '서버에 MESHY_API_KEY가 설정되지 않았어요.' });
  }
  if (!/^[0-9a-f-]{20,64}$/i.test(taskId)) {
    return json(res, 400, { error: '올바르지 않은 Meshy 작업 ID예요.' });
  }

  try {
    const taskRes = await fetch(taskApi + '/' + encodeURIComponent(taskId), {
      headers: { Authorization: 'Bearer ' + process.env.MESHY_API_KEY }
    });
    const task = await taskRes.json().catch(() => ({}));
    if (!taskRes.ok) {
      return json(res, taskRes.status, { error: meshyErrorMessage(taskRes.status, task) });
    }

    const assetUrl = task.model_urls && task.model_urls[format];
    if (task.status !== 'SUCCEEDED' || !assetUrl) {
      return json(res, 409, { error: '아직 ' + format.toUpperCase() + ' 모델이 준비되지 않았어요.' });
    }

    const parsedUrl = new URL(assetUrl);
    if (parsedUrl.protocol !== 'https:') {
      return json(res, 502, { error: 'Meshy가 올바른 모델 주소를 반환하지 않았어요.' });
    }

    const assetHeaders = { Accept: '*/*' };
    if (req.headers.range) assetHeaders.Range = req.headers.range;
    const modelRes = await fetch(assetUrl, { headers: assetHeaders });
    if (!modelRes.ok || !modelRes.body) {
      return json(res, 502, { error: 'Meshy에서 ' + format.toUpperCase() + ' 파일을 내려받지 못했어요.' });
    }

    const isDownload = Boolean(downloadStamp);
    const safeStamp = /^\d{8}_\d{6}$/.test(downloadStamp || '') ? downloadStamp : fileTimestamp();
    const filename = isDownload
      ? filenamePrefix + '_' + safeStamp + '.' + format
      : filenamePrefix + '_preview.' + format;
    const headers = {
      'Content-Type': modelRes.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': (isDownload ? 'attachment' : 'inline') + '; filename="' + filename + '"',
      'Cache-Control': isDownload ? 'private, no-store' : 'private, max-age=300'
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
  if (req.method === 'POST' && req.url === '/api/remesh') return createRemesh(req, res);
  if (req.method === 'GET' && req.url.split('?')[0] === '/api/version') return json(res, 200, APP_INFO);

  const requestUrl = new URL(req.url, 'http://localhost');
  const cleanUrl = requestUrl.pathname;
  const meshyModelMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/3d\/([0-9a-f-]+)\/model\.(glb|fbx|obj|usdz|stl)$/i);
  if (meshyModelMatch) {
    const stamp = requestUrl.searchParams.get('download') === '1'
      ? requestUrl.searchParams.get('stamp') || fileTimestamp()
      : '';
    return stream3dAsset(req, res, MESHY_API, meshyModelMatch[1], meshyModelMatch[2].toLowerCase(), stamp, 'pet3D');
  }

  const remeshModelMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/remesh\/([0-9a-f-]+)\/model\.(glb|fbx|obj|usdz|blend|stl)$/i);
  if (remeshModelMatch) {
    const stamp = requestUrl.searchParams.get('download') === '1'
      ? requestUrl.searchParams.get('stamp') || fileTimestamp()
      : '';
    return stream3dAsset(req, res, MESHY_REMESH_API, remeshModelMatch[1], remeshModelMatch[2].toLowerCase(), stamp, 'pet3D_retopo');
  }

  const meshyTaskMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/3d\/([0-9a-f-]+)$/i);
  if (meshyTaskMatch) return get3d(req, res, meshyTaskMatch[1]);

  const remeshTaskMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/remesh\/([0-9a-f-]+)$/i);
  if (remeshTaskMatch) return getRemesh(req, res, remeshTaskMatch[1]);

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
