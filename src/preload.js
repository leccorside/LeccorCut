const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  importMedia: () => ipcRenderer.invoke('import-media'),
  exportVideo: (p) => ipcRenderer.invoke('export', p),
  saveProject: (d) => ipcRenderer.invoke('save-project', d),
  openProject: () => ipcRenderer.invoke('open-project'),
  onProgress: (cb) => ipcRenderer.on('export-progress', (_e, s) => cb(s))
});
