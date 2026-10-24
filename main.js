const { app, BrowserWindow, ipcMain, WebContentsView } = require('electron');
const path = require('path');
const fs = require('fs');

// 远程数据源：与手机版一致（Goodver/luoxue-tv 仓库），拉取到本地缓存，失败保留旧数据
const REMOTE_SOURCE = 'https://raw.githubusercontent.com/Goodver/luoxue-tv/main/resources/resources.json';
const BUILTIN = path.join(__dirname, 'resources.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.42 Safari/537.36 Edg/135.0.0.0';

// 单窗口架构：整个应用只有一个窗口。
// 导航页与站点页共用该窗口 —— 进站 = 窗口内加载站点，返回 = 站内后退 / 切回导航页；
// 一切 window.open / target=_blank 弹窗都在当前窗口打开，永不新开窗口。
let win = null;
let inSite = false; // 当前是否处于站内浏览状态

// 可用性检测结果缓存：仅应用首次打开（无缓存）时检测，返回导航页直接沿用缓存，不重复检测
const statusCache = new Map();

// 进站加载过渡层（注入到新页面 DOM，站点真正载入后才移除）
const LOADING_INJECT_JS =
  "(function(){"
  + "var old=document.getElementById('lx-global-loading');if(old)old.remove();"
  + "var ov=document.createElement('div');ov.id='lx-global-loading';"
  + "ov.style.cssText='position:fixed;inset:0;z-index:2147483646;background:#12121a;"
  + "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;';"
  + "var st=document.createElement('style');st.textContent='@keyframes lxspin{to{transform:rotate(360deg)}}';"
  + "var sp=document.createElement('div');sp.style.cssText='width:58px;height:58px;"
  + "border:5px solid rgba(124,77,255,.22);border-top-color:#7c4dff;border-radius:50%;animation:lxspin 1s linear infinite;';"
  + "var tx=document.createElement('div');tx.textContent='正在载入…';"
  + "tx.style.cssText='color:#c8c8d7;font-size:16px;letter-spacing:1px;';"
  + "ov.appendChild(sp);ov.appendChild(tx);"
  + "document.documentElement.appendChild(st);document.documentElement.appendChild(ov);"
  + "})()";
const LOADING_REMOVE_JS =
  "(function(){var e=document.getElementById('lx-global-loading');if(e)e.remove();})()";

function localDataPath() {
  return path.join(app.getPath('userData'), 'nav_data.json');
}

// 读取站点数据：优先本地缓存（检测更新后写入），否则用内置 resources.json
function loadItems() {
  try {
    const p = localDataPath();
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j && Array.isArray(j.items) && j.items.length) return j;
    }
  } catch (e) {}
  try {
    const j = JSON.parse(fs.readFileSync(BUILTIN, 'utf8'));
    if (j && Array.isArray(j.items)) return j;
  } catch (e) {}
  return { version: '', items: [] };
}

// 返回按钮：窗口级独立视图（WebContentsView），永远悬浮在网页之上，站点任何元素都无法遮挡。
// 生命周期：进站时创建，返回导航时彻底销毁 —— 导航页任何时刻都不存在返回键视图。
let backView = null;

function showBackView() {
  if (!win || win.isDestroyed()) return;
  hideBackView();
  backView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'btn-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  backView.setBackgroundColor('#00000000');
  backView.webContents.loadFile('btn.html');
  try { win.contentView.addChildView(backView); } catch (e) {}
  backView.setBounds({ x: 18, y: 14, width: 110, height: 40 });
}

function hideBackView() {
  if (!win || win.isDestroyed() || !backView) return;
  try { win.contentView.removeChildView(backView); } catch (e) {}
  try { if (!backView.webContents.isDestroyed()) backView.webContents.close(); } catch (e) {}
  backView = null;
}

function showNav() {
  inSite = false;
  hideBackView();
  win.loadFile('nav.html');
}

function createMainWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 760,
    minHeight: 560,
    title: '洛雪影视导航',
    backgroundColor: '#12121a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile('nav.html');

  // 返回键生命周期判定：当前页面是导航页（本地文件）即注销返回键视图。
  // 判定只看页面类型，不依赖任何状态标志 —— 导航页任何时刻都不可能残留返回键。
  win.webContents.on('did-finish-load', () => {
    const u = win.webContents.getURL();
    if (u && u.startsWith('file:')) hideBackView();
  });

  // 单窗口铁律：任何 new-window / target=_blank 一律在本窗口打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:/.test(url)) {
      inSite = true;
      setImmediate(() => win.loadURL(url));
    }
    return { action: 'deny' };
  });

  // Esc = 返回（站内后退 / 无历史切回导航页）
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      back();
    }
  });

  win.on('closed', () => { win = null; });
}

// 进站：唯一窗口直接加载站点（保持程序当前大小/位置，不跳变）
// 过渡层只注入一次：进站瞬间在导航页显示"正在加载"。
// 导航页文档会一直显示过渡层直到站点页面提交（站点加载完成），切换瞬间过渡层自然消失。
// 绝无二次注入、二次判定 —— 不存在"第二次正在加载"的可能。
let navSession = 0;

function openSite(url) {
  if (!win || win.isDestroyed()) return;
  const session = ++navSession;
  inSite = true;
  const wc = win.webContents;
  // 只注入一次过渡层（作用于当前导航页文档）
  wc.executeJavaScript(LOADING_INJECT_JS, true).catch(() => {});
  // 兜底：导航失败留在导航页时，确保过渡层被移除
  wc.once('did-fail-load', () => {
    if (session === navSession) wc.executeJavaScript(LOADING_REMOVE_JS, true).catch(() => {});
  });
  wc.loadURL(url);
  // 返回键仅在进站时加载
  showBackView();
}

// 返回：站内网页历史后退；无上一页时切回导航页
function back() {
  if (!win || win.isDestroyed()) return;
  if (!inSite) return; // 导航页内不处理
  if (win.webContents.canGoBack()) {
    win.webContents.goBack();
  } else {
    showNav();
  }
}

// 返回按钮点击（进站页面左上角悬浮按钮）
ipcMain.on('nav-back', () => back());

// 可用性检测：HEAD 优先，失败回退 GET；8 秒超时
async function probe(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  const t0 = Date.now();
  const attempt = async (method) => {
    const res = await fetch(url, {
      method,
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': '*/*' }
    });
    return res;
  };
  try {
    let res;
    try {
      res = await attempt('HEAD');
    } catch (e) {
      res = await attempt('GET');
    }
    clearTimeout(timer);
    return { ok: res.status >= 200 && res.status < 400, status: res.status, ms: Date.now() - t0 };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, ms: Date.now() - t0 };
  }
}

ipcMain.handle('get-data', () => loadItems());

ipcMain.handle('get-version', () => app.getVersion());

// 返回检测结果缓存（首次打开检测后缓存，返回导航页不再重复检测）
ipcMain.handle('get-status-cache', () => {
  return Object.fromEntries(statusCache);
});

ipcMain.handle('check-site', async (e, url) => {
  const r = await probe(url);
  statusCache.set(url, r);
  return r;
});

ipcMain.handle('update-data', async () => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(REMOTE_SOURCE, {
      signal: ac.signal,
      headers: { 'User-Agent': UA }
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, msg: '拉取失败 HTTP ' + res.status };
    const j = await res.json();
    if (!j || !Array.isArray(j.items) || !j.items.length) {
      return { ok: false, msg: '数据格式异常，已保留本地清单' };
    }
    fs.writeFileSync(localDataPath(), JSON.stringify(j, null, 1), 'utf8');
    // 站点清单已更新，清空检测缓存，让导航页对新清单重新检测
    statusCache.clear();
    return { ok: true, items: j.items, version: j.version || '' };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, msg: '网络错误，已保留本地清单' };
  }
});

ipcMain.handle('open-site', (e, url) => { openSite(url); });

app.whenReady().then(() => {
  createMainWindow();
});
app.on('window-all-closed', () => app.quit());
