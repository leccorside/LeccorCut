const $ = (id) => document.getElementById(id);
const state = {
  media: [], clips: [], texts: [], audios: [], overlays: [], markers: [], selected: null, time: 0, playing: false,
  tracks: {
    video: { visible: true, mute: false },
    overlay: { visible: true },
    text: { visible: true },
    audio: { mute: false, solo: false }
  }
};
const player = $('player'), img = $('imgPlayer');
let pxPerSec = 60, uid = 1, raf = null, lastTs = 0;

const joinDur = (prev, cur, any) => (prev.transition && prev.transition !== 'none')
  ? Math.max(0.05, Math.min(0.5, prev.duration / 2, cur.duration / 2)) : (any ? 0.04 : 0);
function layout() {
  const any = state.clips.some(c => c.transition && c.transition !== 'none');
  const starts = []; let acc = 0;
  state.clips.forEach((c, i) => {
    if (i > 0) acc -= joinDur(state.clips[i - 1], c, any);
    starts.push(acc); acc += c.duration;
  });
  return { starts, end: acc };
}
const total = () => layout().end;
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const toast = (m) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 3500); };
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

function clipAt(t) {
  const { starts } = layout();
  for (let i = state.clips.length - 1; i >= 0; i--) {
    const c = state.clips[i];
    if (t >= starts[i] && t < starts[i] + c.duration) return { c, local: t - starts[i], start: starts[i] };
  }
  return null;
}

const CSS_PRESETS = { sepia: 'sepia(1)', vintage: 'sepia(.5) contrast(1.1)', warm: 'sepia(.3) saturate(1.2)', cool: 'hue-rotate(15deg) saturate(1.1)', cinematic: 'contrast(1.15) saturate(.9)', vivid: 'saturate(1.6) contrast(1.1)' };
function cssFilter(f = {}) {
  return `brightness(${1 + (f.brightness || 0) / 100}) contrast(${1 + (f.contrast || 0) / 100}) saturate(${1 + (f.saturation || 0) / 100}) blur(${f.blur || 0}px) grayscale(${f.grayscale ? 1 : 0}) ${CSS_PRESETS[f.preset] || ''}`;
}
function cssTransform(f = {}) {
  return `scale(${(f.hflip ? -1 : 1) * (f.zoom || 1)}, ${(f.vflip ? -1 : 1) * (f.zoom || 1)}) rotate(${f.rotate || 0}deg)`;
}

const SPEED_CURVES = {
  hero: {
    label: '⚡ Heroico',
    badge: '⚡ Heroico',
    desc: '2.2x rápido na introdução → 0.4x câmera lenta dramática no clímax → 2.2x no encerramento',
    segments: [
      { start: 0, end: 0.25, speed: 2.2 },
      { start: 0.25, end: 0.75, speed: 0.4 },
      { start: 0.75, end: 1.0, speed: 2.2 }
    ]
  },
  bullet: {
    label: '💥 Bala (Bullet)',
    badge: '💥 Bala',
    desc: '3.0x ultra rápido no início → 0.35x super câmera lenta → 1.0x velocidade normal',
    segments: [
      { start: 0, end: 0.2, speed: 3.0 },
      { start: 0.2, end: 0.7, speed: 0.35 },
      { start: 0.7, end: 1.0, speed: 1.0 }
    ]
  },
  montage: {
    label: '🎬 Montagem (Ritmo Alternado)',
    badge: '🎬 Montagem',
    desc: 'Ritmo pulsante: 2.5x rápido → 0.5x lento → 2.5x rápido → 0.5x lento',
    segments: [
      { start: 0, end: 0.25, speed: 2.5 },
      { start: 0.25, end: 0.5, speed: 0.5 },
      { start: 0.5, end: 0.75, speed: 2.5 },
      { start: 0.75, end: 1.0, speed: 0.5 }
    ]
  },
  flash_in: {
    label: '⏩ Flash In',
    badge: '⏩ Flash In',
    desc: 'Impacto veloz inicial (3.0x) desacelerando suavemente para 1.0x normal',
    segments: [
      { start: 0, end: 0.3, speed: 3.0 },
      { start: 0.3, end: 1.0, speed: 1.0 }
    ]
  },
  flash_out: {
    label: '🏎️ Flash Out',
    badge: '🏎️ Flash Out',
    desc: 'Inicia em velocidade normal (1.0x) e acelera para 3.0x no final para transição explosiva',
    segments: [
      { start: 0, end: 0.7, speed: 1.0 },
      { start: 0.7, end: 1.0, speed: 3.0 }
    ]
  }
};

function getClipSample(clip, localTimelineTime) {
  if (clip.isImage) return { targetTime: 0, speed: 1 };
  if (!clip.speedCurve || clip.speedCurve === 'none' || !SPEED_CURVES[clip.speedCurve]) {
    const sp = clip.speed || 1;
    return {
      targetTime: clip.in + localTimelineTime * sp,
      speed: sp
    };
  }
  const curve = SPEED_CURVES[clip.speedCurve];
  const srcDur = clip.srcDurUsed || (clip.duration * (clip.speed || 1));
  let curTl = 0;
  for (let i = 0; i < curve.segments.length; i++) {
    const seg = curve.segments[i];
    const segIn = clip.in + seg.start * srcDur;
    const segEnd = clip.in + seg.end * srcDur;
    const segTlDur = (segEnd - segIn) / seg.speed;
    if (localTimelineTime <= curTl + segTlDur || i === curve.segments.length - 1) {
      const dt = Math.max(0, localTimelineTime - curTl);
      return {
        targetTime: Math.min(segEnd, segIn + dt * seg.speed),
        speed: seg.speed
      };
    }
    curTl += segTlDur;
  }
  return { targetTime: clip.in, speed: 1 };
}

function applySpeedCurve(clip, curveKey) {
  const oldSrcDur = clip.srcDurUsed || (clip.duration * (clip.speed || 1));
  clip.srcDurUsed = oldSrcDur;
  if (!curveKey || curveKey === 'none' || !SPEED_CURVES[curveKey]) {
    clip.speedCurve = 'none';
    const sp = clip.speed || 1;
    clip.duration = oldSrcDur / sp;
  } else {
    clip.speedCurve = curveKey;
    const curve = SPEED_CURVES[curveKey];
    let totalTl = 0;
    for (const seg of curve.segments) {
      const inStart = clip.in + seg.start * oldSrcDur;
      const inEnd = clip.in + seg.end * oldSrcDur;
      totalTl += (inEnd - inStart) / seg.speed;
    }
    clip.duration = Math.max(0.2, totalTl);
  }
}

function speedToY(s) {
  const minS = 0.2, maxS = 3.2;
  const norm = Math.max(0, Math.min(1, (s - minS) / (maxS - minS)));
  return Math.round(52 - norm * 42);
}

function renderSpeedCurveSvg(curveKey) {
  const curve = SPEED_CURVES[curveKey];
  if (!curve) return '';
  const pts = [];
  pts.push({ x: 10, y: speedToY(curve.segments[0].speed) });
  let lastX = 10;
  curve.segments.forEach((seg) => {
    const xEnd = 10 + Math.round(seg.end * 190);
    const yVal = speedToY(seg.speed);
    pts.push({ x: xEnd, y: yVal });
    lastX = xEnd;
  });
  const pathD = pts.reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '');
  const areaD = `${pathD} L ${lastX} 56 L 10 56 Z`;
  const yNormal = speedToY(1.0);
  return `<svg viewBox="0 0 210 60" class="speed-curve-svg">
    <defs>
      <linearGradient id="scGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#00e5c3" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#7c5cff" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    <line x1="10" y1="${yNormal}" x2="200" y2="${yNormal}" stroke="#2a2e3f" stroke-dasharray="3,3" stroke-width="1"/>
    <text x="186" y="${yNormal - 3}" fill="#8a90a8" font-size="8">1.0x</text>
    <path d="${areaD}" fill="url(#scGrad)" />
    <path d="${pathD}" fill="none" stroke="#00e5c3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#7c5cff" stroke="#fff" stroke-width="1"/>`).join('')}
  </svg>`;
}

function getCaptionWords(t) {
  if (t.words && Array.isArray(t.words) && t.words.length) {
    return t.words;
  }
  const rawWords = String(t.text || '').trim().split(/\s+/).filter(Boolean);
  if (!rawWords.length) return [];
  const start = Number(t.start) || 0;
  const dur = Math.max(0.2, Number(t.duration) || 2);
  const totalWeight = rawWords.reduce((acc, w) => acc + Math.max(1, w.length), 0);
  let curAcc = 0;
  return rawWords.map((word, idx) => {
    const frac = Math.max(1, word.length) / totalWeight;
    const wDur = Math.max(0.12, dur * frac);
    const wStart = start + curAcc;
    const wEnd = idx === rawWords.length - 1 ? start + dur : wStart + wDur;
    curAcc += wDur;
    return { word, start: wStart, end: wEnd };
  });
}

function syncOverlay() {
  const v = $('ovPlayer'), im = $('ovImg');
  if (state.tracks.overlay?.visible === false) { v.hidden = im.hidden = true; v.pause(); return; }
  const o = state.overlays.find(x => state.time >= x.start && state.time < x.start + x.duration);
  if (!o) { v.hidden = im.hidden = true; v.pause(); return; }
  const el = o.isImage ? im : v, other = o.isImage ? v : im;
  other.hidden = true; el.hidden = false; if (!o.isImage) {} else v.pause();
  const src = fileUrl(o.path);
  if (el.dataset.src !== src) { el.src = src; el.dataset.src = src; }

  const dt = state.time - o.start;
  const rem = o.start + o.duration - state.time;
  let pr = Math.min(1, Math.max(0, dt / o.duration));
  if (o.easing === 'smooth') {
    pr = 3 * pr * pr - 2 * pr * pr * pr;
  }
  let ox = o.motion ? o.x + ((o.x2 ?? o.x) - o.x) * pr : o.x;
  let oy = o.motion ? o.y + ((o.y2 ?? o.y) - o.y) * pr : o.y;
  let op = o.opacity ?? 1;

  const anim = o.anim || 'none';
  if (anim === 'fade') {
    op *= Math.max(0, Math.min(1, dt / 0.4, rem / 0.4));
  } else if (anim === 'slide_left' && dt < 0.4) {
    const sPr = Math.max(0, dt / 0.4);
    ox = ox - (1 - sPr) * 0.35;
    op *= sPr;
  } else if (anim === 'slide_right' && dt < 0.4) {
    const sPr = Math.max(0, dt / 0.4);
    ox = ox + (1 - sPr) * 0.35;
    op *= sPr;
  } else if (anim === 'float') {
    oy += Math.sin(dt * Math.PI) * 0.03;
  }

  const rot = o.rotate || 0;
  const flip = o.hflip ? -1 : 1;

  el.style.width = (o.scale || 30) + '%';
  el.style.left = (ox * 100) + '%';
  el.style.top = (oy * 100) + '%';
  el.style.transform = `translate(${-ox * 100}%, ${-oy * 100}%) scaleX(${flip}) rotate(${rot}deg)`;
  el.style.opacity = op;
  if (!o.isImage) {
    const target = (o.in || 0) + state.time - o.start;
    if (!state.playing || Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    if (state.playing && v.paused) v.play().catch(() => {}); else if (!state.playing) v.pause();
  }
}

function syncAudio() {
  syncOverlay();
  const el = $('bgAudio');
  if (state.tracks.audio?.mute) { el.pause(); return; }
  const a = state.audios.find(x => state.time >= x.start && state.time < x.start + x.duration);
  if (!a) { el.pause(); return; }
  const src = fileUrl(a.path);
  if (el.dataset.src !== src) { el.src = src; el.dataset.src = src; }
  let vol = Math.min(1, a.volume ?? 1);
  const local = state.time - a.start;
  if (a.fadeIn && local < a.fadeIn) vol *= Math.max(0, local / a.fadeIn);
  if (a.fadeOut && local > a.duration - a.fadeOut) vol *= Math.max(0, (a.duration - local) / a.fadeOut);
  el.volume = Math.max(0, Math.min(1, vol));
  const target = (a.in || 0) + state.time - a.start;
  if (!state.playing || Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
  if (state.playing && el.paused) el.play().catch(() => {}); else if (!state.playing) el.pause();
}

let textDrag = null;
document.addEventListener('mousemove', (e) => {
  if (!textDrag) return;
  const r = $('stage').getBoundingClientRect();
  textDrag.px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  textDrag.py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  renderPreview();
});
document.addEventListener('mouseup', () => { if (textDrag) { textDrag = null; renderProps(); } });

function renderPreview() {
  const hit = clipAt(state.time);
  const view = hit ? hit.c : null;
  $('textLayer').innerHTML = '';
  if (state.tracks.text?.visible !== false) {
    state.texts.filter(t => state.time >= t.start && state.time < t.start + t.duration).forEach(t => {
      const s = document.createElement('span');
      const px = t.px ?? 0.5, py = t.py ?? 0.88;
      s.style.fontSize = (t.size / 720 * Math.min($('stage').clientWidth, $('stage').clientHeight)) + 'px';
      s.style.fontFamily = `'${t.font || 'Arial'}', sans-serif`;
      s.style.fontWeight = t.bold === false ? 400 : 700;
      const ow = (t.outline ?? 2) / 720 * Math.min($('stage').clientWidth, $('stage').clientHeight);
      s.style.textShadow = ow > 0 ? `0 0 ${ow * 1.5}px #000, 0 0 ${ow * 1.5}px #000, 0 0 ${ow}px #000` : 'none';
      if (t.box) {
        const h = (t.boxColor || '#000000').replace('#', '');
        const rgb = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)).join(',');
        s.style.background = `rgba(${rgb},${t.boxOpacity ?? 0.6})`;
        s.style.padding = '0.2em 0.5em';
        s.style.borderRadius = '4px';
      }
      const anim = t.anim || (t.fade ? 'fade' : 'none');
      const dt = state.time - t.start, rem = t.start + t.duration - state.time;
      let animScale = 1, animY = 0, animOp = 1;
      const hlColor = t.highlightColor || '#ffeb3b';

      if (anim === 'single_word') {
        const words = getCaptionWords(t);
        const active = words.find(w => state.time >= w.start && state.time < w.end) || words[words.length - 1];
        s.textContent = active ? active.word : '';
        s.style.color = hlColor;
        animScale = 1.25;
      } else if (anim === 'word_by_word') {
        s.innerHTML = '';
        const words = getCaptionWords(t);
        words.forEach((w, wi) => {
          if (state.time < w.start) return;
          const wsp = document.createElement('span');
          wsp.textContent = (wi > 0 ? ' ' : '') + w.word;
          const isCurrent = state.time >= w.start && state.time < w.end;
          wsp.style.color = isCurrent ? hlColor : t.color;
          if (isCurrent) {
            wsp.style.fontWeight = '900';
            wsp.style.textShadow = `0 0 10px ${hlColor}`;
          }
          s.appendChild(wsp);
        });
      } else if (anim === 'karaoke') {
        s.innerHTML = '';
        const words = getCaptionWords(t);
        words.forEach((w, wi) => {
          const wsp = document.createElement('span');
          wsp.textContent = (wi > 0 ? ' ' : '') + w.word;
          const isCurrent = state.time >= w.start && state.time < w.end;
          const isPassed = state.time >= w.end;
          if (isCurrent) {
            wsp.style.color = hlColor;
            wsp.style.fontWeight = '900';
            wsp.style.textShadow = `0 0 12px ${hlColor}`;
            wsp.style.display = 'inline-block';
            wsp.style.transform = 'scale(1.15)';
          } else if (isPassed) {
            wsp.style.color = t.color;
            wsp.style.opacity = '1';
          } else {
            wsp.style.color = t.color;
            wsp.style.opacity = '0.55';
          }
          s.appendChild(wsp);
        });
      } else {
        s.textContent = t.text;
        s.style.color = t.color;
        if (anim === 'fade') animOp = Math.max(0, Math.min(1, dt / 0.3, rem / 0.3));
        else if (anim === 'slide' && dt < 0.3) { const pr = Math.max(0, dt / 0.3); animY = (1 - pr) * 25; animOp = Math.min(1, dt / 0.2); }
        else if (anim === 'pop' && dt < 0.25) { const pr = Math.max(0, dt / 0.25); animScale = 0.6 + 0.4 * pr; animOp = Math.min(1, dt / 0.15); }
      }
      s.style.opacity = animOp;
      s.style.left = (px * 100) + '%'; s.style.top = (py * 100) + '%';
      s.style.transform = `translate(${-px * 100}%, ${-py * 100}%) translateY(${animY}px) scale(${animScale})`;
      if (state.selected?.id === t.id) s.style.outline = '1px dashed #00e5c3';
      s.onmousedown = (ev) => { ev.preventDefault(); textDrag = t; if (state.selected?.id !== t.id) select({ kind: 'text', id: t.id }); };
      $('textLayer').appendChild(s);
    });
  }
  const bgV = $('bgPlayer'), bgI = $('bgImg');
  if (!view || state.tracks.video?.visible === false) {
    player.removeAttribute('src'); img.hidden = true; player.style.visibility = 'hidden';
    if (bgV) { bgV.hidden = true; bgV.pause(); }
    if (bgI) bgI.hidden = true;
    $('vignetteLayer').hidden = true; syncAudio(); updateTime(); return;
  }
  $('vignetteLayer').hidden = !view.filters?.vignette;
  player.style.visibility = 'visible';
  const src = fileUrl(view.path);
  const f = cssFilter(view.filters);
  const fillMode = view.filters?.fillMode || 'fit';

  if (fillMode === 'blur' && state.tracks.video?.visible !== false) {
    if (view.isImage) {
      if (bgI) { bgI.hidden = false; if (bgI.src !== src) bgI.src = src; }
      if (bgV) { bgV.hidden = true; bgV.pause(); }
    } else {
      if (bgI) bgI.hidden = true;
      if (bgV) {
        bgV.hidden = false;
        if (bgV.dataset.src !== src) { bgV.src = src; bgV.dataset.src = src; }
        const sample = getClipSample(view, hit.local);
        bgV.playbackRate = sample.speed;
        const target = sample.targetTime;
        if (!state.playing || Math.abs(bgV.currentTime - target) > 0.3) bgV.currentTime = target;
        if (state.playing && bgV.paused) bgV.play().catch(() => {});
        else if (!state.playing) bgV.pause();
      }
    }
  } else {
    if (bgV) { bgV.hidden = true; bgV.pause(); }
    if (bgI) bgI.hidden = true;
  }

  const objFit = fillMode === 'crop' ? 'cover' : 'contain';
  player.style.objectFit = img.style.objectFit = objFit;

  if (view.isImage) { img.hidden = false; player.style.visibility = 'hidden'; if (img.src !== src) img.src = src; img.style.filter = f; img.style.transform = cssTransform(view.filters); }
  else {
    img.hidden = true;
    if (player.dataset.src !== src) { player.src = src; player.dataset.src = src; }
    const sample = getClipSample(view, hit.local);
    player.style.filter = f; player.style.transform = cssTransform(view.filters); player.playbackRate = sample.speed;
    const isMuted = !!state.tracks.video?.mute || !!state.tracks.audio?.solo;
    player.muted = isMuted; player.volume = isMuted ? 0 : Math.min(1, view.volume ?? 1);
    const target = sample.targetTime;
    if (!state.playing || Math.abs(player.currentTime - target) > 0.3) player.currentTime = target;
    if (state.playing && player.paused) player.play().catch(() => {});
  }
  syncAudio();
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
  else { player.pause(); if ($('bgPlayer')) $('bgPlayer').pause(); $('bgAudio').pause(); $('ovPlayer').pause(); cancelAnimationFrame(raf); }
}

// Arrastar (mover/reordenar) e aparar clipes pelas bordas.
let tlDrag = null;
let snapEnabled = true;
const snapGuide = $('snapGuide');
function toggleSnap(val) {
  snapEnabled = typeof val === 'boolean' ? val : !snapEnabled;
  $('btnSnap').classList.toggle('active', snapEnabled);
  toast(`Alinhamento magnético (Snap): ${snapEnabled ? 'Ativado' : 'Desativado'}`);
}
$('btnSnap').onclick = () => toggleSnap();

function showSnap(t) {
  if (snapGuide) { snapGuide.style.left = (12 + t * pxPerSec) + 'px'; snapGuide.hidden = false; }
}
function hideSnap() { if (snapGuide) snapGuide.hidden = true; }

function getSnapTargets(excludeItem) {
  const pts = [0, state.time];
  const { starts } = layout();
  state.clips.forEach((c, i) => { pts.push(starts[i], starts[i] + c.duration); });
  state.overlays.forEach(o => { if (o !== excludeItem) pts.push(o.start, o.start + o.duration); });
  state.texts.forEach(t => { if (t !== excludeItem) pts.push(t.start, t.start + t.duration); });
  state.audios.forEach(a => { if (a !== excludeItem) pts.push(a.start, a.start + a.duration); });
  (state.markers || []).forEach(m => pts.push(m.time));
  return pts;
}

function trySnap(val, targets, threshSec) {
  if (!snapEnabled) return { val, snapped: false };
  let best = val, minDiff = threshSec, hit = null;
  for (const p of targets) {
    const diff = Math.abs(val - p);
    if (diff < minDiff) { minDiff = diff; best = p; hit = p; }
  }
  return { val: best, snapped: hit !== null, point: hit };
}

function decorate(e, kind, item) {
  ['l', 'r'].forEach(side => {
    const h = document.createElement('span'); h.className = 'h ' + side;
    h.onmousedown = (ev) => startDrag(ev, kind, item, side); e.appendChild(h);
  });
  e.onmousedown = (ev) => startDrag(ev, kind, item, 'move');
}
function startDrag(ev, kind, item, mode) {
  ev.preventDefault(); ev.stopPropagation();
  const s0 = kind === 'clip' ? layout().starts[state.clips.indexOf(item)] : item.start;
  select({ kind, id: item.id });
  tlDrag = { kind, item, mode, x0: ev.clientX, s0, o: { start: item.start, duration: item.duration, in: item.in || 0 } };
}
document.addEventListener('mousemove', (ev) => {
  if (!tlDrag) return;
  const { kind, item: it, mode, o } = tlDrag, dx = (ev.clientX - tlDrag.x0) / pxPerSec, MIN = 0.2;
  const thresh = 8 / pxPerSec;
  if (kind === 'clip') {
    const sp = it.speed || 1, srcDur = it.isImage ? 1e9 : (it.srcDur || (o.in + o.duration * sp));
    if (mode === 'move') {
      const others = state.clips.filter(c => c !== it); const center = tlDrag.s0 + o.duration / 2 + dx;
      let acc = 0, n = 0; for (const c of others) { if (acc + c.duration / 2 < center) n++; acc += c.duration; }
      if (n !== state.clips.indexOf(it)) { state.clips = others; state.clips.splice(n, 0, it); }
      hideSnap();
    } else if (mode === 'r') {
      let tEnd = tlDrag.s0 + o.duration + dx;
      const snapR = trySnap(tEnd, getSnapTargets(it), thresh);
      if (snapR.snapped) { tEnd = snapR.val; showSnap(snapR.point); } else { hideSnap(); }
      const newDur = Math.max(MIN, tEnd - tlDrag.s0);
      it.duration = Math.min(newDur, (srcDur - o.in) / sp);
    } else {
      let tStart = tlDrag.s0 + dx;
      const snapL = trySnap(tStart, getSnapTargets(it), thresh);
      if (snapL.snapped) { tStart = snapL.val; showSnap(snapL.point); } else { hideSnap(); }
      const d = Math.min(Math.max(tStart - tlDrag.s0, -o.in / sp), o.duration - MIN);
      it.in = o.in + d * sp; it.duration = o.duration - d;
    }
  } else {
    const hasIn = kind !== 'text', cap = hasIn && it.max ? it.max : 1e9;
    const targets = getSnapTargets(it);
    if (mode === 'move') {
      let tStart = Math.max(0, o.start + dx);
      const snapL = trySnap(tStart, targets, thresh);
      if (snapL.snapped) {
        tStart = snapL.val; showSnap(snapL.point);
      } else {
        const snapR = trySnap(tStart + o.duration, targets, thresh);
        if (snapR.snapped) {
          tStart = Math.max(0, snapR.val - o.duration); showSnap(snapR.point);
        } else { hideSnap(); }
      }
      it.start = tStart;
    } else if (mode === 'r') {
      let tEnd = o.start + o.duration + dx;
      const snapR = trySnap(tEnd, targets, thresh);
      if (snapR.snapped) { tEnd = snapR.val; showSnap(snapR.point); } else { hideSnap(); }
      it.duration = Math.min(Math.max(MIN, tEnd - o.start), cap - o.in);
    } else {
      let tStart = Math.max(0, o.start + dx);
      const snapL = trySnap(tStart, targets, thresh);
      if (snapL.snapped) { tStart = snapL.val; showSnap(snapL.point); } else { hideSnap(); }
      const d = Math.min(Math.max(tStart - o.start, hasIn ? -o.in : -1e9), o.duration - MIN);
      it.start = o.start + d; it.duration = o.duration - d; if (hasIn) it.in = o.in + d;
    }
  }
  renderTimeline(); renderPreview();
});
document.addEventListener('mouseup', () => { if (tlDrag) { tlDrag = null; hideSnap(); renderProps(); } });

function renderTimeline() {
  const tv = $('trackVideo'), to = $('trackOverlay'), tt = $('trackText'), ta = $('trackAudio'), ru = $('ruler');
  tv.innerHTML = to.innerHTML = tt.innerHTML = ta.innerHTML = ru.innerHTML = '';
  const dur = Math.max(total(), 30);
  ru.style.width = tv.style.width = to.style.width = tt.style.width = ta.style.width = (dur * pxPerSec) + 'px';
  for (let s = 0; s < dur; s += 5) { const k = document.createElement('div'); k.className = 'tick'; k.style.left = s * pxPerSec + 'px'; k.textContent = s + 's'; ru.appendChild(k); }
  (state.markers || []).forEach(m => {
    const el = document.createElement('div'); el.className = 'marker';
    el.style.left = (m.time * pxPerSec) + 'px';
    el.title = `${m.label || 'Marcador'} (${fmt(m.time)}) - Clique para ir / Duplo clique para excluir`;
    el.innerHTML = `<span class="marker-flag">🏷️</span><span class="marker-label">${m.label || ''}</span>`;
    el.onclick = (ev) => { ev.stopPropagation(); state.time = m.time; renderPreview(); };
    el.ondblclick = (ev) => { ev.stopPropagation(); removeMarker(m.id); };
    ru.appendChild(el);
  });
  const { starts } = layout();
  state.clips.forEach((c, i) => {
    const acc = starts[i];
    const e = document.createElement('div'); e.className = 'clip' + (state.selected?.id === c.id ? ' sel' : '');
    e.style.left = acc * pxPerSec + 'px'; e.style.width = c.duration * pxPerSec + 'px';
    const baseName = (c.transition && c.transition !== 'none' ? '⇆ ' : '') + c.name;
    if (c.speedCurve && c.speedCurve !== 'none' && SPEED_CURVES[c.speedCurve]) {
      e.innerHTML = `<span class="clip-title">${baseName}</span><span class="clip-speed-badge">${SPEED_CURVES[c.speedCurve].badge}</span>`;
    } else if (c.speed && c.speed !== 1) {
      e.innerHTML = `<span class="clip-title">${baseName}</span><span class="clip-speed-badge">${c.speed}x</span>`;
    } else {
      e.textContent = baseName;
    }
    if (c.thumb) { e.style.backgroundImage = `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)),url(${c.thumb})`; e.style.backgroundSize = 'auto 100%'; e.style.backgroundRepeat = 'repeat-x'; }
    decorate(e, 'clip', c);
    tv.appendChild(e);
  });
  state.texts.forEach(t => {
    const e = document.createElement('div'); e.className = 'clip text' + (state.selected?.id === t.id ? ' sel' : '');
    e.style.left = t.start * pxPerSec + 'px'; e.style.width = t.duration * pxPerSec + 'px'; e.textContent = 'T: ' + t.text;
    decorate(e, 'text', t);
    tt.appendChild(e);
  });
  state.overlays.forEach(o => {
    const e = document.createElement('div'); e.className = 'clip overlay' + (state.selected?.id === o.id ? ' sel' : '');
    e.style.left = o.start * pxPerSec + 'px'; e.style.width = o.duration * pxPerSec + 'px'; e.textContent = 'PiP: ' + o.name;
    if (o.thumb) { e.style.backgroundImage = `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)),url(${o.thumb})`; e.style.backgroundSize = 'auto 100%'; e.style.backgroundRepeat = 'repeat-x'; }
    decorate(e, 'overlay', o);
    to.appendChild(e);
  });
  state.audios.forEach(a => {
    const e = document.createElement('div'); e.className = 'clip audio' + (state.selected?.id === a.id ? ' sel' : '');
    e.style.left = a.start * pxPerSec + 'px'; e.style.width = a.duration * pxPerSec + 'px'; e.textContent = '♪ ' + a.name;
    if (a.wave) { e.style.backgroundImage = `url(${a.wave}), linear-gradient(135deg,#00b894,#00e5c3)`; e.style.backgroundSize = `${a.max * pxPerSec}px 100%, 100% 100%`; e.style.backgroundPosition = `${-(a.in || 0) * pxPerSec}px 0, 0 0`; e.style.backgroundRepeat = 'no-repeat'; }
    decorate(e, 'audio', a);
    ta.appendChild(e);
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
  if (s.kind === 'overlay') {
    const o = state.overlays.find(x => x.id === s.id); if (!o) return;
    const r = (id, label, min, max, step, val) => `<div class="prop">${label}<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
    p.innerHTML = `<div class="prop">Início (s)<input type="number" id="oStart" value="${o.start.toFixed(1)}" min="0" step="0.5"></div>`
      + `<div class="prop">Duração (s)<input type="number" id="oDur" value="${o.duration.toFixed(1)}" min="0.5" step="0.5"></div>`
      + `<div class="prop">Animação<select id="oAnim">
        <option value="none" ${(o.anim || 'none') === 'none' ? 'selected' : ''}>Nenhuma</option>
        <option value="fade" ${o.anim === 'fade' ? 'selected' : ''}>Fade In / Out</option>
        <option value="slide_left" ${o.anim === 'slide_left' ? 'selected' : ''}>Deslizar da Esquerda</option>
        <option value="slide_right" ${o.anim === 'slide_right' ? 'selected' : ''}>Deslizar da Direita</option>
        <option value="zoom_in" ${o.anim === 'zoom_in' ? 'selected' : ''}>Zoom In (Pop)</option>
        <option value="float" ${o.anim === 'float' ? 'selected' : ''}>Flutuar (Sticker Float)</option>
      </select></div>`
      + r('oScale', 'Tamanho (%)', 10, 100, 1, o.scale)
      + r('oRot', 'Rotação (°)', -180, 180, 1, o.rotate || 0)
      + `<div class="prop"><label><input type="checkbox" id="oFlip" ${o.hflip ? 'checked' : ''}> Espelhar horizontalmente</label></div>`
      + r('oX', 'Posição horizontal', 0, 1, 0.01, o.x)
      + r('oY', 'Posição vertical', 0, 1, 0.01, o.y)
      + r('oOp', 'Opacidade', 0.1, 1, 0.05, o.opacity)
      + `<div class="prop"><label><input type="checkbox" id="oMot" ${o.motion ? 'checked' : ''}> Animar posição (início → fim)</label></div>`
      + `<div class="prop">Movimento<select id="oEase">
        <option value="linear" ${(o.easing || 'linear') === 'linear' ? 'selected' : ''}>Linear</option>
        <option value="smooth" ${o.easing === 'smooth' ? 'selected' : ''}>Suave (Cinemático)</option>
      </select></div>`
      + r('oX2', 'Posição horizontal final', 0, 1, 0.01, o.x2 ?? o.x)
      + r('oY2', 'Posição vertical final', 0, 1, 0.01, o.y2 ?? o.y)
      + `<div class="prop"><label><input type="checkbox" id="oChroma" ${o.chroma ? 'checked' : ''}> Chroma key (remover cor)</label></div>`
      + `<div class="prop">Cor<input type="color" id="oCColor" value="${o.chromaColor || '#00ff00'}"></div>`
      + r('oCSim', 'Tolerância', 0.05, 0.6, 0.01, o.chromaSim ?? 0.3);
    $('oAnim').onchange = (e) => { o.anim = e.target.value; renderPreview(); };
    $('oRot').oninput = (e) => { o.rotate = +e.target.value; renderPreview(); };
    $('oFlip').onchange = (e) => { o.hflip = e.target.checked; renderPreview(); };
    $('oMot').onchange = (e) => { o.motion = e.target.checked; renderPreview(); };
    $('oEase').onchange = (e) => { o.easing = e.target.value; renderPreview(); };
    $('oX2').oninput = (e) => { o.x2 = +e.target.value; renderPreview(); };
    $('oY2').oninput = (e) => { o.y2 = +e.target.value; renderPreview(); };
    $('oChroma').onchange = (e) => { o.chroma = e.target.checked; };
    $('oCColor').oninput = (e) => { o.chromaColor = e.target.value; };
    $('oCSim').oninput = (e) => { o.chromaSim = +e.target.value; };
    $('oStart').onchange = (e) => { o.start = Math.max(0, +e.target.value); renderTimeline(); renderPreview(); };
    $('oDur').onchange = (e) => { o.duration = Math.min(o.max, +e.target.value); renderTimeline(); renderPreview(); };
    $('oScale').oninput = (e) => { o.scale = +e.target.value; renderPreview(); };
    $('oX').oninput = (e) => { o.x = +e.target.value; renderPreview(); };
    $('oY').oninput = (e) => { o.y = +e.target.value; renderPreview(); };
    $('oOp').oninput = (e) => { o.opacity = +e.target.value; renderPreview(); };
    return;
  }
  if (s.kind === 'audio') {
    const a = state.audios.find(x => x.id === s.id); if (!a) return;
    p.innerHTML = `<div class="prop">Início (s)<input type="number" id="aStart" value="${a.start.toFixed(1)}" min="0" step="0.5"></div>
      <div class="prop">Duração (s)<input type="number" id="aDur" value="${a.duration.toFixed(1)}" min="0.5" step="0.5"></div>
      <div class="prop">Volume<input type="range" id="aVol" min="0" max="1" step="0.05" value="${a.volume ?? 1}"></div>
      <div class="prop">Fade in (s)<input type="number" id="aFadeIn" value="${a.fadeIn || 0}" min="0" max="10" step="0.2"></div>
      <div class="prop">Fade out (s)<input type="number" id="aFadeOut" value="${a.fadeOut || 0}" min="0" max="10" step="0.2"></div>
      <div class="prop"><label><input type="checkbox" id="aDenoise" ${a.denoise ? 'checked' : ''}> Redução de ruído (chiado)</label></div>
      <div class="prop"><label><input type="checkbox" id="aLoudnorm" ${a.loudnorm ? 'checked' : ''}> Normalizar volume (-14 LUFS)</label></div>`;
    $('aStart').onchange = (e) => { a.start = Math.max(0, +e.target.value); renderTimeline(); };
    $('aDur').onchange = (e) => { a.duration = Math.min(a.max, +e.target.value); renderTimeline(); };
    $('aVol').oninput = (e) => { a.volume = +e.target.value; syncAudio(); };
    $('aFadeIn').onchange = (e) => { a.fadeIn = Math.max(0, +e.target.value); };
    $('aFadeOut').onchange = (e) => { a.fadeOut = Math.max(0, +e.target.value); };
    $('aDenoise').onchange = (e) => { a.denoise = e.target.checked; };
    $('aLoudnorm').onchange = (e) => { a.loudnorm = e.target.checked; };
    return;
  }
  if (s.kind === 'text') {
    const t = state.texts.find(x => x.id === s.id); if (!t) return;
    p.innerHTML = `<div class="prop">Texto<input type="text" id="tText" value="${t.text.replace(/"/g, '&quot;')}"></div>`
      + `<div class="prop">Tamanho<input type="number" id="tSize" value="${t.size}" min="10" max="200"></div>`
      + `<div class="prop">Cor<input type="color" id="tColor" value="${t.color}"></div>`
      + `<div class="prop">Fonte<select id="tFont">${['Arial', 'Impact', 'Segoe UI', 'Comic Sans MS', 'Times New Roman', 'Courier New'].map(v => `<option ${(t.font || 'Arial') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`
      + `<div class="prop">Animação<select id="tAnim">${[['none', 'Nenhuma'], ['fade', 'Fade In/Out'], ['slide', 'Deslizar (Slide Up)'], ['pop', 'Pop / Zoom In'], ['karaoke', '🎤 Karaokê (Destaque Ativo)'], ['word_by_word', '📝 Palavra por Palavra'], ['single_word', '⚡ Estilo Viral (Hormozi)']].map(([k, label]) => `<option ${(t.anim || (t.fade ? 'fade' : 'none')) === k ? 'selected' : ''} value="${k}">${label}</option>`).join('')}</select></div>`
      + `<div class="prop" id="pHighlightGroup" ${['karaoke', 'word_by_word', 'single_word'].includes(t.anim) ? '' : 'style="display:none"'}>Cor de Destaque<input type="color" id="tHighlightColor" value="${t.highlightColor || '#ffeb3b'}"></div>`
      + `<div class="prop"><label><input type="checkbox" id="tBold" ${t.bold !== false ? 'checked' : ''}> Negrito</label></div>`
      + `<div class="prop">Contorno<input type="range" id="tOut" min="0" max="8" step="1" value="${t.outline ?? 2}"></div>`
      + `<div class="prop"><label><input type="checkbox" id="tBox" ${t.box ? 'checked' : ''}> Fundo (caixa)</label> <input type="color" id="tBoxColor" value="${t.boxColor || '#000000'}"></div>`
      + `<div class="prop">Opacidade do fundo<input type="range" id="tBoxOp" min="0.1" max="1" step="0.05" value="${t.boxOpacity ?? 0.6}"></div>`
      + `<div class="prop">Início (s)<input type="number" id="pStart" value="${t.start.toFixed(1)}" min="0" step="0.5"></div>`
      + `<div class="prop">Duração (s)<input type="number" id="pDur" value="${t.duration.toFixed(1)}" min="0.5" step="0.5"></div>`
      + `<button id="btnApplyAllTexts" class="wide primary">Aplicar estilo a todas as legendas</button>`
      + `<p class="hint">Arraste o texto no preview para posicionar.</p>`;
    $('tText').oninput = (e) => { t.text = e.target.value; renderTimeline(); renderPreview(); };
    $('tSize').oninput = (e) => { t.size = +e.target.value || 48; renderPreview(); };
    $('tColor').oninput = (e) => { t.color = e.target.value; renderPreview(); };
    $('tFont').onchange = (e) => { t.font = e.target.value; renderPreview(); };
    $('tAnim').onchange = (e) => {
      t.anim = e.target.value;
      t.fade = (e.target.value === 'fade');
      const hlGrp = $('pHighlightGroup');
      if (hlGrp) hlGrp.style.display = ['karaoke', 'word_by_word', 'single_word'].includes(t.anim) ? 'block' : 'none';
      renderPreview();
    };
    if ($('tHighlightColor')) $('tHighlightColor').oninput = (e) => { t.highlightColor = e.target.value; renderPreview(); };
    $('tBold').onchange = (e) => { t.bold = e.target.checked; renderPreview(); };
    $('tOut').oninput = (e) => { t.outline = +e.target.value; renderPreview(); };
    $('tBox').onchange = (e) => { t.box = e.target.checked; renderPreview(); };
    $('tBoxColor').oninput = (e) => { t.boxColor = e.target.value; renderPreview(); };
    $('tBoxOp').oninput = (e) => { t.boxOpacity = +e.target.value; renderPreview(); };
    $('pStart').onchange = (e) => { t.start = Math.max(0, +e.target.value); renderTimeline(); renderPreview(); };
    $('pDur').onchange = (e) => { t.duration = +e.target.value; renderTimeline(); renderPreview(); };
    $('btnApplyAllTexts').onclick = () => {
      state.texts.forEach(other => {
        other.size = t.size; other.color = t.color; other.font = t.font;
        other.bold = t.bold; other.anim = t.anim; other.fade = t.fade; other.highlightColor = t.highlightColor;
        other.outline = t.outline; other.box = t.box; other.boxColor = t.boxColor; other.boxOpacity = t.boxOpacity;
        other.px = t.px; other.py = t.py;
      });
      renderTimeline(); renderPreview(); toast('Estilo aplicado a ' + state.texts.length + ' textos');
    };
    return;
  }
  const c = state.clips.find(x => x.id === s.id); if (!c) return;
  c.filters = c.filters || {};
  const fillMode = c.filters.fillMode || 'fit';
  const isCurve = !c.isImage && c.speedCurve && c.speedCurve !== 'none' && SPEED_CURVES[c.speedCurve];
  const speedHtml = c.isImage ? '' : `
    <div class="prop-group">
      <div class="prop" style="font-weight:700;color:var(--txt)">⚡ Velocidade do Clipe</div>
      <div class="speed-toggle-row">
        <button type="button" class="btn-speed-tab ${!isCurve ? 'active' : ''}" id="tabSpeedLinear">Linear</button>
        <button type="button" class="btn-speed-tab ${isCurve ? 'active' : ''}" id="tabSpeedCurve">Curva (Ramping)</button>
      </div>
      ${!isCurve ? `
        <div class="prop">Velocidade constante
          <select id="pSpeed">
            ${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(v => `<option ${c.speed === v || (!c.speed && v === 1) ? 'selected' : ''} value="${v}">${v}x</option>`).join('')}
          </select>
        </div>
      ` : `
        <div class="prop">Preset de Curva
          <select id="pCurvePreset">
            ${Object.keys(SPEED_CURVES).map(k => `<option ${c.speedCurve === k ? 'selected' : ''} value="${k}">${SPEED_CURVES[k].label}</option>`).join('')}
          </select>
        </div>
        <div class="speed-curve-card">
          ${renderSpeedCurveSvg(c.speedCurve || 'hero')}
          <div class="speed-curve-desc">${SPEED_CURVES[c.speedCurve || 'hero']?.desc || ''}</div>
        </div>
      `}
    </div>`;
  p.innerHTML = `<div class="prop">Enquadramento<select id="pFill">
      <option value="fit" ${fillMode === 'fit' ? 'selected' : ''}>Ajustar (Barras pretas)</option>
      <option value="blur" ${fillMode === 'blur' ? 'selected' : ''}>Desfoque de Fundo (Canvas Blur)</option>
      <option value="crop" ${fillMode === 'crop' ? 'selected' : ''}>Preencher (Cortar bordas)</option>
    </select></div>`
    + slider('Brilho', 'brightness', -50, 50, c.filters) + slider('Contraste', 'contrast', -50, 100, c.filters)
    + slider('Saturação', 'saturation', -100, 100, c.filters) + slider('Desfoque', 'blur', 0, 20, c.filters)
    + `<div class="prop">Zoom<input type="range" id="pZoom" min="1" max="3" step="0.05" value="${c.filters.zoom || 1}"></div>
       <div class="prop">Rotação<select id="pRot">${[0, 90, 180, 270].map(v => `<option ${(c.filters.rotate || 0) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
       <div class="prop"><label><input type="checkbox" id="pH" ${c.filters.hflip ? 'checked' : ''}> Espelhar horizontal</label></div>
       <div class="prop"><label><input type="checkbox" id="pV" ${c.filters.vflip ? 'checked' : ''}> Espelhar vertical</label></div>
       <div class="prop"><label><input type="checkbox" id="pGray" ${c.filters.grayscale ? 'checked' : ''}> P&B</label></div>
       <div class="prop"><label><input type="checkbox" id="pVin" ${c.filters.vignette ? 'checked' : ''}> Vinheta (bordas escuras)</label></div>
       <div class="prop"><label><input type="checkbox" id="pFade" ${c.filters.fade ? 'checked' : ''}> Fade in/out</label></div>
       <div class="prop">Filtro de cor<select id="pPreset">${['none', 'sepia', 'vintage', 'warm', 'cool', 'cinematic', 'vivid'].map(v => `<option ${(c.filters.preset || 'none') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
       <div class="prop">Transição para o próximo clipe<select id="pTrans">${['none', 'fade', 'dissolve', 'wipeleft', 'slideleft', 'circleopen', 'pixelize'].map(v => `<option ${(c.transition || 'none') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`
       + speedHtml
       + `<div class="prop">Volume<input type="range" id="pVol" min="0" max="1" step="0.05" value="${c.volume ?? 1}"></div>
       <div class="prop"><label><input type="checkbox" id="pDenoise" ${c.filters.denoise ? 'checked' : ''}> Redução de ruído (chiado)</label></div>
       <div class="prop"><label><input type="checkbox" id="pLoudnorm" ${c.filters.loudnorm ? 'checked' : ''}> Normalizar volume (-14 LUFS)</label></div>`
       + (c.hasAudio && !c.isImage ? `<button id="btnDetach" class="wide">Separar Áudio do Vídeo</button>` : '');
  p.querySelectorAll('input[data-k]').forEach(i => i.oninput = () => { c.filters[i.dataset.k] = +i.value; renderPreview(); });
  $('pFill').onchange = (e) => { c.filters.fillMode = e.target.value; renderPreview(); };
  if ($('btnDetach')) $('btnDetach').onclick = () => detachAudio(c);
  $('pDenoise').onchange = (e) => { c.filters.denoise = e.target.checked; };
  $('pLoudnorm').onchange = (e) => { c.filters.loudnorm = e.target.checked; };
  $('pGray').onchange = (e) => { c.filters.grayscale = e.target.checked; renderPreview(); };
  $('pVin').onchange = (e) => { c.filters.vignette = e.target.checked; renderPreview(); };
  $('pZoom').oninput = (e) => { c.filters.zoom = +e.target.value; renderPreview(); };
  $('pRot').onchange = (e) => { c.filters.rotate = +e.target.value; renderPreview(); };
  $('pH').onchange = (e) => { c.filters.hflip = e.target.checked; renderPreview(); };
  $('pV').onchange = (e) => { c.filters.vflip = e.target.checked; renderPreview(); };
  $('pPreset').onchange = (e) => { c.filters.preset = e.target.value; renderPreview(); };
  $('pTrans').onchange = (e) => { c.transition = e.target.value; renderTimeline(); renderPreview(); };
  $('pFade').onchange = (e) => { c.filters.fade = e.target.checked; };
  $('pVol').oninput = (e) => { c.volume = +e.target.value; renderPreview(); };
  if ($('tabSpeedLinear')) $('tabSpeedLinear').onclick = () => {
    applySpeedCurve(c, 'none');
    renderTimeline(); renderProps(); renderPreview();
  };
  if ($('tabSpeedCurve')) $('tabSpeedCurve').onclick = () => {
    applySpeedCurve(c, c.speedCurve && c.speedCurve !== 'none' ? c.speedCurve : 'hero');
    renderTimeline(); renderProps(); renderPreview();
  };
  if ($('pSpeed')) $('pSpeed').onchange = (e) => {
    const sp = +e.target.value, old = c.speed || 1;
    c.duration = c.duration * old / sp;
    c.speed = sp;
    renderTimeline(); renderProps(); renderPreview();
  };
  if ($('pCurvePreset')) $('pCurvePreset').onchange = (e) => {
    applySpeedCurve(c, e.target.value);
    renderTimeline(); renderProps(); renderPreview();
  };
}

function detachAudio(c) {
  if (!c || !c.hasAudio || c.isImage) return;
  const { starts } = layout();
  const idx = state.clips.indexOf(c);
  const clipStart = starts[idx] || 0;
  const sp = c.speed || 1;
  state.audios.push({
    id: uid++,
    path: c.path,
    name: 'Áudio - ' + c.name,
    wave: c.wave,
    start: clipStart,
    in: c.in,
    duration: c.duration,
    max: c.srcDur || (c.in + c.duration * sp),
    volume: c.volume ?? 1,
    fadeIn: 0,
    fadeOut: 0
  });
  c.hasAudio = false;
  c.volume = 0;
  renderTimeline();
  renderProps();
  renderPreview();
  toast('Áudio separado e movido para a trilha de áudio');
}

async function freezeFrame() {
  const hit = clipAt(state.time);
  if (!hit) return toast('Posicione o cursor dentro de um clipe');
  const c = hit.c;
  if (c.isImage) return toast('O clipe atual já é uma imagem estática');
  toast('Extraindo quadro congelado...');
  const sample = getClipSample(c, hit.local);
  const timeInSource = sample.targetTime;
  try {
    const framePath = await window.api.freezeFrame(c.path, timeInSource);
    const idx = state.clips.indexOf(c);
    const b = { ...c, id: uid++, filters: { ...(c.filters || {}) }, in: sample.targetTime, duration: c.duration - hit.local };
    const freezeClip = {
      id: uid++,
      path: framePath,
      name: '❄ Freeze - ' + c.name,
      duration: 3,
      srcDur: 3,
      in: 0,
      hasVideo: true,
      hasAudio: false,
      isImage: true,
      filters: { ...(c.filters || {}) },
      speed: 1,
      volume: 0,
      thumb: 'file:///' + framePath.replace(/\\/g, '/')
    };
    c.duration = hit.local;
    c.transition = 'none';
    state.clips.splice(idx + 1, 0, freezeClip, b);
    renderTimeline();
    renderPreview();
    toast('Quadro congelado inserido (3s)');
  } catch (err) {
    toast('Erro ao congelar quadro: ' + (err.message || err));
  }
}

function addOrToggleMarker() {
  if (!state.markers) state.markers = [];
  const idx = state.markers.findIndex(m => Math.abs(m.time - state.time) < 0.15);
  if (idx >= 0) {
    state.markers.splice(idx, 1);
    toast('Marcador removido');
  } else {
    state.markers.push({ id: uid++, time: state.time, label: `M${state.markers.length + 1}` });
    state.markers.sort((a, b) => a.time - b.time);
    toast(`Marcador adicionado em ${fmt(state.time)}`);
  }
  renderTimeline();
}
function removeMarker(id) {
  state.markers = (state.markers || []).filter(m => m.id !== id);
  renderTimeline();
  toast('Marcador removido');
}

function jumpCut(dir) {
  const { starts } = layout();
  const cuts = [0];
  state.clips.forEach((c, i) => { cuts.push(starts[i], starts[i] + c.duration); });
  (state.markers || []).forEach(m => cuts.push(m.time));
  const sorted = [...new Set(cuts.map(n => Math.round(n * 100) / 100))].sort((a, b) => a - b);
  if (dir < 0) {
    const prev = sorted.filter(t => t < state.time - 0.05);
    state.time = prev.length ? prev[prev.length - 1] : 0;
  } else {
    const next = sorted.find(t => t > state.time + 0.05);
    state.time = next !== undefined ? next : total();
  }
  renderPreview();
}

function split() {
  const hit = clipAt(state.time); if (!hit || hit.local < 0.1 || hit.c.duration - hit.local < 0.1) return toast('Posicione o cursor dentro de um clipe');
  const c = hit.c, idx = state.clips.indexOf(c);
  const sample = getClipSample(c, hit.local);
  const b = { ...c, id: uid++, filters: { ...(c.filters || {}) }, in: sample.targetTime, duration: c.duration - hit.local };
  c.duration = hit.local; c.transition = 'none'; state.clips.splice(idx + 1, 0, b); renderTimeline();
}
function del() {
  const s = state.selected; if (!s) return;
  if (s.kind === 'clip') state.clips = state.clips.filter(c => c.id !== s.id);
  else if (s.kind === 'audio') state.audios = state.audios.filter(a => a.id !== s.id);
  else if (s.kind === 'overlay') state.overlays = state.overlays.filter(o => o.id !== s.id);
  else state.texts = state.texts.filter(t => t.id !== s.id);
  state.selected = null; renderTimeline(); renderProps(); renderPreview();
}

function renderMedia() {
  const l = $('mediaList'); l.innerHTML = '';
  state.media.forEach(m => {
    const e = document.createElement('div'); e.className = 'media-item'; e.innerHTML = `${m.thumb ? `<img src="${m.thumb}" style="width:100%;border-radius:6px;margin-bottom:4px">` : ''}${m.name}<small>${m.duration.toFixed(1)}s${m.hasAudio ? ' · áudio' : ''}</small>`;
    e.onclick = () => {
      if (m.hasAudio && !m.hasVideo) state.audios.push({ id: uid++, path: m.path, name: m.name, wave: m.wave, start: state.time, in: 0, duration: m.duration, max: m.duration, volume: 1 });
      else state.clips.push({ id: uid++, ...m, srcDur: m.duration, in: 0, filters: {}, speed: 1, volume: 1 });
      renderTimeline(); renderPreview();
    };
    l.appendChild(e);
    if (m.hasVideo) {
      const b = document.createElement('button'); b.className = 'pip'; b.textContent = 'PiP'; b.title = 'Adicionar como sobreposição (picture-in-picture)';
      b.onclick = (ev) => {
        ev.stopPropagation();
        state.overlays.push({ id: uid++, path: m.path, name: m.name, thumb: m.thumb, isImage: m.isImage, start: state.time, in: 0, duration: m.duration, max: m.duration, x: 1, y: 0, scale: 30, opacity: 1 });
        renderTimeline(); renderPreview();
      };
      e.prepend(b);
    }
  });
}

function renderTrackHeaders() {
  const tr = state.tracks;
  const setBtn = (id, active, isOff) => {
    const el = $(id); if (!el) return;
    el.classList.toggle('active', !!active);
    el.classList.toggle('off', !!isOff);
  };
  setBtn('thEyeVideo', false, tr.video.visible === false);
  setBtn('thMuteVideo', tr.video.mute, tr.video.mute);
  if ($('thGroupVideo')) $('thGroupVideo').style.opacity = tr.video.visible === false ? '0.5' : '1';

  setBtn('thEyeOverlay', false, tr.overlay.visible === false);
  if ($('thGroupOverlay')) $('thGroupOverlay').style.opacity = tr.overlay.visible === false ? '0.5' : '1';

  setBtn('thEyeText', false, tr.text.visible === false);
  if ($('thGroupText')) $('thGroupText').style.opacity = tr.text.visible === false ? '0.5' : '1';

  setBtn('thMuteAudio', tr.audio.mute, tr.audio.mute);
  setBtn('thSoloAudio', tr.audio.solo, false);
  if ($('thGroupAudio')) $('thGroupAudio').style.opacity = tr.audio.mute ? '0.5' : '1';
}

function initTrackHeaders() {
  if ($('thEyeVideo')) $('thEyeVideo').onclick = () => { state.tracks.video.visible = !(state.tracks.video.visible !== false); renderTrackHeaders(); renderPreview(); };
  if ($('thMuteVideo')) $('thMuteVideo').onclick = () => { state.tracks.video.mute = !state.tracks.video.mute; renderTrackHeaders(); renderPreview(); };
  if ($('thEyeOverlay')) $('thEyeOverlay').onclick = () => { state.tracks.overlay.visible = !(state.tracks.overlay.visible !== false); renderTrackHeaders(); renderPreview(); };
  if ($('thEyeText')) $('thEyeText').onclick = () => { state.tracks.text.visible = !(state.tracks.text.visible !== false); renderTrackHeaders(); renderPreview(); };
  if ($('thMuteAudio')) $('thMuteAudio').onclick = () => { state.tracks.audio.mute = !state.tracks.audio.mute; renderTrackHeaders(); renderPreview(); };
  if ($('thSoloAudio')) $('thSoloAudio').onclick = () => { state.tracks.audio.solo = !state.tracks.audio.solo; renderTrackHeaders(); renderPreview(); };
  renderTrackHeaders();
}

$('btnImport').onclick = async () => { state.media.push(...await window.api.importMedia()); renderMedia(); };
$('btnPlay').onclick = () => setPlaying(!state.playing);
$('btnSplit').onclick = split;
$('btnFreeze').onclick = freezeFrame;
$('btnDelete').onclick = del;
$('btnAddText').onclick = () => {
  const v = $('txtInput').value.trim(); if (!v) return;
  state.texts.push({ id: uid++, text: v, color: $('txtColor').value, size: +$('txtSize').value, start: state.time, duration: 3 });
  renderTimeline(); renderPreview();
};
$('btnSrt').onclick = async () => {
  const srt = await window.api.importSrt(); if (!srt) return;
  const toSec = (s) => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
  let n = 0;
  srt.replace(/\r/g, '').split(/\n\n+/).forEach(b => {
    const l = b.trim().split('\n'); const i = l.findIndex(x => x.includes('-->')); if (i < 0) return;
    const [a, z] = l[i].split('-->'); const text = l.slice(i + 1).join(' ').trim(); if (!text) return;
    state.texts.push({ id: uid++, text, color: $('txtColor').value, size: +$('txtSize').value, start: toSec(a), duration: toSec(z) - toSec(a) }); n++;
  });
  renderTimeline(); renderPreview(); toast(n + ' legendas importadas');
};
$('btnAuto').onclick = async () => {
  const withAudio = state.clips.map((c, i) => ({ c, i })).filter(x => x.c.hasAudio && !x.c.isImage);
  if (!withAudio.length) return toast('Nenhum clipe com áudio na timeline');
  const btn = $('btnAuto'); btn.disabled = true;
  window.api.onWhisper(m => toast(m));
  const { starts } = layout(); let n = 0;
  for (const { c, i } of withAudio) {
    toast('Preparando áudio...');
    const r = await window.api.transcribe(c, $('asrLang').value);
    if (!r.ok) { toast('Erro: ' + r.error.slice(0, 200)); btn.disabled = false; return; }
    const sp = c.speed || 1;
    r.chunks.forEach(k => {
      const s = starts[i] + k.start / sp, d = Math.max(0.5, (k.end - k.start) / sp);
      state.texts.push({ id: uid++, text: k.text, color: $('txtColor').value, size: +$('txtSize').value, start: s, duration: d }); n++;
    });
  }
  btn.disabled = false; renderTimeline(); renderPreview(); toast(n + ' legendas geradas');
};
$('zoom').oninput = (e) => { pxPerSec = +e.target.value; renderTimeline(); };
$('ruler').onclick = (e) => { state.time = Math.max(0, (e.clientX - $('ruler').getBoundingClientRect().left) / pxPerSec); renderPreview(); };
$('btnMarker').onclick = addOrToggleMarker;
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  const fps = +$('expFps').value || 30;
  const frameDur = 1 / fps;
  if (e.key === 's' || e.key === 'S') split();
  else if (e.key === 'Delete') del();
  else if (e.key === 'f' || e.key === 'F') freezeFrame();
  else if (e.key === 'm' || e.key === 'M') addOrToggleMarker();
  else if (e.key === 'n' || e.key === 'N') toggleSnap();
  else if (e.key === 'ArrowLeft') { e.preventDefault(); state.time = Math.max(0, state.time - (e.shiftKey ? 1 : frameDur)); renderPreview(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); state.time = Math.min(total(), state.time + (e.shiftKey ? 1 : frameDur)); renderPreview(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); jumpCut(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); jumpCut(1); }
  else if (e.key === 'j' || e.key === 'J') { state.time = Math.max(0, state.time - 2); renderPreview(); }
  else if (e.key === 'k' || e.key === 'K') { setPlaying(false); }
  else if (e.key === 'l' || e.key === 'L') { state.time = Math.min(total(), state.time + 2); renderPreview(); }
  else if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
});

const PRESET_CONFIGS = {
  tiktok: { aspect: '9:16', res: '1080', fps: '30', crf: '18' },
  youtube: { aspect: '16:9', res: '1080', fps: '60', crf: '18' },
  youtube4k: { aspect: '16:9', res: '2160', fps: '60', crf: '14' },
  instagram_feed: { aspect: '1:1', res: '1080', fps: '30', crf: '18' },
  instagram_portrait: { aspect: '4:5', res: '1080', fps: '30', crf: '18' }
};

if ($('quickPreset')) {
  $('quickPreset').onchange = (e) => {
    const cfg = PRESET_CONFIGS[e.target.value];
    if (!cfg) return;
    $('expAspect').value = cfg.aspect;
    $('expRes').value = cfg.res;
    $('expFps').value = cfg.fps;
    $('expQ').value = cfg.crf;
    applyAspect();
    toast(`Predefinição aplicada: ${e.target.options[e.target.selectedIndex].text}`);
  };
  ['expAspect', 'expRes', 'expFps', 'expQ'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', () => { $('quickPreset').value = 'custom'; });
  });
}

$('btnSave').onclick = async () => {
  if (await window.api.saveProject({
    media: state.media, clips: state.clips, texts: state.texts, audios: state.audios, overlays: state.overlays, tracks: state.tracks, markers: state.markers,
    settings: { aspect: $('expAspect').value, res: $('expRes').value, fps: $('expFps').value, crf: $('expQ').value }
  })) toast('Projeto salvo');
};
$('btnOpen').onclick = async () => {
  const d = await window.api.openProject(); if (!d) return;
  Object.assign(state, {
    media: d.media, clips: d.clips, texts: d.texts, audios: d.audios || [], overlays: d.overlays || [], markers: d.markers || [],
    tracks: d.tracks || { video: { visible: true, mute: false }, overlay: { visible: true }, text: { visible: true }, audio: { mute: false, solo: false } },
    selected: null, time: 0
  });
  uid = 1 + Math.max(0, ...state.clips.map(c => c.id), ...state.texts.map(t => t.id), ...state.audios.map(a => a.id), ...state.overlays.map(o => o.id), ...(state.markers || []).map(m => m.id));
  if (d.settings) { $('expAspect').value = d.settings.aspect; $('expRes').value = d.settings.res; $('expFps').value = d.settings.fps; $('expQ').value = d.settings.crf; }
  renderMedia(); renderTrackHeaders(); renderTimeline(); renderProps(); applyAspect();
};
$('btnExport').onclick = async () => {
  if (!state.clips.length) return toast('Adicione clipes à timeline');
  toast('Exportando...'); window.api.onProgress(s => toast(`Exportando... ${Math.min(99, Math.round(s / total() * 100))}%`));
  const r = await window.api.exportVideo({
    clips: state.clips, texts: state.texts, audios: state.audios, overlays: state.overlays, tracks: state.tracks,
    settings: { height: +$('expRes').value, fps: +$('expFps').value, crf: +$('expQ').value, aspect: $('expAspect').value }
  });
  toast(r.ok ? 'Exportado: ' + r.path : (r.log ? 'Erro: ' + r.log.slice(-200) : 'Cancelado'));
};

function applyAspect() {
  const [a, b] = $('expAspect').value.split(':').map(Number), st = $('stage');
  st.style.aspectRatio = `${a} / ${b}`;
  if (a >= b) { st.style.width = '100%'; st.style.height = 'auto'; } else { st.style.width = 'auto'; st.style.height = '50vh'; }
  renderPreview();
}
$('expAspect').onchange = applyAspect;

// Histórico (desfazer/refazer): detecta mudanças no projeto por comparação de snapshots.
const snapshot = () => JSON.stringify({ clips: state.clips, texts: state.texts, audios: state.audios, overlays: state.overlays, tracks: state.tracks, markers: state.markers });
let hLast = snapshot(); const undoStack = [], redoStack = [];
function hCheck() {
  const cur = snapshot();
  if (cur !== hLast) { undoStack.push(hLast); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; hLast = cur; }
}
function hApply(json) {
  const d = JSON.parse(json); Object.assign(state, d, { selected: null });
  if (!state.tracks) {
    state.tracks = { video: { visible: true, mute: false }, overlay: { visible: true }, text: { visible: true }, audio: { mute: false, solo: false } };
  }
  if (!state.markers) state.markers = [];
  hLast = json;
  renderTrackHeaders(); renderTimeline(); renderProps(); renderPreview();
}
function undo() { hCheck(); if (!undoStack.length) return; redoStack.push(snapshot()); hApply(undoStack.pop()); }
function redo() { hCheck(); if (!redoStack.length) return; undoStack.push(snapshot()); hApply(redoStack.pop()); }
setInterval(hCheck, 300);
$('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
document.addEventListener('keydown', (e) => {
  const t = e.target; if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && ['text', 'number'].includes(t.type))) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});
initTrackHeaders();
applyAspect();
renderTimeline(); renderPreview();
