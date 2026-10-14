const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, backgroundColor: '#0e0f14',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, webSecurity: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.handle('import-media', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Mídia', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'jpeg'] }]
  });
  if (r.canceled) return [];
  const out = [];
  for (const p of r.filePaths) out.push(await probe(p));
  return out;
});

function probe(p) {
  return new Promise((resolve) => {
    execFile(ffprobePath, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', p], (err, stdout) => {
      let info = { path: p, name: path.basename(p), duration: 5, hasVideo: false, hasAudio: false, isImage: false };
      try {
        const j = JSON.parse(stdout);
        info.hasVideo = j.streams.some(s => s.codec_type === 'video');
        info.hasAudio = j.streams.some(s => s.codec_type === 'audio');
        info.isImage = /\.(png|jpe?g)$/i.test(p);
        if (!info.isImage) info.duration = parseFloat(j.format.duration) || 5;
      } catch (e) {}
      resolve(info);
    });
  });
}

ipcMain.handle('export', async (_e, project) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'leccorcut.mp4', filters: [{ name: 'MP4', extensions: ['mp4'] }] });
  if (r.canceled) return { ok: false };
  const { args } = buildFfmpeg(project, r.filePath);
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, args);
    let log = '';
    p.stderr.on('data', d => {
      log += d; const m = /time=(\d+):(\d+):([\d.]+)/.exec(d.toString());
      if (m) win.webContents.send('export-progress', (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]));
    });
    p.on('close', code => resolve({ ok: code === 0, path: r.filePath, log: code === 0 ? '' : log.slice(-1500) }));
  });
});

let asrPromise = null;
async function getAsr() {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(app.getPath('userData'), 'models');
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        progress_callback: (p) => { if (p.status === 'progress') win.webContents.send('whisper-progress', `Baixando modelo... ${Math.round(p.progress)}%`); }
      });
    })().catch((e) => { asrPromise = null; throw e; });
  }
  return asrPromise;
}

function extractPcm(clip) {
  return new Promise((resolve, reject) => {
    const sp = clip.speed || 1;
    const p = spawn(ffmpegPath, ['-v', 'error', '-ss', String(clip.in), '-t', String(clip.duration * sp), '-i', clip.path, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
    const bufs = []; let err = '';
    p.stdout.on('data', d => bufs.push(d)); p.stderr.on('data', d => err += d);
    p.on('close', code => {
      if (code !== 0) return reject(new Error(err.slice(-300)));
      const b = Buffer.concat(bufs);
      resolve(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)));
    });
  });
}

ipcMain.handle('transcribe', async (_e, clip, language) => {
  try {
    const asr = await getAsr();
    win.webContents.send('whisper-progress', 'Transcrevendo...');
    const audio = await extractPcm(clip);
    const out = await asr(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, language: language || 'portuguese', task: 'transcribe' });
    const chunks = (out.chunks || []).map(c => ({ text: c.text.trim(), start: c.timestamp[0] || 0, end: c.timestamp[1] ?? (c.timestamp[0] + 2) })).filter(c => c.text);
    return { ok: true, chunks };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('import-srt', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Legendas SRT', extensions: ['srt'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

ipcMain.handle('save-project', async (_e, data) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'projeto.lccut', filters: [{ name: 'LeccorCut', extensions: ['lccut'] }] });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2)); return true;
});
ipcMain.handle('open-project', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'LeccorCut', extensions: ['lccut'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019").replace(/%/g, '\\%');

// Trilha principal: clips em sequência. Textos: sobreposição por tempo.
function buildFfmpeg(project, outPath) {
  const W = 1280, H = 720, FPS = 30;
  const clips = project.clips;
  const args = [];
  const f = [];
  clips.forEach((c, i) => {
    if (c.isImage) args.push('-loop', '1', '-t', String(c.duration), '-i', c.path);
    else args.push('-i', c.path);
  });
  let concatIn = '';
  clips.forEach((c, i) => {
    const fl = c.filters || {};
    const speed = c.speed || 1;
    let v = `[${i}:v]` + (c.isImage ? '' : `trim=start=${c.in}:end=${c.in + c.duration * speed},setpts=(PTS-STARTPTS)/${speed},`)
      + (c.isImage ? 'setpts=PTS-STARTPTS,' : '')
      + `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},`
      + ((fl.zoom || 1) > 1 ? `scale=${Math.round(W * fl.zoom)}:${Math.round(H * fl.zoom)},crop=${W}:${H},` : '')
      + (fl.hflip ? 'hflip,' : '') + (fl.vflip ? 'vflip,' : '')
      + (fl.rotate === 180 ? 'hflip,vflip,' : '')
      + (fl.rotate === 90 ? `transpose=1,scale=${W}:${H},` : fl.rotate === 270 ? `transpose=2,scale=${W}:${H},` : '')
      + `eq=brightness=${(fl.brightness || 0) / 100}:contrast=${1 + (fl.contrast || 0) / 100}:saturation=${1 + (fl.saturation || 0) / 100}`;
    if (fl.blur) v += `,gblur=sigma=${fl.blur}`;
    if (fl.grayscale) v += ',hue=s=0';
    if (fl.fade) v += `,fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, c.duration - 0.5)}:d=0.5`;
    f.push(v + `[v${i}]`);
    if (c.hasAudio && !c.isImage) {
      const tempo = speed !== 1 ? `,atempo=${speed}` : '';
      f.push(`[${i}:a]atrim=start=${c.in}:end=${c.in + c.duration * speed},asetpts=PTS-STARTPTS${tempo},volume=${c.volume ?? 1},aresample=44100,aformat=channel_layouts=stereo[a${i}]`);
    } else {
      f.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${c.duration}[a${i}]`);
    }
    concatIn += `[v${i}][a${i}]`;
  });
  const anyT = clips.some(c => c.transition && c.transition !== 'none');
  if (!anyT || clips.length === 1) {
    f.push(`${concatIn}concat=n=${clips.length}:v=1:a=1[vc][ac0]`);
  } else {
    let vP = 'v0', aP = 'a0', L = clips[0].duration;
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1], cur = clips[i];
      const has = prev.transition && prev.transition !== 'none';
      const t = has ? prev.transition : 'fade';
      const d = has ? Math.max(0.05, Math.min(0.5, prev.duration / 2, cur.duration / 2)) : 0.04;
      f.push(`[${vP}][v${i}]xfade=transition=${t}:duration=${d}:offset=${(L - d).toFixed(3)}[xv${i}]`);
      f.push(`[${aP}][a${i}]acrossfade=d=${d}[xa${i}]`);
      vP = `xv${i}`; aP = `xa${i}`; L += cur.duration - d;
    }
    f.push(`[${vP}]null[vc]`, `[${aP}]anull[ac0]`);
  }
  const audios = project.audios || [];
  let aOut = 'ac0';
  if (audios.length) {
    audios.forEach((a, j) => {
      const idx = clips.length + j; args.push('-i', a.path);
      const ms = Math.round(a.start * 1000);
      f.push(`[${idx}:a]atrim=start=${a.in || 0}:end=${(a.in || 0) + a.duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1},aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[m${j}]`);
    });
    const n = audios.length + 1;
    f.push(`[ac0]${audios.map((_, j) => `[m${j}]`).join('')}amix=inputs=${n}:duration=first:dropout_transition=0,volume=${n}[acm]`);
    aOut = 'acm';
  }
  let last = 'vc';
  (project.overlays || []).forEach((o, k) => {
    const idx = clips.length + audios.length + k;
    if (o.isImage) args.push('-loop', '1', '-t', String(o.duration), '-i', o.path); else args.push('-i', o.path);
    const trim = o.isImage ? '' : `trim=start=${o.in || 0}:end=${(o.in || 0) + o.duration},`;
    const ck = o.chroma ? `colorkey=color=0x${(o.chromaColor || '#00ff00').slice(1)}:similarity=${o.chromaSim ?? 0.3}:blend=0.1,` : '';
    f.push(`[${idx}:v]${trim}setpts=PTS-STARTPTS+${o.start}/TB,scale=${Math.round(W * o.scale / 100 / 2) * 2}:-2,${ck}format=yuva420p,colorchannelmixer=aa=${o.opacity}[ov${k}]`);
    const pr = o.motion ? `min(1,max(0,(t-${o.start})/${o.duration}))` : '0';
    const ex = o.motion ? `(${o.x}+(${o.x2 ?? o.x}-${o.x})*${pr})` : `${o.x}`, ey = o.motion ? `(${o.y}+(${o.y2 ?? o.y}-${o.y})*${pr})` : `${o.y}`;
    f.push(`[${last}][ov${k}]overlay=x='(W-w)*${ex}':y='(H-h)*${ey}':enable='between(t,${o.start},${o.start + o.duration})':eof_action=pass[o${k}]`);
    last = `o${k}`;
  });
  (project.texts || []).forEach((t, i) => {
    f.push(`[${last}]drawtext=text='${esc(t.text)}':fontcolor=${t.color || 'white'}:fontsize=${t.size || 48}:x=(w-text_w)/2:y=${t.y ?? 'h-th-80'}:borderw=2:bordercolor=black:enable='between(t,${t.start},${t.start + t.duration})'[t${i}]`);
    last = `t${i}`;
  });
  args.push('-filter_complex', f.join(';'), '-map', `[${last}]`, '-map', `[${aOut}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-y', outPath);
  return { args };
}
