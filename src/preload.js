const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  importMedia: () => ipcRenderer.invoke('import-media'),
  exportVideo: (p) => ipcRenderer.invoke('export', p),
  saveProject: (d) => ipcRenderer.invoke('save-project', d),
  transcribe: (clip, lang) => ipcRenderer.invoke('transcribe', clip, lang),
  onWhisper: (cb) => ipcRenderer.on('whisper-progress', (_e, m) => cb(m)),
  importSrt: () => ipcRenderer.invoke('import-srt'),
  openProject: () => ipcRenderer.invoke('open-project'),
  onProgress: (cb) => ipcRenderer.on('export-progress', (_e, s) => cb(s))
});
