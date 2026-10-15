const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  importMedia: () => ipcRenderer.invoke('import-media'),
  exportVideo: (p) => ipcRenderer.invoke('export', p),
  saveProject: (d) => ipcRenderer.invoke('save-project', d),
  transcribe: (clip, lang) => ipcRenderer.invoke('transcribe', clip, lang),
  onWhisper: (cb) => ipcRenderer.on('whisper-progress', (_e, m) => cb(m)),
  importSrt: () => ipcRenderer.invoke('import-srt'),
  freezeFrame: (videoPath, timeSec) => ipcRenderer.invoke('freeze-frame', videoPath, timeSec),
  openProject: () => ipcRenderer.invoke('open-project'),
  onProgress: (cb) => ipcRenderer.on('export-progress', (_e, s) => cb(s)),
  smartCutout: (imagePath) => ipcRenderer.invoke('smart-cutout', imagePath),
  onCutoutProgress: (cb) => ipcRenderer.on('cutout-progress', (_e, m) => cb(m)),
  getSfxList: () => ipcRenderer.invoke('get-sfx-list'),
  generateSfx: (key) => ipcRenderer.invoke('generate-sfx', key),
  generateFlash: () => ipcRenderer.invoke('generate-flash'),
  importCapCutDraft: () => ipcRenderer.invoke('import-capcut-draft'),
  exportCapCutDraft: (state) => ipcRenderer.invoke('export-capcut-draft', state),
  detectScenes: (videoPath, threshold) => ipcRenderer.invoke('detect-scenes', videoPath, threshold),
  videoMatting: (opts) => ipcRenderer.invoke('video-matting', opts),
  onVideoMattingProgress: (cb) => ipcRenderer.on('video-matting-progress', (_e, data) => cb(data)),
  stabilizeVideo: (opts) => ipcRenderer.invoke('stabilize-video', opts),
  onStabilizeProgress: (cb) => ipcRenderer.on('stabilize-progress', (_e, data) => cb(data))
});

