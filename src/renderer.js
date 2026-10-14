const $ = (id) => document.getElementById(id);
const state = { media: [], clips: [], texts: [], selected: null, time: 0, playing: false };
const player = $('player'), img = $('imgPlayer');
let pxPerSec = 60, uid = 1, raf = null, lastTs = 0;

const total = () => state.clips.reduce((s, c) => s + c.duration, 0);
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const toast = (m) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 3500); };
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

function clipAt(t) {
  let acc = 0;
  for (const c of state.clips) { if (t < acc + c.duration) return { c, local: t - acc, start: acc }; acc += c.duration; }
  return null;
}

function cssFilter(f = {}) {
  return `brightness(${1 + (f.brightness || 0) / 100}) contrast(${1 + (f.contrast || 0) / 100}) saturate(${1 + (f.saturation || 0) / 100}) blur(${f.blur || 0}px) grayscale(${f.grayscale ? 1 : 0})`;
}

function renderPreview() {
  const hit = clipAt(state.time);
  const view = hit ? hit.c : null;
  $('textLayer').innerHTML = '';
  state.texts.filter(t => state.time >= t.start && state.time < t.start + t.duration).forEach(t => {
    const s = document.createElement('span'); s.textContent = t.text; s.style.color = t.color; s.style.fontSize = (t.size / 720 * $('stage').clientHeight) + 'px';
    $('textLayer').appendChild(s);
  });
  if (!view) { player.removeAttribute('src'); img.hidden = true; player.style.visibility = 'hidden'; updateTime(); return; }
  player.style.visibility = 'visible';
  const src = fileUrl(view.path);
  const f = cssFilter(view.filters);
  if (view.isImage) { img.hidden = false; player.style.visibility = 'hidden'; if (img.src !== src) img.src = src; img.style.filter = f; }
  else {
    img.hidden = true;
    if (player.dataset.src !== src) { player.src = src; player.dataset.src = src; }
    player.style.filter = f; player.playbackRate = view.speed || 1;
    player.muted = false; player.volume = Math.min(1, view.volume ?? 1);
    const target = view.in + hit.local * (view.speed || 1);
    if (!state.playing || Math.abs(player.currentTime - target) > 0.3) player.currentTime = target;
    if (state.playing && player.paused) player.play().catch(() => {});
  }
  updateTime();
}

function updateTime() {
  $('timeLabel').textContent = `${fmt(state.time)} / ${fmt(total())}`;
  $('playhead').style.left = (12 + state.time * pxPerSec) + 'px';
}

function tick(ts) {
  if (!state.playing) return;
  state.time += (ts - lastTs) / 1000; lastTs = ts;
  if (state.time >= total()) { state.time = total(); setPlaying(false); }
  renderPreview(); raf = requestAnimationFrame(tick);
}
function setPlaying(p) {
  state.playing = p && total() > 0; $('btnPlay').textContent = state.playing ? '⏸' : '▶';
  if (state.playing) { if (state.time >= total()) state.time = 0; lastTs = performance.now(); raf = requestAnimationFrame(tick); }
  else { player.pause(); cancelAnimationFrame(raf); }
}

function renderTimeline() {
  const tv = $('trackVideo'), tt = $('trackText'), ru = $('ruler');
  tv.innerHTML = tt.innerHTML = ru.innerHTML = '';
  const dur = Math.max(total(), 30);
  ru.style.width = tv.style.width = tt.style.width = (dur * pxPerSec) + 'px';
  for (let s = 0; s < dur; s += 5) { const k = document.createElement('div'); k.className = 'tick'; k.style.left = s * pxPerSec + 'px'; k.textContent = s + 's'; ru.appendChild(k); }
  let acc = 0;
  state.clips.forEach(c => {
    const e = document.createElement('div'); e.className = 'clip' + (state.selected?.id === c.id ? ' sel' : '');
    e.style.left = acc * pxPerSec + 'px'; e.style.width = c.duration * pxPerSec + 'px'; e.textContent = c.name;
    e.onclick = (ev) => { ev.stopPropagation(); select({ kind: 'clip', id: c.id }); };
    tv.appendChild(e); acc += c.duration;
  });
  state.texts.forEach(t => {
    const e = document.createElement('div'); e.className = 'clip text' + (state.selected?.id === t.id ? ' sel' : '');
    e.style.left = t.start * pxPerSec + 'px'; e.style.width = t.duration * pxPerSec + 'px'; e.textContent = 'T: ' + t.text;
    e.onclick = (ev) => { ev.stopPropagation(); select({ kind: 'text', id: t.id }); };
    tt.appendChild(e);
  });
  updateTime();
}

function select(s) { state.selected = s; renderTimeline(); renderProps(); }

function slider(label, key, min, max, obj) {
  return `<div class="prop">${label}<input type="range" min="${min}" max="${max}" value="${obj[key] || 0}" data-k="${key}"></div>`;
}

function renderProps() {
  const p = $('props'); const s = state.selected;
  if (!s) { p.innerHTML = '<p class="hint">Selecione um clipe na timeline.</p>'; return; }
  if (s.kind === 'text') {
    const t = state.texts.find(x => x.id === s.id); if (!t) return;
    p.innerHTML = `<div class="prop">Duração (s)<input type="number" id="pDur" value="${t.duration}" min="0.5" step="0.5"></div>`;
    $('pDur').onchange = (e) => { t.duration = +e.target.value; renderTimeline(); renderPreview(); };
    return;
  }
  const c = state.clips.find(x => x.id === s.id); if (!c) return;
  c.filters = c.filters || {};
  p.innerHTML = slider('Brilho', 'brightness', -50, 50, c.filters) + slider('Contraste', 'contrast', -50, 100, c.filters)
    + slider('Saturação', 'saturation', -100, 100, c.filters) + slider('Desfoque', 'blur', 0, 20, c.filters)
    + `<div class="prop"><label><input type="checkbox" id="pGray" ${c.filters.grayscale ? 'checked' : ''}> P&B</label></div>
       <div class="prop"><label><input type="checkbox" id="pFade" ${c.filters.fade ? 'checked' : ''}> Fade in/out</label></div>
       <div class="prop">Velocidade<select id="pSpeed">${[0.5, 1, 1.5, 2].map(v => `<option ${c.speed === v || (!c.speed && v === 1) ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
       <div class="prop">Volume<input type="range" id="pVol" min="0" max="1" step="0.05" value="${c.volume ?? 1}"></div>`;
  p.querySelectorAll('input[data-k]').forEach(i => i.oninput = () => { c.filters[i.dataset.k] = +i.value; renderPreview(); });
  $('pGray').onchange = (e) => { c.filters.grayscale = e.target.checked; renderPreview(); };
  $('pFade').onchange = (e) => { c.filters.fade = e.target.checked; };
  $('pVol').oninput = (e) => { c.volume = +e.target.value; renderPreview(); };
  $('pSpeed').onchange = (e) => {
    const sp = +e.target.value, old = c.speed || 1;
    c.duration = c.duration * old / sp; c.speed = sp; renderTimeline(); renderPreview();
  };
}

function split() {
  const hit = clipAt(state.time); if (!hit || hit.local < 0.1 || hit.c.duration - hit.local < 0.1) return toast('Posicione o cursor dentro de um clipe');
  const c = hit.c, sp = c.speed || 1, idx = state.clips.indexOf(c);
  const b = { ...c, id: uid++, filters: { ...(c.filters || {}) }, in: c.in + hit.local * sp, duration: c.duration - hit.local };
  c.duration = hit.local; state.clips.splice(idx + 1, 0, b); renderTimeline();
}
function del() {
  const s = state.selected; if (!s) return;
  if (s.kind === 'clip') state.clips = state.clips.filter(c => c.id !== s.id); else state.texts = state.texts.filter(t => t.id !== s.id);
  state.selected = null; renderTimeline(); renderProps(); renderPreview();
}

function renderMedia() {
  const l = $('mediaList'); l.innerHTML = '';
  state.media.forEach(m => {
    const e = document.createElement('div'); e.className = 'media-item'; e.innerHTML = `${m.name}<small>${m.duration.toFixed(1)}s${m.hasAudio ? ' · áudio' : ''}</small>`;
    e.onclick = () => { state.clips.push({ id: uid++, ...m, in: 0, filters: {}, speed: 1, volume: 1 }); renderTimeline(); renderPreview(); };
    l.appendChild(e);
  });
}

$('btnImport').onclick = async () => { state.media.push(...await window.api.importMedia()); renderMedia(); };
$('btnPlay').onclick = () => setPlaying(!state.playing);
$('btnSplit').onclick = split; $('btnDelete').onclick = del;
$('btnAddText').onclick = () => {
  const v = $('txtInput').value.trim(); if (!v) return;
  state.texts.push({ id: uid++, text: v, color: $('txtColor').value, size: +$('txtSize').value, start: state.time, duration: 3 });
  renderTimeline(); renderPreview();
};
$('zoom').oninput = (e) => { pxPerSec = +e.target.value; renderTimeline(); };
$('ruler').onclick = (e) => { state.time = Math.max(0, (e.clientX - $('ruler').getBoundingClientRect().left) / pxPerSec); renderPreview(); };
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 's' || e.key === 'S') split(); else if (e.key === 'Delete') del(); else if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
});
$('btnSave').onclick = async () => { if (await window.api.saveProject({ media: state.media, clips: state.clips, texts: state.texts })) toast('Projeto salvo'); };
$('btnOpen').onclick = async () => {
  const d = await window.api.openProject(); if (!d) return;
  Object.assign(state, { media: d.media, clips: d.clips, texts: d.texts, selected: null, time: 0 });
  uid = 1 + Math.max(0, ...state.clips.map(c => c.id), ...state.texts.map(t => t.id));
  renderMedia(); renderTimeline(); renderProps(); renderPreview();
};
$('btnExport').onclick = async () => {
  if (!state.clips.length) return toast('Adicione clipes à timeline');
  toast('Exportando...'); window.api.onProgress(s => toast(`Exportando... ${Math.min(99, Math.round(s / total() * 100))}%`));
  const r = await window.api.exportVideo({ clips: state.clips, texts: state.texts });
  toast(r.ok ? 'Exportado: ' + r.path : (r.log ? 'Erro: ' + r.log.slice(-200) : 'Cancelado'));
};
renderTimeline(); renderPreview();
