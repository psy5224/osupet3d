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
const MESHY_API = 'https://api.meshy.ai/openapi/v1/image-to-3d';
const MESHY_REMESH_API = 'https://api.meshy.ai/openapi/v1/remesh';
const REMESH_TARGET_POLYCOUNT = 20_000;
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

    const prompt = `첨부한 개체 참고 사진은 모두 같은 동물 한 마리의 사진입니다. 이 동물 한 마리가 순백색 스튜디오 바닥에 네 발을 딛고 서 있는 전신 실사 이미지 한 장을 생성해 주세요.

카메라와 구도

카메라는 동물의 눈높이에서 몸의 정면 기준 약 20° 옆에 둡니다. 동물은 화면 왼쪽 앞을 향해 서 있고, 얼굴과 가슴이 카메라에 가장 가깝습니다. 어깨에서 엉덩이까지 이어지는 몸통은 화면 오른쪽 뒤로 멀어집니다. 몸통의 길이가 원근에 따라 자연스럽게 짧아 보이고, 양쪽 눈과 주둥이 앞면, 가슴, 몸통 한쪽 면이 함께 보여야 합니다.

머리, 목, 몸통은 하나의 축을 따라 같은 방향을 향합니다. 머리를 좌우로 돌리거나 기울이지 않습니다. 입은 자연스럽게 다물고, 혀가 보이지 않는 편안한 기본 표정으로 표현해 주세요.

네 발로 체중을 고르게 지탱하는 편안한 자세로 서 주세요. 앞발은 양쪽 어깨 너비 정도로, 뒷발은 양쪽 골반 너비 정도로 벌려 주세요. 약 20° 앞 사선 구도에서 앞발 두 개는 화면 왼쪽 앞에, 뒷발 두 개는 오른쪽 뒤에 놓이게 해 주세요. 카메라 위치를 미세하게 조정해 다리 사이로 흰 배경이 보이고 네 발의 윤곽이 각각 구분되게 해 주세요. 무릎과 발끝은 자연스럽게 앞을 향하게 해 주세요.

개체의 특징

정면 사진에서 얼굴과 눈·코·귀의 형태를, 옆모습과 전신 사진에서 머리와 몸통의 비율, 다리 길이와 굵기를 확인해 주세요. 털의 길이와 볼륨, 털색과 무늬는 해당 부위가 가장 선명한 사진을 기준으로 재현해 주세요. 좌우 무늬의 차이와 불규칙한 경계를 유지하고, 사진에서 확인되는 무늬만 반영해 주세요.

꼬리

참고 사진에서 꼬리가 확인되면 실제 길이, 굵기, 색, 털의 결을 유지해 주세요. 꼬리 뿌리에서 올라오는 부분은 바닥과 약 90°를 이루도록 위로 세우고, 끝부분은 개체 고유의 곡선을 유지해 주세요. 꼬리가 화면 오른쪽 뒤에서 올라오도록 하고, 귀와 겹치지 않게 뿌리부터 끝까지 보이게 해 주세요. 모든 참고 사진에서 꼬리가 가려져 확인할 수 없거나 꼬리가 없는 개체는 보이는 모습 그대로 표현해 주세요.

프레이밍과 조명

세로가 가로보다 조금 긴 프레임에 귀 끝, 네 발의 발끝, 확인되는 꼬리 끝까지 모두 담고 사방에 여백을 남겨 주세요. 배경과 바닥은 경계선 없이 순백색으로 이어지고, 발 바로 아래에만 옅은 접지 그림자가 생기도록 해 주세요. 부드러운 스튜디오 조명으로 털의 결, 눈의 반사광, 코와 발의 질감을 실제 사진처럼 표현해 주세요. 화면에는 동물 한 마리만 담고 목줄, 하네스, 이름표, 소품, 사람, 글자, 화면 아이콘은 제외해 주세요.`;

    form.append('prompt', prompt);
    form.append('model', 'gpt-image-2.6-sunburst');
    form.append('quality', 'high');
    form.append('size', '1792x2240');
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
    result.detail ||
    (typeof result.error === 'string' && result.error) ||
    (result.error && result.error.message) ||
    (typeof result.task_error === 'string' && result.task_error) ||
    (result.task_error && result.task_error.message)
  );
  if (status === 401) return 'Meshy API 키가 올바르지 않아요.';
  if (status === 402) return 'Meshy 크레딧이 부족해요. Meshy 계정의 잔액을 확인해주세요.';
  if (status === 429) return 'Meshy 요청 한도를 초과했어요. 잠시 후 다시 시도해주세요.';
  return detail || 'Meshy에서 3D 모델을 만들지 못했어요.';
}

function isValidMeshyTaskId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001F\u007F]/.test(value);
}

function decodeTaskId(value) {
  try {
    const decoded = decodeURIComponent(value);
    return isValidMeshyTaskId(decoded) ? decoded : '';
  } catch {
    return '';
  }
}

function validMeshyModelUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const parsed = new URL(value);
    const isMeshyHost = parsed.hostname === 'meshy.ai' || parsed.hostname.endsWith('.meshy.ai');
    return parsed.protocol === 'https:' && isMeshyHost ? parsed.href : '';
  } catch {
    return '';
  }
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

    // Meshy's symmetry_mode is deprecated and has no effect. Encourage balanced
    // geometry through the aligned input pose above while preserving coat markings.
    const apiRes = await fetch(MESHY_API, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.MESHY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_url: image,
        model_type: 'standard',
        ai_model: 'meshy-6',
        should_remesh: false,
        should_texture: true,
        enable_pbr: true,
        image_enhancement: false,
        remove_lighting: true,
        target_formats: ['glb']
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
  if (!isValidMeshyTaskId(taskId)) {
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
    for (const format of ['glb']) {
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
    const modelUrl = validMeshyModelUrl(body.modelUrl);
    if (!isValidMeshyTaskId(taskId) && !modelUrl) {
      return json(res, 400, { error: '리토폴로지할 3D 작업 ID 또는 GLB 주소가 필요해요.' });
    }

    const startRemesh = async input => {
      const apiRes = await fetch(MESHY_REMESH_API, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.MESHY_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...input,
          target_formats: ['glb'],
          topology: 'quad',
          target_polycount: REMESH_TARGET_POLYCOUNT
        })
      });
      return { apiRes, result: await apiRes.json().catch(() => ({})) };
    };

    let attempt = await startRemesh(isValidMeshyTaskId(taskId)
      ? { input_task_id: taskId }
      : { model_url: modelUrl });

    // If Meshy rejects a source task ID, retry with its signed GLB URL.
    if (!attempt.apiRes.ok && attempt.apiRes.status === 400 && modelUrl && isValidMeshyTaskId(taskId)) {
      attempt = await startRemesh({ model_url: modelUrl });
    }

    const { apiRes, result } = attempt;
    if (!apiRes.ok) {
      return json(res, apiRes.status, { error: meshyErrorMessage(apiRes.status, result) });
    }
    if (!isValidMeshyTaskId(result.result)) {
      throw new Error('Meshy 리토폴로지 작업 ID를 받지 못했어요.');
    }
    json(res, 202, { taskId: result.result, targetPolycount: REMESH_TARGET_POLYCOUNT });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message || '리토폴로지 요청을 시작하지 못했어요.' });
  }
}

async function getRemesh(req, res, taskId) {
  if (!process.env.MESHY_API_KEY) {
    return json(res, 503, { error: '서버에 MESHY_API_KEY가 설정되지 않았어요.' });
  }
  if (!isValidMeshyTaskId(taskId)) {
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
    for (const format of ['glb']) {
      if (result.model_urls && result.model_urls[format]) modelUrls[format] = result.model_urls[format];
    }
    json(res, 200, {
      taskId: result.id || taskId,
      status: result.status || 'PENDING',
      progress: result.status === 'SUCCEEDED' ? 100 : (Number.isFinite(result.progress) ? result.progress : 0),
      modelUrls,
      viewerUrl: modelUrls.glb ? '/api/remesh/' + encodeURIComponent(taskId) + '/model.glb' : '',
      thumbnailUrl: result.thumbnail_url || '',
      error: result.task_error && result.task_error.message ? result.task_error.message : '',
      consumedCredits: Number.isFinite(result.consumed_credits) ? result.consumed_credits : null,
      topology: 'quad',
      targetPolycount: Number.isInteger(result.target_polycount) ? result.target_polycount : null
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
  if (!isValidMeshyTaskId(taskId)) {
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
  const meshyModelMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/3d\/([^/]+)\/model\.(glb)$/);
  if (meshyModelMatch) {
    const stamp = requestUrl.searchParams.get('download') === '1'
      ? requestUrl.searchParams.get('stamp') || fileTimestamp()
      : '';
    return stream3dAsset(req, res, MESHY_API, decodeTaskId(meshyModelMatch[1]), meshyModelMatch[2].toLowerCase(), stamp, 'pet3D');
  }

  const remeshModelMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/remesh\/([^/]+)\/model\.(glb)$/);
  if (remeshModelMatch) {
    const stamp = requestUrl.searchParams.get('download') === '1'
      ? requestUrl.searchParams.get('stamp') || fileTimestamp()
      : '';
    return stream3dAsset(req, res, MESHY_REMESH_API, decodeTaskId(remeshModelMatch[1]), remeshModelMatch[2].toLowerCase(), stamp, 'pet3D');
  }

  const meshyTaskMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/3d\/([^/]+)$/);
  if (meshyTaskMatch) return get3d(req, res, decodeTaskId(meshyTaskMatch[1]));

  const remeshTaskMatch = req.method === 'GET' && cleanUrl.match(/^\/api\/remesh\/([^/]+)$/);
  if (remeshTaskMatch) return getRemesh(req, res, decodeTaskId(remeshTaskMatch[1]));

  if (req.method !== 'GET') return json(res, 405, { error: '허용되지 않은 요청이에요.' });

  const clean = decodeURIComponent(req.url.split('?')[0]);
  const target = path.join(PUBLIC, clean === '/' ? 'index.html' : clean);
  if (!target.startsWith(PUBLIC)) return json(res, 403, { error: '접근할 수 없어요.' });
  fs.readFile(target, (error, data) => {
    if (error) return json(res, 404, { error: '페이지를 찾을 수 없어요.' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log('오수펫 추모공원: http://localhost:' + PORT));
}

module.exports = { server };
