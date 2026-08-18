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
const retopoAction = document.querySelector('#retopoAction');
const makeRetopoButton = document.querySelector('#makeRetopo');
const retopoPanel = document.querySelector('#retopoPanel');
const retopoTitle = document.querySelector('#retopoTitle');
const retopoPercent = document.querySelector('#retopoPercent');
const retopoStatus = document.querySelector('#retopoStatus');
const retopoProgressBar = document.querySelector('#retopoProgressBar');
const retopoViewer = document.querySelector('#retopoViewer');
const retopoViewerHelp = document.querySelector('#retopoViewerHelp');
const retopoLinks = document.querySelector('#retopoLinks');
const retopoSignedNote = document.querySelector('#retopoSignedNote');
const appVersion = document.querySelector('#appVersion');
const ANYTHING_WORLD_UPLOAD_URL = 'https://app.anything.world/animation-rigging';

let photos = [];
let currentImage = '';
let loadingTimer;
let meshyRun = 0;
let retopoRun = 0;
let source3dTaskId = '';
let source3dModelUrl = '';
let toastTimer;
const autoDownloadedTasks = new Set();

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function fileTimestamp(date = new Date()) {
  const values = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).forEach(part => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  return values.year + values.month + values.day + '_' + values.hour + values.minute + values.second;
}

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
    el.innerHTML = '<img src="' + photo.data + '" alt="반려동물 사진 ' + (index + 1) + '"><button aria-label="사진 삭제">×</button>';
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

function resetRetopo() {
  retopoRun += 1;
  retopoAction.hidden = true;
  retopoPanel.hidden = true;
  retopoTitle.textContent = '리토폴로지를 준비하고 있어요';
  retopoPercent.textContent = '0%';
  retopoStatus.textContent = '원본 3D 모델을 확인하는 중...';
  retopoProgressBar.style.width = '0%';
  retopoViewer.hidden = true;
  retopoViewer.classList.remove('ready');
  retopoViewer.removeAttribute('src');
  retopoViewer.removeAttribute('poster');
  retopoViewerHelp.hidden = true;
  retopoViewerHelp.textContent = '경량화 모델을 불러오는 중...';
  retopoLinks.hidden = true;
  retopoLinks.replaceChildren();
  retopoSignedNote.hidden = true;
  makeRetopoButton.disabled = false;
  makeRetopoButton.textContent = '리토폴로지 다시 시도';
}

function reset3d() {
  meshyRun += 1;
  source3dTaskId = '';
  source3dModelUrl = '';
  autoDownloadedTasks.clear();
  resetRetopo();
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
  make3dButton.textContent = '3D·리토폴로지 다시 실행';
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
    await create3d();
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
    IN_PROGRESS: '반려동물의 형태와 질감을 3D로 만들고 있어요...',
    SUCCEEDED: '3D 모델이 완성됐어요.'
  };
  threeDPercent.textContent = Math.round(progress) + '%';
  threeDProgressBar.style.width = progress + '%';
  threeDStatus.textContent = statusMessages[task.status] || '3D 모델을 처리하고 있어요...';
}

function renderGlbDownload(container, task, routePrefix, filenamePrefix) {
  container.replaceChildren();
  const glbUrl = task.modelUrls && task.modelUrls.glb;
  if (typeof glbUrl !== 'string' || !glbUrl) {
    container.hidden = true;
    return null;
  }

  const link = document.createElement('a');
  const updateDownload = () => {
    const stamp = fileTimestamp();
    link.href = task.taskId
      ? routePrefix + '/' + encodeURIComponent(task.taskId) + '/model.glb?download=1&stamp=' + stamp
      : glbUrl;
    link.download = filenamePrefix + '_' + stamp + '.glb';
  };
  updateDownload();
  link.addEventListener('click', updateDownload);
  link.textContent = 'GLB 저장';
  container.append(link);
  container.hidden = false;
  return link;
}

function renderAnythingWorldLink(container) {
  const link = document.createElement('a');
  link.href = ANYTHING_WORLD_UPLOAD_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Anything World에 업로드';
  container.append(link);
  container.hidden = false;
  return link;
}

function autoDownloadGlb(link, task) {
  if (!link) return;
  const key = task.taskId || (task.modelUrls && task.modelUrls.glb);
  if (!key || autoDownloadedTasks.has(key)) return;
  autoDownloadedTasks.add(key);

  setTimeout(() => {
    link.click();
    const filename = link.download;
    retopoSignedNote.textContent = filename + ' 다운로드를 시작했어요. 아래 Anything World 업로드 버튼을 눌러 이 파일을 선택해주세요.';
    say('최종 GLB 다운로드를 시작했어요.');
  }, 200);
}

function show3dResult(task) {
  const glbUrl = task.modelUrls && task.modelUrls.glb;
  if (!glbUrl) throw new Error('완성된 GLB 모델 주소를 받지 못했어요.');
  const viewerUrl = task.viewerUrl || glbUrl;

  threeDTitle.textContent = '3D 모델이 완성됐어요';
  threeDPercent.textContent = '100%';
  threeDProgressBar.style.width = '100%';
  threeDStatus.textContent = '회전 가능한 3D 모델을 불러오는 중...';
  modelViewer.classList.remove('ready');
  modelViewer.setAttribute('camera-controls', '');
  if (task.thumbnailUrl) modelViewer.setAttribute('poster', task.thumbnailUrl);
  modelViewer.setAttribute('src', viewerUrl);
  modelViewer.hidden = false;
  viewerHelp.hidden = false;
  viewerHelp.textContent = '3D 모델을 불러오는 중...';

  modelLinks.replaceChildren();
  modelLinks.hidden = true;
  signedNote.hidden = false;
  source3dTaskId = task.taskId || '';
  source3dModelUrl = glbUrl;
  retopoAction.hidden = true;
  make3dButton.textContent = '3D·리토폴로지 다시 실행';
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

function updateRetopoProgress(task) {
  const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
  const statusMessages = {
    PENDING: 'Meshy 리토폴로지 작업 순서를 기다리고 있어요...',
    IN_PROGRESS: '형태와 텍스처를 유지하며 쿼드 메시를 정리하고 있어요...',
    SUCCEEDED: '경량화 모델이 완성됐어요.'
  };
  retopoPercent.textContent = Math.round(progress) + '%';
  retopoProgressBar.style.width = progress + '%';
  retopoStatus.textContent = statusMessages[task.status] || '리토폴로지를 처리하고 있어요...';
}

function showRetopoResult(task) {
  const glbUrl = task.modelUrls && task.modelUrls.glb;
  if (!glbUrl) throw new Error('리토폴로지가 완료된 GLB 주소를 받지 못했어요.');
  const viewerUrl = task.viewerUrl || glbUrl;

  retopoTitle.textContent = '리토폴로지가 완료됐어요';
  retopoPercent.textContent = '100%';
  retopoProgressBar.style.width = '100%';
  retopoStatus.textContent = '쿼드 8,500 폴리곤 목표로 만든 모델을 불러오는 중...';
  retopoViewer.classList.remove('ready');
  retopoViewer.setAttribute('camera-controls', '');
  if (task.thumbnailUrl) retopoViewer.setAttribute('poster', task.thumbnailUrl);
  retopoViewer.setAttribute('src', viewerUrl);
  retopoViewer.hidden = false;
  retopoViewerHelp.hidden = false;
  retopoViewerHelp.textContent = '경량화 모델을 불러오는 중...';
  const downloadLink = renderGlbDownload(retopoLinks, task, '/api/remesh', 'pet3D');
  renderAnythingWorldLink(retopoLinks);
  retopoSignedNote.hidden = false;
  retopoAction.hidden = true;
  makeRetopoButton.textContent = '리토폴로지 다시 실행';
  autoDownloadGlb(downloadLink, task);
}

retopoViewer.addEventListener('progress', event => {
  if (retopoViewer.hidden || retopoViewer.classList.contains('ready')) return;
  const progress = Math.round(((event.detail && event.detail.totalProgress) || 0) * 100);
  retopoViewerHelp.textContent = '경량화 모델을 불러오는 중... ' + progress + '%';
});

retopoViewer.addEventListener('load', () => {
  if (retopoViewer.hidden) return;
  retopoViewer.classList.add('ready');
  retopoViewer.setAttribute('camera-controls', '');
  retopoStatus.textContent = '경량화 모델이 준비됐어요. 클릭한 채 드래그해 확인해보세요.';
  retopoViewerHelp.textContent = '🖱 클릭 + 드래그: 회전 · 휠: 확대/축소';
});

retopoViewer.addEventListener('error', () => {
  if (retopoViewer.hidden) return;
  retopoViewer.classList.remove('ready');
  retopoStatus.textContent = '경량화 모델을 뷰어에서 불러오지 못했어요. GLB 저장 버튼을 이용해주세요.';
  retopoViewerHelp.textContent = '뷰어 로드 실패 · 아래의 GLB 저장을 이용해주세요.';
});

retopoViewer.addEventListener('pointerdown', () => {
  retopoViewer.focus({ preventScroll: true });
});

async function pollRetopo(taskId, run) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    if (run !== retopoRun) return;

    const response = await fetch('/api/remesh/' + encodeURIComponent(taskId));
    const task = await response.json();
    if (!response.ok) throw new Error(task.error || '리토폴로지 상태를 확인하지 못했어요.');
    if (run !== retopoRun) return;

    updateRetopoProgress(task);
    if (task.status === 'SUCCEEDED') {
      showRetopoResult(task);
      return task;
    }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(task.status)) {
      throw new Error(task.error || 'Meshy 리토폴로지 작업이 완료되지 못했어요.');
    }
    await delay(5000);
  }
  throw new Error('리토폴로지 시간이 너무 오래 걸리고 있어요. 잠시 후 다시 시도해주세요.');
}

async function createRetopo() {
  if (!source3dTaskId && !source3dModelUrl) return say('먼저 원본 3D 모델을 만들어주세요.');

  resetRetopo();
  const run = retopoRun;
  retopoAction.hidden = true;
  retopoPanel.hidden = false;
  makeRetopoButton.disabled = true;
  makeRetopoButton.textContent = '리토폴로지 진행 중...';
  retopoStatus.textContent = '원본 모델을 Meshy Remesh에 전달하는 중...';
  if (innerWidth < 850) retopoPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    const response = await fetch('/api/remesh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: source3dTaskId, modelUrl: source3dModelUrl })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '리토폴로지를 시작하지 못했어요.');
    await pollRetopo(data.taskId, run);
  } catch (error) {
    if (run !== retopoRun) return;
    retopoTitle.textContent = '리토폴로지를 완료하지 못했어요';
    retopoStatus.textContent = error.message || '잠시 후 다시 시도해주세요.';
    retopoAction.hidden = false;
    say(error.message || '리토폴로지를 완료하지 못했어요.');
  } finally {
    if (run === retopoRun) makeRetopoButton.disabled = false;
  }
}

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
      return task;
    }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(task.status)) {
      throw new Error(task.error || 'Meshy의 3D 변환 작업이 완료되지 못했어요.');
    }
    await delay(5000);
  }
  throw new Error('3D 변환 시간이 너무 오래 걸리고 있어요. 잠시 후 다시 시도해주세요.');
}

async function create3d() {
  if (!currentImage) return say('먼저 반려동물 이미지를 만들어주세요.');

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
    const task = await poll3d(data.taskId, run);
    if (!task || run !== meshyRun) return;
    threeDStatus.textContent = '원본 3D가 완성되어 리토폴로지를 자동으로 시작합니다.';
    await createRetopo();
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
make3dButton.onclick = () => create3d();
makeRetopoButton.onclick = () => createRetopo();
downloadImage.addEventListener('click', () => {
  downloadImage.download = 'pet2d_' + fileTimestamp() + '.png';
});
update();

async function loadVersion() {
  try {
    const response = await fetch('/api/version', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error('버전 정보를 불러오지 못했어요.');

    const updated = new Date(data.updatedAt);
    const formatted = Number.isNaN(updated.getTime())
      ? '확인할 수 없음'
      : new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(updated);
    appVersion.textContent = '버전 v' + data.version + ' · 최종 수정 ' + formatted + ' (KST)';
  } catch {
    appVersion.textContent = '버전 정보를 불러오지 못했어요.';
  }
}

loadVersion();
