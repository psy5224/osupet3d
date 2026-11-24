const http = require('http');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const APP_PACKAGE = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const APP_INFO = {
  version: APP_PACKAGE.version || '1.0.0',
  updatedAt: APP_PACKAGE.appUpdatedAt || null
};
const OUTPUT_WIDTH = 2304;
const OUTPUT_HEIGHT = 1728;
const BACKGROUND_RGB = { red: 0, green: 177, blue: 64 }; // #00B140
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

function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > 45_000_000) {
        tooLarge = true;
        chunks.length = 0;
        reject(requestError('사진 용량이 너무 커요. 더 작은 사진을 선택해주세요.', 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(requestError('요청 형식이 올바르지 않아요.'));
      }
    });
    req.on('error', reject);
  });
}

function imageBlob(value) {
  const match = typeof value === 'string' && value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw requestError('지원하지 않는 이미지 형식이에요. PNG, JPG, WEBP 사진을 넣어주세요.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, '')) {
    throw requestError('사진 데이터가 올바르지 않아요.');
  }
  return {
    blob: new Blob([bytes], { type: match[1] }),
    ext: match[1].split('/')[1].replace('jpeg', 'jpg')
  };
}

const PROMPT = `첨부한 개체 참고 사진은 모두 같은 동물 한 마리의 사진입니다. 이 동물 한 마리가 평평한 스튜디오 바닥에 네 발을 딛고 서 있는 전신 실사 이미지 한 장을 생성해 주세요.

카메라와 구도

카메라는 동물의 눈높이에서 몸의 정면 기준 약 20° 옆에 둡니다. 동물은 화면 왼쪽 앞을 향해 서 있고, 얼굴과 가슴이 카메라에 가장 가깝습니다. 어깨에서 엉덩이까지 이어지는 몸통은 화면 오른쪽 뒤로 멀어집니다. 몸통의 길이가 원근에 따라 자연스럽게 짧아 보이고, 양쪽 눈과 주둥이 앞면, 가슴, 몸통 한쪽 면이 함께 보여야 합니다.

머리, 목, 몸통은 하나의 축을 따라 같은 방향을 향합니다. 머리를 좌우로 돌리거나 기울이지 않습니다. 입은 자연스럽게 다물고, 혀가 보이지 않는 편안한 기본 표정으로 표현해 주세요.

네 발로 체중을 고르게 지탱하는 편안한 자세로 서 주세요. 앞발은 양쪽 어깨 너비 정도로, 뒷발은 양쪽 골반 너비 정도로 벌려 주세요. 약 20° 앞 사선 구도에서 앞발 두 개는 화면 왼쪽 앞에, 뒷발 두 개는 오른쪽 뒤에 놓이게 해 주세요. 카메라 위치를 미세하게 조정해 다리 사이로 빈 공간이 보이고 네 발의 윤곽이 각각 구분되게 해 주세요. 무릎과 발끝은 자연스럽게 앞을 향하게 해 주세요.

개체의 특징

정면 사진에서 얼굴과 눈·코·귀의 형태를, 옆모습과 전신 사진에서 머리와 몸통의 비율, 다리 길이와 굵기를 확인해 주세요. 털의 길이와 볼륨, 털색과 무늬는 해당 부위가 가장 선명한 사진을 기준으로 재현해 주세요. 좌우 무늬의 차이와 불규칙한 경계를 유지하고, 사진에서 확인되는 무늬만 반영해 주세요.

꼬리

참고 사진에서 꼬리가 확인되면 실제 길이, 굵기, 색, 털의 결을 유지해 주세요. 꼬리 뿌리에서 올라오는 부분은 바닥과 약 90°를 이루도록 위로 세우고, 끝부분은 개체 고유의 곡선을 유지해 주세요. 꼬리가 화면 오른쪽 뒤에서 올라오도록 하고, 귀와 겹치지 않게 뿌리부터 끝까지 보이게 해 주세요. 모든 참고 사진에서 꼬리가 가려져 확인할 수 없거나 꼬리가 없는 개체는 보이는 모습 그대로 표현해 주세요.

프레이밍과 조명

가로 4:3 고정 와이드숏 한 컷입니다. 카메라를 충분히 멀리 두어 동물 한 마리의 전신이 화면 중앙에 작게 보이도록 촬영해 주세요. 가장 낮은 발끝에서 가장 높은 귀 끝이나 꼬리 끝까지의 높이는 프레임 높이의 약 35%(허용 범위 30~40%)로 잡아 주세요. 위아래 여백은 합쳐서 프레임 높이의 60~70%가 되도록 고르게 남기고, 좌우에도 넉넉한 여백을 두세요. 귀 끝, 네 발의 발끝과 확인되는 꼬리 끝까지 모두 담고, 촬영 후 확대하거나 잘라내지 마세요.

최종 결과는 균일한 녹색(#00B140) 바닥과 배경 위에 합성됩니다. 지금은 동물만 투명 배경의 PNG로 생성해 주세요. 발이 수평 바닥에 닿은 자세로 서되, 동물 바깥의 여백과 다리 사이에는 아무것도 그리지 말고 완전히 투명하게 비워 주세요. 발밑 접지 그림자를 포함한 모든 바닥 그림자, 비침과 반사상, 녹색 색번짐은 제외해 주세요. 동물에만 부드러운 중성 스튜디오 조명을 비춰 검은 털을 포함해 원래의 털색과 결을 보존하고, 눈의 자연스러운 반사광과 코·발의 질감을 실제 사진처럼 표현해 주세요. 한 프레임에는 이 동물 한 마리만 담고 목줄, 하네스, 이름표, 소품, 사람, 글자, 화면 아이콘은 제외해 주세요.`;

async function composeOutput(b64) {
  if (typeof b64 !== 'string' || !b64) throw new Error('완성 이미지를 받지 못했어요.');
  const png = Buffer.from(b64, 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length < 33 || !png.subarray(0, 8).equals(signature) || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('완성된 PNG 이미지가 올바르지 않아요. 다시 시도해주세요.');
  }
  if (png.readUInt32BE(16) !== OUTPUT_WIDTH || png.readUInt32BE(20) !== OUTPUT_HEIGHT) {
    throw new Error('요청한 4:3 크기의 이미지를 받지 못했어요. 다시 시도해주세요.');
  }
  const image = new PNG({ colorType: 2, inputColorType: 6, bgColor: BACKGROUND_RGB });
  await new Promise((resolve, reject) => {
    image.parse(png, error => error ? reject(error) : resolve());
  });
  let hasBackground = false;
  let hasSubject = false;
  for (let i = 3; i < image.data.length; i += 4) {
    const alpha = image.data[i];
    if (alpha === 0) hasBackground = true;
    if (alpha > 0) hasSubject = true;
    if (hasBackground && hasSubject) break;
  }
  if (!hasBackground || !hasSubject) {
    throw new Error('동물과 투명 배경을 구분할 수 있는 이미지를 받지 못했어요.');
  }
  // Encoding RGBA as RGB blends the fur edges against the chosen background.
  return new Promise((resolve, reject) => {
    const chunks = [];
    image.on('data', chunk => chunks.push(chunk));
    image.once('error', reject);
    image.once('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    image.pack();
  });
}

async function generate(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return json(res, 503, { error: '서버에 OPENAI_API_KEY가 설정되지 않았어요.' });
  }

  let form;
  try {
    const body = await readJson(req);
    const images = body && body.images;
    if (!Array.isArray(images) || images.length < 1 || images.length > 6) {
      throw requestError('강아지 또는 고양이 사진을 1장 이상 6장 이하로 넣어주세요.');
    }
    form = new FormData();
    images.forEach((value, index) => {
      const file = imageBlob(value);
      form.append('image[]', file.blob, 'pet-' + (index + 1) + '.' + file.ext);
    });
  } catch (error) {
    return json(res, error.status || 400, { error: error.message || '사진을 읽지 못했어요.' });
  }

  form.append('prompt', PROMPT);
  form.append('model', 'gpt-image-2.6-sunburst');
  form.append('quality', 'high');
  form.append('size', OUTPUT_WIDTH + 'x' + OUTPUT_HEIGHT);
  form.append('n', '1');
  form.append('background', 'transparent');
  form.append('output_format', 'png');

  try {
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
    const output = await composeOutput(b64);
    return json(res, 200, { image: 'data:image/png;base64,' + output });
  } catch (error) {
    return json(res, 502, { error: error.message || '잠시 후 다시 시도해주세요.' });
  }
}

const server = http.createServer((req, res) => {
  let clean;
  try {
    clean = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return json(res, 400, { error: '요청 주소가 올바르지 않아요.' });
  }
  if (req.method === 'POST' && clean === '/api/generate') return generate(req, res);
  if (req.method === 'GET' && clean === '/api/version') return json(res, 200, APP_INFO);
  if (clean.startsWith('/api/')) return json(res, 404, { error: '요청한 기능을 찾을 수 없어요.' });
  if (req.method !== 'GET') return json(res, 405, { error: '허용되지 않은 요청이에요.' });

  const target = path.resolve(PUBLIC, '.' + (clean === '/' ? '/index.html' : clean));
  const relative = path.relative(PUBLIC, target);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    return json(res, 403, { error: '접근할 수 없어요.' });
  }
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
