const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('get-data'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  getStatusCache: () => ipcRenderer.invoke('get-status-cache'),
  checkSite: (url) => ipcRenderer.invoke('check-site', url),
  updateData: () => ipcRenderer.invoke('update-data'),
  openSite: (url) => ipcRenderer.invoke('open-site', url)
});
