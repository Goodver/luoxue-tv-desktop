const { ipcRenderer } = require('electron');

// 返回按钮视图：点击 → 主进程执行返回（站内后退 / 无历史切回导航）
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('back');
  if (btn) btn.addEventListener('click', () => ipcRenderer.send('nav-back'));
});
