const filesInput = document.querySelector('#files');
const dropzone = document.querySelector('#dropzone');
const previews = document.querySelector('#previews');
const hint = document.querySelector('#photoHint');
const make = document.querySelector('#make');
const retry = document.querySelector('#retry');
const toast = document.querySelector('#toast');
const panel = document.querySelector('#resultPanel');
const placeholder = panel.querySelector('.result-placeholder');
const loading = panel.querySelector('.loading');
const completed = panel.querySelector('.completed');
const loadingText = document.querySelector('#loadingText');
const resultImage = document.querySelector('#result');
const downloadImage = document.querySelector('#download');
const generationError = document.querySelector('#generationError');
const appVersion = document.querySelector('#appVersion');

let photos = [];
let currentImage = '';
let isGenerating = false;
let isReadingPhotos = false;
let toastTimer;

function fileTimestamp(date = new Date()) {
  const values = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).forEach(part => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  return values.year + values.month + values.day + '_' + values.hour + values.minute + values.second;
}

function say(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

function update() {
  const busy = isGenerating || isReadingPhotos;
  previews.replaceChildren();
  photos.forEach((photo, index) => {
    const el = document.createElement('div');
    el.className = 'thumb';
    const img = document.createElement('img');
    img.src = photo.data;
    img.alt = '반려동물 사진 ' + (index + 1);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', '사진 ' + (index + 1) + ' 삭제');
    remove.disabled = busy;
    remove.onclick = () => {
      if (isGenerating || isReadingPhotos) return;
      photos.splice(index, 1);
      update();
    };
    el.append(img, remove);
    previews.append(el);
  });
  const needed = photos.length < 1;
  hint.textContent = isReadingPhotos ? '사진을 불러오는 중...' : needed ? '사진을 1장 이상 넣어주세요.' : photos.length + '장의 사진이 준비됐어요 ✓';
  hint.classList.toggle('ready', !needed && !isReadingPhotos);
  make.disabled = busy || needed;
  retry.disabled = busy || needed;
  filesInput.disabled = busy;
  dropzone.classList.toggle('disabled', busy);
  make.textContent = isGenerating ? '이미지 만드는 중...' : '이미지 만들기 →';
}

function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .9));
      } catch {
        reject(new Error('사진을 읽지 못했어요.'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('사진을 읽지 못했어요.'));
    };
    img.src = url;
  });
}

async function addFiles(list) {
  if (isGenerating || isReadingPhotos) return;
  const files = [...list];
  const incoming = files.filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
  if (incoming.length !== files.length) say('JPG, PNG, WEBP 사진만 올릴 수 있어요.');
  if (!incoming.length) return;
  if (photos.length + incoming.length > 6) return say('사진은 최대 6장까지 넣을 수 있어요.');
  isReadingPhotos = true;
  update();
  try {
    for (const file of incoming) {
      if (file.size > 8 * 1024 * 1024) {
        say(file.name + ': 8MB 이하 사진을 골라주세요.');
        continue;
      }
      try {
        photos.push({ data: await compress(file) });
      } catch (error) {
        say(error.message);
      }
    }
  } finally {
    isReadingPhotos = false;
    update();
  }
}

filesInput.onchange = event => {
  addFiles(event.target.files);
  event.target.value = '';
};
['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault();
  if (!isGenerating && !isReadingPhotos) dropzone.classList.add('drag');
}));
['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault();
  dropzone.classList.remove('drag');
}));
dropzone.addEventListener('drop', event => addFiles(event.dataTransfer.files));

function verifyImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = () => reject(new Error('완성 이미지를 읽지 못했어요. 다시 시도해주세요.'));
    img.src = source;
  });
}

async function generate() {
  if (isGenerating || isReadingPhotos || !photos.length) return;
  const images = photos.map(photo => photo.data);
  isGenerating = true;
  update();
  panel.setAttribute('aria-busy', 'true');
  generationError.hidden = true;
  generationError.textContent = '';
  placeholder.hidden = true;
  completed.hidden = true;
  loading.hidden = false;
  const messages = [
    '사진 속 생김새와 털무늬를 살펴보는 중...',
    '여백이 넉넉한 전신 구도를 구성하는 중...',
    '녹색 배경에 우리 아이의 특징을 담는 중...',
    '가로 4:3 실사 이미지를 마무리하는 중...'
  ];
  let index = 0;
  loadingText.textContent = messages[index];
  const loadingTimer = setInterval(() => loadingText.textContent = messages[++index % messages.length], 5000);
  if (innerWidth < 850) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '이미지를 만들지 못했어요.');
    if (typeof data.image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data.image)) {
      throw new Error('완성 이미지를 받지 못했어요. 다시 시도해주세요.');
    }
    await verifyImage(data.image);
    currentImage = data.image;
    resultImage.src = currentImage;
    downloadImage.href = currentImage;
    downloadImage.download = 'pet2dvideo_' + fileTimestamp() + '.png';
    completed.hidden = false;
  } catch (error) {
    completed.hidden = !currentImage;
    placeholder.hidden = Boolean(currentImage);
    generationError.textContent = (error.message || '이미지를 만들지 못했어요.') + (currentImage ? ' 이전 이미지는 그대로 보관했어요.' : ' 다시 시도해주세요.');
    generationError.hidden = false;
  } finally {
    clearInterval(loadingTimer);
    loading.hidden = true;
    isGenerating = false;
    panel.setAttribute('aria-busy', 'false');
    update();
  }
}

make.onclick = generate;
retry.onclick = generate;
downloadImage.addEventListener('click', () => {
  downloadImage.download = 'pet2dvideo_' + fileTimestamp() + '.png';
});
update();

async function loadVersion() {
  try {
    const response = await fetch('/api/version', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error('버전 정보를 불러오지 못했어요.');
    const updated = new Date(data.updatedAt);
    const formatted = Number.isNaN(updated.getTime()) ? '확인할 수 없음' : new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(updated);
    appVersion.textContent = '버전 v' + data.version + ' · 최종 수정 ' + formatted + ' (KST)';
  } catch {
    appVersion.textContent = '버전 정보를 불러오지 못했어요.';
  }
}
loadVersion();
