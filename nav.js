let sites = [];
const statusMap = new Map(); // url -> 'ok' | 'fail' | 'checking'
let updateState = false;

function pinnedList() {
  try { return JSON.parse(localStorage.getItem('pinned') || '[]'); } catch (e) { return []; }
}
function setPinned(list) {
  localStorage.setItem('pinned', JSON.stringify(list));
}
function isPinned(url) { return pinnedList().includes(url); }
function togglePin(url) {
  const list = pinnedList();
  const i = list.indexOf(url);
  if (i >= 0) list.splice(i, 1); else list.push(url);
  setPinned(list);
}

async function init() {
  bindEvents();
  const d = await window.api.getData();
  sites = d.items || [];
  render();
  // 可用性：有缓存直接用缓存渲染（返回导航页不再重复检测）；无缓存（首次打开）才检测
  const cache = await window.api.getStatusCache();
  const cached = cache && Object.keys(cache).length > 0;
  if (cached) {
    for (const s of sites) {
      const st = cache[s.url];
      if (st) updateTag(s.url, st.ok ? 'ok' : 'fail');
    }
  } else {
    checkAll();
  }
  // 底部显示当前版本号
  try {
    const ver = await window.api.getVersion();
    const el = document.getElementById('ver');
    if (el && ver) el.textContent = 'v' + ver;
  } catch (e) {}
}

// 进站：过渡层由主进程统一负责（进站瞬间注入 → 站点载入后移除），此处只触发进站
let lastOpenAt = 0;
function openWithLoading(s) {
  // 双击防抖：防止重复触发进站（重复进站是"第二次正在加载"的元凶之一）
  const now = Date.now();
  if (now - lastOpenAt < 800) return;
  lastOpenAt = now;
  window.api.openSite(s.url);
}

function bindEvents() {
  document.getElementById('updateBtn').addEventListener('click', doUpdate);
}

async function doUpdate() {
  if (updateState) return;
  updateState = true;
  const btn = document.getElementById('updateBtn');
  btn.textContent = '更新中…';
  btn.classList.add('updating');
  const r = await window.api.updateData();
  if (r.ok) {
    sites = r.items;
    statusMap.clear();
    render();
    checkAll();
    btn.textContent = '检测更新';
    flashTip('更新成功（' + (r.version || '') + '）');
  } else {
    btn.textContent = '检测更新';
    flashTip('更新失败：' + r.msg);
  }
  btn.classList.remove('updating');
  updateState = false;
}

function flashTip(msg) {
  const old = document.getElementById('flash');
  if (old) old.remove();
  const d = document.createElement('div');
  d.id = 'flash';
  d.textContent = msg;
  d.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);background:#2a2a3a;color:#e5e7eb;padding:8px 20px;border-radius:8px;font-size:13px;z-index:99;box-shadow:0 4px 16px rgba(0,0,0,.4)';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

function render() {
  const main = document.getElementById('grid');
  main.innerHTML = '';
  const pinned = pinnedList();

  const pinnedSites = sites.filter(s => pinned.includes(s.url));
  const restSites = sites.filter(s => !pinned.includes(s.url));

  if (pinnedSites.length) {
    main.appendChild(sectionTitle('★ 已置顶'));
    main.appendChild(cardGrid(pinnedSites));
  }
  if (restSites.length) {
    main.appendChild(sectionTitle('全部站点'));
    main.appendChild(cardGrid(restSites));
  }
}

function sectionTitle(text) {
  const t = document.createElement('div');
  t.className = 'section-title';
  t.textContent = text;
  return t;
}

function cardGrid(list) {
  const g = document.createElement('div');
  g.className = 'grid';
  list.forEach(s => g.appendChild(card(s)));
  return g;
}

function card(s) {
  const el = document.createElement('div');
  el.className = 'card' + (isPinned(s.url) ? ' pinned' : '');
  el.dataset.url = s.url;

  const tag = document.createElement('div');
  tag.className = 'tag checking';
  tag.dataset.tag = s.url;

  const info = document.createElement('div');
  info.className = 'info';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = (isPinned(s.url) ? '★ ' : '') + s.name;
  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = s.desc || '';
  info.appendChild(name);
  info.appendChild(desc);

  el.appendChild(tag);
  el.appendChild(info);

  // 左键点击进站（带加载过渡）
  el.addEventListener('click', () => openWithLoading(s));
  // 右键置顶/取消置顶
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    togglePin(s.url);
    render();
  });
  return el;
}

function updateTag(url, st) {
  const tag = document.querySelector('.tag[data-tag="' + url + '"]');
  if (tag) {
    tag.className = 'tag ' + (st === 'ok' ? 'ok' : st === 'fail' ? 'fail' : 'checking');
  }
}

async function checkAll() {
  for (const s of sites) {
    statusMap.set(s.url, 'checking');
    updateTag(s.url, 'checking');
  }
  await Promise.all(sites.map(async (s) => {
    const r = await window.api.checkSite(s.url);
    statusMap.set(s.url, r.ok ? 'ok' : 'fail');
    updateTag(s.url, r.ok ? 'ok' : 'fail');
  }));
}

init();
