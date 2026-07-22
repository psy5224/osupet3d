const filesInput = document.querySelector('#files');
const dropzone = document.querySelector('#dropzone');
const previews = document.querySelector('#previews');
const hint = document.querySelector('#photoHint');
const make = document.querySelector('#make');
const toast = document.querySelector('#toast');
const panel = document.querySelector('#resultPanel');
const placeholder = panel.querySelector('.result-placeholder');
const loading = panel.querySelector('.loading');
const completed = panel.querySelector('.completed');
const loadingText = document.querySelector('#loadingText');
const resultImage = document.querySelector('#result');
const downloadImage = document.querySelector('#download');
const make3dButton = document.querySelector('#make3d');
const threeDPanel = document.querySelector('#threeDPanel');
const threeDTitle = document.querySelector('#threeDTitle');
const threeDPercent = document.querySelector('#threeDPercent');
const threeDStatus = document.querySelector('#threeDStatus');
const threeDProgressBar = document.querySelector('#threeDProgressBar');
const modelViewer = document.querySelector('#modelViewer');
const viewerHelp = document.querySelector('#viewerHelp');
const modelLinks = document.querySelector('#modelLinks');
const signedNote = document.querySelector('#signedNote');

let photos = [];
let currentImage = '';
let loadingTimer;
let meshyRun = 0;
let toastTimer;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const say = message => {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
};

function update() {
  previews.innerHTML = '';
  photos.forEach((photo, index) => {
    const el = document.createElement('div');
    el.className = 'thumb';
    el.innerHTML = '<img src="' + photo.data + '" alt="강아지 사진 ' + (index + 1) + '"><button aria-label="사진 삭제">×</button>';
    el.querySelector('button').onclick = () => {
      photos.splice(index, 1);
      update();
    };
    previews.append(el);
  });

  const needed = photos.length < 1;
  hint.textContent = needed ? '사진을 1장 이상 넣어주세요.' : photos.length + '장의 사진이 준비됐어요 ✓';
  hint.classList.toggle('ready', !needed);
  make.disabled = needed;
}

function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', .9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('사진을 읽지 못했어요.'));
    };
    img.src = url;
  });
}

async function addFiles(list) {
  const incoming = [...list].filter(file => file.type.startsWith('image/'));
  if (photos.length + incoming.length > 6) return say('사진은 최대 6장까지 넣을 수 있어요.');

  for (const file of incoming) {
    if (file.size > 8 * 1024 * 1024) {
      say(file.name + ': 8MB 이하 사진을 골라주세요.');
      continue;
    }
    try {
      photos.push({ data: await compress(file) });
    } catch {
      say('사진을 읽지 못했어요.');
    }
  }
  update();
}

filesInput.onchange = event => {
  addFiles(event.target.files);
  event.target.value = '';
};

['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault();
  dropzone.classList.add('drag');
}));

['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault();
  dropzone.classList.remove('drag');
}));

dropzone.addEventListener('drop', event => addFiles(event.dataTransfer.files));

function reset3d() {
  meshyRun += 1;
  threeDPanel.hidden = true;
  threeDTitle.textContent = '3D 모델을 만들고 있어요';
  threeDPercent.textContent = '0%';
  threeDStatus.textContent = 'Meshy 작업을 준비하는 중...';
  threeDProgressBar.style.width = '0%';
  modelViewer.hidden = true;
  modelViewer.classList.remove('ready');
  modelViewer.removeAttribute('src');
  modelViewer.removeAttribute('poster');
  viewerHelp.hidden = true;
  viewerHelp.textContent = '3D 모델을 불러오는 중...';
  modelLinks.hidden = true;
  modelLinks.replaceChildren();
  signedNote.hidden = true;
  make3dButton.disabled = false;
  make3dButton.textContent = '3D 모델 만들기';
}

async function generate() {
  reset3d();
  currentImage = '';
  make.disabled = true;
  placeholder.hidden = true;
  completed.hidden = true;
  loading.hidden = false;

  const messages = [
    '사진 속 특징을 살펴보는 중...',
    '생김새와 표정을 스케치하는 중...',
    '동화풍 색을 한 겹씩 칠하는 중...',
    '1:1 정사각형 그림을 마무리하는 중...'
  ];
  let index = 0;
  loadingTimer = setInterval(() => loadingText.textContent = messages[++index % messages.length], 4000);
  if (innerWidth < 850) panel.scrollIntoView({ behavior: 'smooth' });

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: photos.map(photo => photo.data) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    currentImage = data.image;
    resultImage.src = currentImage;
    downloadImage.href = currentImage;
    loading.hidden = true;
    completed.hidden = false;
  } catch (error) {
    loading.hidden = true;
    placeholder.hidden = false;
    say(error.message || '그림을 만들지 못했어요.');
  } finally {
    clearInterval(loadingTimer);
    make.disabled = photos.length < 1;
  }
}

function update3dProgress(task) {
  const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
  const statusMessages = {
    PENDING: 'Meshy 작업 순서를 기다리고 있어요...',
    IN_PROGRESS: '강아지의 형태와 질감을 3D로 만들고 있어요...',
    SUCCEEDED: '3D 모델이 완성됐어요.'
  };
  threeDPercent.textContent = Math.round(progress) + '%';
  threeDProgressBar.style.width = progress + '%';
  threeDStatus.textContent = statusMessages[task.status] || '3D 모델을 처리하고 있어요...';
}

function show3dResult(task) {
  const glbUrl = task.modelUrls && task.modelUrls.glb;
  if (!glbUrl) throw new Error('완성된 GLB 모델 주소를 받지 못했어요.');

  threeDTitle.textContent = '3D 모델이 완성됐어요';
  threeDPercent.textContent = '100%';
  threeDProgressBar.style.width = '100%';
  threeDStatus.textContent = '회전 가능한 3D 모델을 불러오는 중...';
  modelViewer.classList.remove('ready');
  modelViewer.setAttribute('camera-controls', '');
  if (task.thumbnailUrl) modelViewer.setAttribute('poster', task.thumbnailUrl);
  modelViewer.setAttribute('src', glbUrl);
  modelViewer.hidden = false;
  viewerHelp.hidden = false;
  viewerHelp.textContent = '3D 모델을 불러오는 중...';

  const labels = { glb: 'GLB 저장', fbx: 'FBX 저장', obj: 'OBJ 저장', usdz: 'USDZ 저장', stl: 'STL 저장' };
  modelLinks.replaceChildren();
  Object.entries(task.modelUrls || {}).forEach(([format, url]) => {
    if (!labels[format] || typeof url !== 'string') return;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = labels[format];
    modelLinks.append(link);
  });
  modelLinks.hidden = modelLinks.childElementCount === 0;
  signedNote.hidden = false;
  make3dButton.textContent = '3D 다시 만들기';
}

modelViewer.addEventListener('progress', event => {
  if (modelViewer.hidden || modelViewer.classList.contains('ready')) return;
  const progress = Math.round(((event.detail && event.detail.totalProgress) || 0) * 100);
  viewerHelp.textContent = '3D 모델을 불러오는 중... ' + progress + '%';
});

modelViewer.addEventListener('load', () => {
  if (modelViewer.hidden) return;
  modelViewer.classList.add('ready');
  modelViewer.setAttribute('camera-controls', '');
  threeDStatus.textContent = '모델 위에서 클릭한 채 좌우로 드래그해 돌려보세요.';
  viewerHelp.textContent = '🖱 클릭 + 드래그: 회전 · 휠: 확대/축소';
});

modelViewer.addEventListener('error', () => {
  if (modelViewer.hidden) return;
  modelViewer.classList.remove('ready');
  threeDStatus.textContent = '3D 모델 파일을 불러오지 못했어요. GLB 저장 버튼으로 파일을 확인해주세요.';
  viewerHelp.textContent = '뷰어 로드 실패 · 아래의 GLB 저장을 이용해주세요.';
});

modelViewer.addEventListener('pointerdown', () => {
  modelViewer.focus({ preventScroll: true });
});

async function poll3d(taskId, run) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    if (run !== meshyRun) return;

    const response = await fetch('/api/3d/' + encodeURIComponent(taskId));
    const task = await response.json();
    if (!response.ok) throw new Error(task.error || '3D 작업 상태를 확인하지 못했어요.');
    if (run !== meshyRun) return;

    update3dProgress(task);
    if (task.status === 'SUCCEEDED') {
      show3dResult(task);
      return;
    }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(task.status)) {
      throw new Error(task.error || 'Meshy의 3D 변환 작업이 완료되지 못했어요.');
    }
    await delay(5000);
  }
  throw new Error('3D 변환 시간이 너무 오래 걸리고 있어요. 잠시 후 다시 시도해주세요.');
}

async function create3d() {
  if (!currentImage) return say('먼저 강아지 이미지를 만들어주세요.');

  reset3d();
  const run = meshyRun;
  threeDPanel.hidden = false;
  make3dButton.disabled = true;
  make3dButton.textContent = '3D 변환 중...';
  threeDStatus.textContent = '생성된 이미지를 Meshy에 전달하는 중...';
  if (innerWidth < 850) threeDPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    const response = await fetch('/api/3d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: currentImage })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '3D 변환을 시작하지 못했어요.');
    await poll3d(data.taskId, run);
  } catch (error) {
    if (run !== meshyRun) return;
    threeDTitle.textContent = '3D 변환을 완료하지 못했어요';
    threeDStatus.textContent = error.message || '잠시 후 다시 시도해주세요.';
    say(error.message || '3D 모델을 만들지 못했어요.');
  } finally {
    if (run === meshyRun) make3dButton.disabled = false;
  }
}

make.onclick = generate;
document.querySelector('#retry').onclick = generate;
make3dButton.onclick = create3d;
update();
