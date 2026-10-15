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
  let b = 1 + (f.brightness || 0) / 100;
  let c = 1 + (f.contrast || 0) / 100;
  let s = 1 + (f.saturation || 0) / 100;
  if (f.beauty) {
    b += (f.beautyGlow ?? 30) / 350;
    c += 0.03;
    s += 0.05;
  }
  return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)}) blur(${f.blur || 0}px) grayscale(${f.grayscale ? 1 : 0}) ${CSS_PRESETS[f.preset] || ''}`;
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
  },
  custom: {
    label: '✏️ Curva Livre (Bezier Customizável)',
    badge: '✏️ Livre',
    desc: 'Curva Bezier livre: arraste os pontos para moldar acelerações e desacelerações, clique 2x no gráfico para criar keyframes e clique com botão direito para excluir.',
    segments: []
  }
};

function pointsToSegments(pts) {
  if (!pts || !Array.isArray(pts) || pts.length < 2) {
    return [{ start: 0, end: 1.0, speed: 1.0 }];
  }
  const sorted = [...pts].sort((a, b) => a.t - b.t);
  sorted[0] = { ...sorted[0], t: 0 };
  sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], t: 1.0 };
  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const p0 = sorted[i];
    const p1 = sorted[i + 1];
    const t0 = Math.max(0, Math.min(1, p0.t));
    const t1 = Math.max(t0 + 0.01, Math.min(1, p1.t));
    const sp = Math.max(0.1, Number(((p0.s + p1.s) / 2).toFixed(3)));
    segs.push({
      start: Number(t0.toFixed(3)),
      end: Number(t1.toFixed(3)),
      speed: sp
    });
  }
  return segs;
}

function getClipCurveSegments(clip) {
  if (!clip || clip.isImage || !clip.speedCurve || clip.speedCurve === 'none') return null;
  if (clip.speedCurve === 'custom') {
    if (!clip.customCurvePoints || clip.customCurvePoints.length < 2) {
      clip.customCurvePoints = [
        { t: 0, s: 1.0 },
        { t: 0.35, s: 2.5 },
        { t: 0.65, s: 0.4 },
        { t: 1.0, s: 1.0 }
      ];
    }
    return pointsToSegments(clip.customCurvePoints);
  }
  return SPEED_CURVES[clip.speedCurve]?.segments || null;
}

function getClipSample(clip, localTimelineTime) {
  if (clip.isImage) return { targetTime: 0, speed: 1 };
  const segments = getClipCurveSegments(clip);
  if (!segments) {
    const sp = clip.speed || 1;
    return {
      targetTime: clip.in + localTimelineTime * sp,
      speed: sp
    };
  }
  const srcDur = clip.srcDurUsed || (clip.duration * (clip.speed || 1));
  let curTl = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segIn = clip.in + seg.start * srcDur;
    const segEnd = clip.in + seg.end * srcDur;
    const segTlDur = (segEnd - segIn) / seg.speed;
    if (localTimelineTime <= curTl + segTlDur || i === segments.length - 1) {
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
  if (!curveKey || curveKey === 'none') {
    clip.speedCurve = 'none';
    const sp = clip.speed || 1;
    clip.duration = oldSrcDur / sp;
    return;
  }
  clip.speedCurve = curveKey;
  if (curveKey === 'custom' && (!clip.customCurvePoints || clip.customCurvePoints.length < 2)) {
    clip.customCurvePoints = [
      { t: 0, s: 1.0 },
      { t: 0.35, s: 2.5 },
      { t: 0.65, s: 0.4 },
      { t: 1.0, s: 1.0 }
    ];
  }
  const segments = getClipCurveSegments(clip);
  if (!segments) return;
  let totalTl = 0;
  for (const seg of segments) {
    const inStart = clip.in + seg.start * oldSrcDur;
    const inEnd = clip.in + seg.end * oldSrcDur;
    totalTl += (inEnd - inStart) / seg.speed;
  }
  clip.duration = Math.max(0.2, totalTl);
}

function speedToY(s, h = 60) {
  const minS = 0.1, maxS = 4.0;
  const norm = Math.max(0, Math.min(1, (s - minS) / (maxS - minS)));
  return Math.round((h - 8) - norm * (h - 16));
}

function yToSpeed(y, h = 60) {
  const minS = 0.1, maxS = 4.0;
  const norm = Math.max(0, Math.min(1, ((h - 8) - y) / (h - 16)));
  return Math.max(0.1, Math.min(5.0, Number((minS + norm * (maxS - minS)).toFixed(2))));
}

function catmullRomToBezier(points) {
  if (!points || points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function renderSpeedCurveSvg(curveKey) {
  const curve = SPEED_CURVES[curveKey];
  if (!curve) return '';
  const pts = [];
  pts.push({ x: 10, y: speedToY(curve.segments[0].speed, 60) });
  let lastX = 10;
  curve.segments.forEach((seg) => {
    const xEnd = 10 + Math.round(seg.end * 190);
    const yVal = speedToY(seg.speed, 60);
    pts.push({ x: xEnd, y: yVal });
    lastX = xEnd;
  });
  const pathD = pts.reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '');
  const areaD = `${pathD} L ${lastX} 56 L 10 56 Z`;
  const yNormal = speedToY(1.0, 60);
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

function renderBezierEditor(clip) {
  if (!clip.customCurvePoints || clip.customCurvePoints.length < 2) {
    clip.customCurvePoints = [
      { t: 0, s: 1.0 },
      { t: 0.35, s: 2.5 },
      { t: 0.65, s: 0.4 },
      { t: 1.0, s: 1.0 }
    ];
  }
  const W = 240, H = 100, padX = 14;
  const usableW = W - padX * 2;
  const sorted = [...clip.customCurvePoints].sort((a, b) => a.t - b.t);
  const pxPts = sorted.map((pt, idx) => ({
    x: padX + pt.t * usableW,
    y: speedToY(pt.s, H),
    s: pt.s,
    t: pt.t,
    idx
  }));

  const bezierD = catmullRomToBezier(pxPts);
  const areaD = `${bezierD} L ${padX + usableW} ${H - 6} L ${padX} ${H - 6} Z`;
  const yNormal = speedToY(1.0, H);
  const yFast = speedToY(2.0, H);
  const ySlow = speedToY(0.5, H);

  return `
    <div class="bezier-editor-card">
      <svg id="bezierCanvas" viewBox="0 0 ${W} ${H}" class="bezier-editor-svg">
        <defs>
          <linearGradient id="bezGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#00e5c3" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#7c5cff" stop-opacity="0.08"/>
          </linearGradient>
        </defs>
        <!-- Linhas de referência -->
        <line x1="${padX}" y1="${yFast}" x2="${W - padX}" y2="${yFast}" stroke="#2a2e3f" stroke-dasharray="2,2"/>
        <text x="${W - padX - 18}" y="${yFast - 2}" fill="#6b7280" font-size="7">2.0x</text>
        <line x1="${padX}" y1="${yNormal}" x2="${W - padX}" y2="${yNormal}" stroke="#00e5c3" stroke-dasharray="3,3" stroke-opacity="0.6"/>
        <text x="${W - padX - 18}" y="${yNormal - 2}" fill="#00e5c3" font-size="7" font-weight="700">1.0x</text>
        <line x1="${padX}" y1="${ySlow}" x2="${W - padX}" y2="${ySlow}" stroke="#2a2e3f" stroke-dasharray="2,2"/>
        <text x="${W - padX - 18}" y="${ySlow - 2}" fill="#6b7280" font-size="7">0.5x</text>

        <!-- Área e Linha Bezier -->
        <path d="${areaD}" fill="url(#bezGrad)"/>
        <path d="${bezierD}" fill="none" stroke="#00e5c3" stroke-width="2.5" stroke-linecap="round"/>

        <!-- Keyframes interativos -->
        ${pxPts.map((p) => `
          <g class="handle-group" data-idx="${p.idx}">
            <circle class="curve-handle" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="#7c5cff" stroke="#ffffff" stroke-width="1.8"/>
            <text x="${p.x.toFixed(1)}" y="${Math.max(10, p.y - 7).toFixed(1)}" fill="#e8eaf2" font-size="8" text-anchor="middle" font-weight="700">${p.s.toFixed(1)}x</text>
          </g>
        `).join('')}
      </svg>
      <div class="bezier-tools">
        <button type="button" id="btnAddBezierPt" class="bezier-btn">+ Ponto</button>
        <span style="font-size:10px;color:var(--mut);">Clique 2x p/ criar • Dir p/ excluir</span>
        <button type="button" id="btnResetBezier" class="bezier-btn">↺ Resetar</button>
      </div>
    </div>
  `;
}

function setupBezierEditorEvents(clip) {
  const svg = $('bezierCanvas');
  if (!svg || !clip || clip.speedCurve !== 'custom') return;

  const W = 240, H = 100, padX = 14;
  const usableW = W - padX * 2;

  svg.querySelectorAll('.handle-group').forEach(grp => {
    const idx = parseInt(grp.dataset.idx, 10);
    const circle = grp.querySelector('.curve-handle');
    if (!circle) return;

    circle.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const onMouseMove = (moveEvt) => {
        const rect = svg.getBoundingClientRect();
        const mouseX = moveEvt.clientX - rect.left;
        const mouseY = moveEvt.clientY - rect.top;

        const svgX = (mouseX / rect.width) * W;
        const svgY = (mouseY / rect.height) * H;

        const isEdge = idx === 0 || idx === clip.customCurvePoints.length - 1;
        if (!isEdge) {
          const tNorm = Math.max(0.02, Math.min(0.98, (svgX - padX) / usableW));
          clip.customCurvePoints[idx].t = Number(tNorm.toFixed(3));
        }

        const spd = yToSpeed(svgY, H);
        clip.customCurvePoints[idx].s = spd;

        applySpeedCurve(clip, 'custom');
        renderTimeline();
        renderProps();
        renderPreview();
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    circle.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!clip.customCurvePoints || clip.customCurvePoints.length <= 2) {
        toast('A curva deve ter no mínimo 2 pontos (início e fim).');
        return;
      }
      if (idx === 0 || idx === clip.customCurvePoints.length - 1) {
        toast('Os pontos de início (0%) e fim (100%) não podem ser excluídos.');
        return;
      }
      clip.customCurvePoints.splice(idx, 1);
      applySpeedCurve(clip, 'custom');
      renderTimeline();
      renderProps();
      renderPreview();
      toast('Keyframe de velocidade removido.');
    };
  });

  svg.ondblclick = (e) => {
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = (mouseX / rect.width) * W;
    const svgY = (mouseY / rect.height) * H;

    const tNorm = Math.max(0.05, Math.min(0.95, (svgX - padX) / usableW));
    const spd = yToSpeed(svgY, H);

    clip.customCurvePoints.push({ t: Number(tNorm.toFixed(3)), s: spd });
    clip.customCurvePoints.sort((a, b) => a.t - b.t);

    applySpeedCurve(clip, 'custom');
    renderTimeline();
    renderProps();
    renderPreview();
    toast(`Keyframe ${spd}x adicionado na posição ${(tNorm * 100).toFixed(0)}%!`);
  };

  if ($('btnAddBezierPt')) {
    $('btnAddBezierPt').onclick = () => {
      clip.customCurvePoints.push({ t: 0.5, s: 1.5 });
      clip.customCurvePoints.sort((a, b) => a.t - b.t);
      applySpeedCurve(clip, 'custom');
      renderTimeline();
      renderProps();
      renderPreview();
      toast('Novo keyframe adicionado à curva!');
    };
  }

  if ($('btnResetBezier')) {
    $('btnResetBezier').onclick = () => {
      clip.customCurvePoints = [
        { t: 0, s: 1.0 },
        { t: 0.35, s: 2.5 },
        { t: 0.65, s: 0.4 },
        { t: 1.0, s: 1.0 }
      ];
      applySpeedCurve(clip, 'custom');
      renderTimeline();
      renderProps();
      renderPreview();
      toast('Curva Bezier resetada para o padrão!');
    };
  }
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
  let ox = o.x;
  let oy = o.y;
  if (o.motionKeyframes && o.motionKeyframes.length > 0) {
    const kfs = o.motionKeyframes;
    const relTime = dt;
    let kfPrev = kfs[0], kfNext = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (relTime >= kfs[i].time && relTime <= kfs[i + 1].time) {
        kfPrev = kfs[i];
        kfNext = kfs[i + 1];
        break;
      }
    }
    const span = Math.max(0.001, kfNext.time - kfPrev.time);
    const kfPr = Math.min(1, Math.max(0, (relTime - kfPrev.time) / span));
    ox = kfPrev.cx + (kfNext.cx - kfPrev.cx) * kfPr;
    oy = kfPrev.cy + (kfNext.cy - kfPrev.cy) * kfPr;
  } else if (o.motion) {
    ox = o.x + ((o.x2 ?? o.x) - o.x) * pr;
    oy = o.y + ((o.y2 ?? o.y) - o.y) * pr;
  }
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
  if (o.borderWidth && o.borderWidth > 0) {
    el.style.border = `${o.borderWidth}px solid ${o.borderColor || '#ffffff'}`;
    el.style.borderRadius = `${o.borderRadius || 0}px`;
  } else {
    el.style.border = 'none';
    el.style.borderRadius = `${o.borderRadius || 0}px`;
  }
  if (o.glow) {
    const gc = o.glowColor || '#00e5c3';
    const gb = o.glowBlur || 15;
    if (o.isImage) {
      el.style.filter = `drop-shadow(0 0 ${gb}px ${gc}) drop-shadow(0 0 ${Math.round(gb * 1.6)}px ${gc})`;
      el.style.boxShadow = 'none';
    } else {
      el.style.boxShadow = `0 0 ${gb}px ${gc}, 0 0 ${Math.round(gb * 1.6)}px ${gc}`;
      el.style.filter = 'none';
    }
  } else {
    el.style.boxShadow = 'none';
    el.style.filter = 'none';
  }
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

async function executeSmartCutout(itemPath, targetKind, targetItem) {
  toast('Iniciando remoção de fundo por IA (Smart Cutout)...');
  window.api.onCutoutProgress(msg => toast(msg));
  try {
    const res = await window.api.smartCutout(itemPath);
    if (!res.ok) {
      return toast('Erro no recorte: ' + (res.error || 'Falha ao processar'));
    }
    const transparentPath = res.path;
    const cutName = '✂ ' + (targetItem?.name || 'Recorte IA');

    if (targetKind === 'overlay' && targetItem) {
      targetItem.path = transparentPath;
      targetItem.isImage = true;
      targetItem.chroma = false;
      renderPreview();
      renderProps();
      toast('Fundo do overlay removido com sucesso!');
    } else {
      const newOv = {
        id: uid++,
        path: transparentPath,
        name: cutName,
        isImage: true,
        start: state.time,
        in: 0,
        duration: targetItem ? Math.min(6, targetItem.duration) : 4,
        max: 999,
        scale: 35,
        rotate: 0,
        hflip: false,
        x: 0.5,
        y: 0.5,
        opacity: 1,
        motion: false,
        anim: 'zoom_in',
        chroma: false
      };
      state.overlays.push(newOv);
      select({ kind: 'overlay', id: newOv.id });
      renderTimeline();
      renderProps();
      renderPreview();
      toast('Objeto recortado adicionado à trilha de sobreposição!');
    }
  } catch (err) {
    toast('Erro: ' + (err.message || err));
  }
}

async function executeVideoMatting(itemPath, targetKind, targetItem) {
  toast('Iniciando matting de vídeo contínuo...');
  window.api.onVideoMattingProgress(data => toast(data.text || `Matting: ${data.percent}%`));
  try {
    const color = (targetItem && targetItem.chromaColor) ? targetItem.chromaColor : '0x00ff00';
    const similarity = (targetItem && targetItem.chromaSim) ? targetItem.chromaSim : 0.25;
    const res = await window.api.videoMatting({
      inputPath: itemPath,
      color,
      similarity,
      blend: 0.1,
      despill: true
    });
    if (!res.ok) {
      return toast('Erro no matting de vídeo: ' + (res.error || 'Falha ao processar'));
    }
    const transparentVideoPath = res.path;
    const matName = '✂ ' + (targetItem?.name || 'Vídeo Transparente');

    if (targetKind === 'overlay' && targetItem) {
      targetItem.path = transparentVideoPath;
      targetItem.isImage = false;
      targetItem.chroma = false;
      renderPreview();
      renderProps();
      toast('Vídeo de sobreposição atualizado com transparência contínua!');
    } else {
      const newOv = {
        id: uid++,
        path: transparentVideoPath,
        name: matName,
        isImage: false,
        start: state.time,
        in: 0,
        duration: targetItem ? targetItem.duration : 5,
        max: targetItem ? (targetItem.max || targetItem.duration) : 999,
        scale: 50,
        rotate: 0,
        hflip: false,
        x: 0.5,
        y: 0.5,
        opacity: 1,
        motion: false,
        anim: 'none',
        chroma: false
      };
      state.overlays.push(newOv);
      select({ kind: 'overlay', id: newOv.id });
      renderTimeline();
      renderProps();
      renderPreview();
      toast('Vídeo com transparência contínua adicionado à trilha de sobreposição (PiP)!');
    }
  } catch (err) {
    toast('Erro no matting: ' + (err.message || err));
  }
}

async function executeStabilizeVideo(clip) {
  if (!clip || clip.isImage) return;
  toast('Iniciando estabilização de vídeo (2 passos via FFmpeg)...');
  window.api.onStabilizeProgress(data => toast(data.text));
  try {
    const res = await window.api.stabilizeVideo({ inputPath: clip.path, shakiness: 8, smoothing: 30 });
    if (!res.ok) {
      return toast('Erro na estabilização: ' + (res.error || 'Falha ao processar'));
    }
    clip.path = res.path;
    clip.name = '🎥 ' + clip.name.replace(/^🎥\s*/, '');
    renderTimeline();
    renderProps();
    renderPreview();
    toast('Vídeo estabilizado com sucesso!');
  } catch (err) {
    toast('Erro: ' + (err.message || err));
  }
}

async function executeAutoReframe(clip, targetAspect, focus) {
  if (!clip || clip.isImage) return;
  toast(`Iniciando Auto Reframe → ${targetAspect} (foco: ${focus})...`);
  window.api.onReframeProgress(data => toast(data.text));
  try {
    const res = await window.api.autoReframe({
      inputPath: clip.path,
      targetAspect,
      focus,
      scaleH: state.settings?.height || 1080
    });
    if (!res.ok) return toast('Erro no Auto Reframe: ' + (res.error || 'Falha'));
    clip.path = res.path;
    clip.name = `📐 ${clip.name.replace(/^📐\s*/, '')}`;
    renderTimeline();
    renderProps();
    renderPreview();
    toast(`Auto Reframe ${targetAspect} aplicado com sucesso!`);
  } catch (err) {
    toast('Erro: ' + (err.message || err));
  }
}

async function executeMotionTrack(clip) {
  if (!clip || clip.isImage) return;
  toast('Analisando vetores de movimento do clipe...');
  window.api.onMotionTrackProgress(data => toast(data.text));
  try {
    const res = await window.api.motionTrack({ inputPath: clip.path, sampleEvery: 4 });
    if (!res.ok) return toast('Erro no Motion Track: ' + (res.error || 'Falha'));

    if (!res.keyframes || res.keyframes.length === 0) {
      return toast('Nenhum keyframe de movimento detectado no clipe.');
    }

    // Aplica os keyframes de rastreamento ao overlay selecionado ou salva no clipe
    const sel = state.selected;
    if (sel && sel.kind === 'overlay') {
      const ov = state.overlays.find(o => o.id === sel.id);
      if (ov) {
        ov.motion = true;
        ov.motionKeyframes = res.keyframes;
        ov.x = res.keyframes[0].cx;
        ov.y = res.keyframes[0].cy;
        ov.x2 = res.keyframes[res.keyframes.length - 1].cx;
        ov.y2 = res.keyframes[res.keyframes.length - 1].cy;
        renderProps();
        renderPreview();
        toast(`Motion Track aplicado ao overlay: ${res.keyframes.length} keyframes de posição ancorados!`);
        return;
      }
    }
    clip.motionTrackData = res.keyframes;
    toast(`Análise concluída: ${res.keyframes.length} keyframes de movimento em ${res.duration?.toFixed(1)}s. Selecione um overlay para ancorar.`);
  } catch (err) {
    toast('Erro: ' + (err.message || err));
  }
}

function renderProps() {
  const p = $('props'); const s = state.selected;
  if (!s) { p.innerHTML = '<p class="hint">Selecione um clipe na timeline.</p>'; return; }
  if (s.kind === 'overlay') {
    const o = state.overlays.find(x => x.id === s.id); if (!o) return;
    const r = (id, label, min, max, step, val) => `<div class="prop">${label}<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
    p.innerHTML = `<div class="prop">Início (s)<input type="number" id="oStart" value="${o.start.toFixed(1)}" min="0" step="0.5"></div>`
      + `<div class="prop">Duração (s)<input type="number" id="oDur" value="${o.duration.toFixed(1)}" min="0.5" step="0.5"></div>`
      + `<button id="btnSmartCutoutOverlay" class="wide primary">✂ Remover Fundo por IA (Smart Cutout)</button>`
      + (!o.isImage ? `<button id="btnVideoMattingOverlay" class="wide secondary" style="margin-top:4px;">✂ Matting de Vídeo Contínuo (Remover Fundo)</button>` : '')
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
      + (o.motionKeyframes && o.motionKeyframes.length > 0
        ? `<div class="prop" style="color:#00b894;font-size:11px;display:flex;justify-content:space-between;align-items:center;background:#1a2520;padding:6px;border-radius:4px;border:1px solid #00b894;"><span>🎯 Motion Track Ativo (${o.motionKeyframes.length} pts)</span><button id="btnRemoveTrack" style="padding:2px 8px;font-size:10px;">Remover</button></div>`
        : `<button id="btnTrackUnderOverlay" class="wide secondary" style="margin-top:4px;">🎯 Ancorar ao Movimento do Clipe Abaixo</button>`)
      + `<div class="prop"><label><input type="checkbox" id="oMot" ${o.motion ? 'checked' : ''}> Animar posição (início → fim)</label></div>`
      + `<div class="prop">Movimento<select id="oEase">
        <option value="linear" ${(o.easing || 'linear') === 'linear' ? 'selected' : ''}>Linear</option>
        <option value="smooth" ${o.easing === 'smooth' ? 'selected' : ''}>Suave (Cinemático)</option>
      </select></div>`
      + r('oX2', 'Posição horizontal final', 0, 1, 0.01, o.x2 ?? o.x)
      + r('oY2', 'Posição vertical final', 0, 1, 0.01, o.y2 ?? o.y)
      + `<div class="prop"><label><input type="checkbox" id="oChroma" ${o.chroma ? 'checked' : ''}> Chroma key (remover cor)</label></div>`
      + `<div class="prop">Cor<input type="color" id="oCColor" value="${o.chromaColor || '#00ff00'}"></div>`
      + r('oCSim', 'Tolerância', 0.05, 0.6, 0.01, o.chromaSim ?? 0.3)
      + `<div class="prop-card">
          <div class="prop-card-title">🎨 Borda & Glow Neon (Estilo PiP)</div>
          <div class="prop">Borda: <span id="lblOBorder">${o.borderWidth || 0}px</span>
            <input type="range" id="oBorderWidth" min="0" max="25" step="1" value="${o.borderWidth || 0}">
          </div>
          <div class="prop">Cor da Borda
            <input type="color" id="oBorderColor" value="${o.borderColor || '#ffffff'}">
          </div>
          <div class="prop">Arredondamento: <span id="lblORadius">${o.borderRadius || 0}px</span>
            <input type="range" id="oBorderRadius" min="0" max="50" step="1" value="${o.borderRadius || 0}">
          </div>
          <div class="prop"><label><input type="checkbox" id="oGlow" ${o.glow ? 'checked' : ''}> Ativar Efeito Glow / Neon</label></div>
          ${o.glow ? `
            <div class="prop">Cor do Glow
              <input type="color" id="oGlowColor" value="${o.glowColor || '#00e5c3'}">
            </div>
            <div class="prop">Raio do Glow: <span id="lblOGlowBlur">${o.glowBlur || 15}px</span>
              <input type="range" id="oGlowBlur" min="5" max="45" step="1" value="${o.glowBlur || 15}">
            </div>
            <div style="display:flex;gap:4px;margin-top:4px;">
              <button type="button" class="btn-glow-chip" data-color="#00e5c3" style="background:#00e5c3;color:#000;padding:2px 6px;font-size:10px;border-radius:4px;border:none;cursor:pointer;">Ciano</button>
              <button type="button" class="btn-glow-chip" data-color="#ff007f" style="background:#ff007f;color:#fff;padding:2px 6px;font-size:10px;border-radius:4px;border:none;cursor:pointer;">Neon Pink</button>
              <button type="button" class="btn-glow-chip" data-color="#ffd700" style="background:#ffd700;color:#000;padding:2px 6px;font-size:10px;border-radius:4px;border:none;cursor:pointer;">Dourado</button>
              <button type="button" class="btn-glow-chip" data-color="#7c5cff" style="background:#7c5cff;color:#fff;padding:2px 6px;font-size:10px;border-radius:4px;border:none;cursor:pointer;">Roxo</button>
            </div>
          ` : ''}
        </div>`;
    if ($('oBorderWidth')) $('oBorderWidth').oninput = (e) => {
      o.borderWidth = +e.target.value;
      if ($('lblOBorder')) $('lblOBorder').textContent = `${o.borderWidth}px`;
      renderPreview();
    };
    if ($('oBorderColor')) $('oBorderColor').oninput = (e) => {
      o.borderColor = e.target.value;
      renderPreview();
    };
    if ($('oBorderRadius')) $('oBorderRadius').oninput = (e) => {
      o.borderRadius = +e.target.value;
      if ($('lblORadius')) $('lblORadius').textContent = `${o.borderRadius}px`;
      renderPreview();
    };
    if ($('oGlow')) $('oGlow').onchange = (e) => {
      o.glow = e.target.checked;
      renderProps();
      renderPreview();
    };
    if ($('oGlowColor')) $('oGlowColor').oninput = (e) => {
      o.glowColor = e.target.value;
      renderPreview();
    };
    if ($('oGlowBlur')) $('oGlowBlur').oninput = (e) => {
      o.glowBlur = +e.target.value;
      if ($('lblOGlowBlur')) $('lblOGlowBlur').textContent = `${o.glowBlur}px`;
      renderPreview();
    };
    p.querySelectorAll('.btn-glow-chip').forEach(btn => {
      btn.onclick = () => {
        o.glowColor = btn.dataset.color;
        if ($('oGlowColor')) $('oGlowColor').value = o.glowColor;
        renderPreview();
      };
    });
    if ($('btnSmartCutoutOverlay')) $('btnSmartCutoutOverlay').onclick = () => executeSmartCutout(o.path, 'overlay', o);
    if ($('btnVideoMattingOverlay')) $('btnVideoMattingOverlay').onclick = () => executeVideoMatting(o.path, 'overlay', o);
    if ($('btnRemoveTrack')) {
      $('btnRemoveTrack').onclick = () => {
        delete o.motionKeyframes;
        renderProps();
        renderPreview();
        toast('Rastreamento de movimento desvinculado do overlay.');
      };
    }
    if ($('btnTrackUnderOverlay')) {
      $('btnTrackUnderOverlay').onclick = () => {
        const baseClip = state.clips.find(c => !c.isImage && o.start >= c.start && o.start < c.start + c.duration) || state.clips[0];
        if (!baseClip) return toast('Nenhum clipe de vídeo encontrado sob o overlay.');
        executeMotionTrack(baseClip);
      };
    }
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
        <div class="prop"><label><input type="checkbox" id="pSlowMo" ${c.filters.smoothSlowMo ? 'checked' : ''}> Câmera lenta suave (Interpolação de Quadros / Optical Flow)</label></div>
      ` : `
        <div class="prop">Modo de Curva
          <select id="pCurvePreset">
            ${Object.keys(SPEED_CURVES).map(k => `<option ${c.speedCurve === k ? 'selected' : ''} value="${k}">${SPEED_CURVES[k].label}</option>`).join('')}
          </select>
        </div>
        ${c.speedCurve === 'custom' ? renderBezierEditor(c) : `
          <div class="speed-curve-card">
            ${renderSpeedCurveSvg(c.speedCurve || 'hero')}
            <div class="speed-curve-desc">${SPEED_CURVES[c.speedCurve || 'hero']?.desc || ''}</div>
          </div>
        `}
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
       + `<div class="prop-card">
           <div class="prop-card-title">✨ Retoque Facial / Efeito Beauty (Pele Suave)</div>
           <div class="prop"><label><input type="checkbox" id="pBeauty" ${c.filters.beauty ? 'checked' : ''}> Suavização de Pele & Iluminação (Beauty)</label></div>
           ${c.filters.beauty ? `
             <div class="prop">Suavização Bilateral: <span id="lblBeautySmooth">${c.filters.beautySmooth ?? 50}%</span>
               <input type="range" id="pBeautySmooth" min="10" max="100" value="${c.filters.beautySmooth ?? 50}">
             </div>
             <div class="prop">Realce / Iluminação: <span id="lblBeautyGlow">${c.filters.beautyGlow ?? 30}%</span>
               <input type="range" id="pBeautyGlow" min="0" max="100" value="${c.filters.beautyGlow ?? 30}">
             </div>
           ` : ''}
         </div>`
       + `<div class="prop">Volume<input type="range" id="pVol" min="0" max="1" step="0.05" value="${c.volume ?? 1}"></div>
       <div class="prop"><label><input type="checkbox" id="pDenoise" ${c.filters.denoise ? 'checked' : ''}> Redução de ruído (chiado)</label></div>
       <div class="prop"><label><input type="checkbox" id="pLoudnorm" ${c.filters.loudnorm ? 'checked' : ''}> Normalizar volume (-14 LUFS)</label></div>`
       + `<button id="btnSmartCutoutClip" class="wide primary">✂ Extrair Objeto com IA para Sobreposição (PiP)</button>`
       + (!c.isImage ? `<button id="btnVideoMattingClip" class="wide secondary" style="margin-top:4px;">✂ Matting de Vídeo Contínuo (Extrair Vídeo Transparente PiP)</button>` : '')
       + (!c.isImage ? `<button id="btnStabilizeClip" class="wide" style="margin-top:4px;">🎥 Estabilizar Vídeo (Reduzir Trepidação)</button>` : '')
       + (!c.isImage ? `<div class="prop" style="margin-top:6px;gap:4px;flex-wrap:wrap;">
           <span style="font-size:11px;opacity:.7;width:100%;margin-bottom:2px;">📐 Auto Reframe</span>
           <select id="pReframeAspect" style="flex:1;min-width:70px;"><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="4:5">4:5</option><option value="16:9">16:9</option></select>
           <select id="pReframeFocus" style="flex:1;min-width:70px;"><option value="center">Centro</option><option value="left">Esquerda</option><option value="right">Direita</option></select>
           <button id="btnAutoReframeClip" class="wide" style="margin-top:2px;">📐 Aplicar Reenquadramento</button>
         </div>` : '')
       + (!c.isImage ? `<button id="btnMotionTrackClip" class="wide" style="margin-top:4px;">🎯 Motion Track (Analisar Movimento)</button>` : '')
       + (c.hasAudio && !c.isImage ? `<button id="btnDetach" class="wide">Separar Áudio do Vídeo</button>` : '');
  p.querySelectorAll('input[data-k]').forEach(i => i.oninput = () => { c.filters[i.dataset.k] = +i.value; renderPreview(); });
  $('pFill').onchange = (e) => { c.filters.fillMode = e.target.value; renderPreview(); };
  if ($('btnSmartCutoutClip')) $('btnSmartCutoutClip').onclick = () => executeSmartCutout(c.path, 'clip', c);
  if ($('btnVideoMattingClip')) $('btnVideoMattingClip').onclick = () => executeVideoMatting(c.path, 'clip', c);
  if ($('btnStabilizeClip')) $('btnStabilizeClip').onclick = () => executeStabilizeVideo(c);
  if ($('btnAutoReframeClip')) $('btnAutoReframeClip').onclick = () => {
    const aspect = $('pReframeAspect')?.value || '9:16';
    const focus  = $('pReframeFocus')?.value  || 'center';
    executeAutoReframe(c, aspect, focus);
  };
  if ($('btnMotionTrackClip')) $('btnMotionTrackClip').onclick = () => executeMotionTrack(c);
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
  if ($('pSlowMo')) $('pSlowMo').onchange = (e) => { c.filters.smoothSlowMo = e.target.checked; };
  if ($('pCurvePreset')) $('pCurvePreset').onchange = (e) => {
    applySpeedCurve(c, e.target.value);
    renderTimeline(); renderProps(); renderPreview();
  };
  if ($('pBeauty')) $('pBeauty').onchange = (e) => {
    c.filters.beauty = e.target.checked;
    renderProps();
    renderPreview();
  };
  if ($('pBeautySmooth')) $('pBeautySmooth').oninput = (e) => {
    c.filters.beautySmooth = +e.target.value;
    if ($('lblBeautySmooth')) $('lblBeautySmooth').textContent = `${c.filters.beautySmooth}%`;
    renderPreview();
  };
  if ($('pBeautyGlow')) $('pBeautyGlow').oninput = (e) => {
    c.filters.beautyGlow = +e.target.value;
    if ($('lblBeautyGlow')) $('lblBeautyGlow').textContent = `${c.filters.beautyGlow}%`;
    renderPreview();
  };
  if (c.speedCurve === 'custom') {
    setupBezierEditorEvents(c);
  }
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

async function detectScenes() {
  const hit = clipAt(state.time);
  const targetClip = (state.selected?.kind === 'clip' ? state.clips.find(c => c.id === state.selected.id) : null) || (hit ? hit.c : null);
  if (!targetClip) return toast('Selecione um clipe de vídeo para detectar cenas');
  if (targetClip.isImage || !targetClip.hasVideo) return toast('A detecção de cenas requer um arquivo de vídeo');

  const btn = $('btnDetectScenes');
  if (btn) btn.disabled = true;
  toast('🎬 Analisando transições de cena com IA/FFmpeg...');

  try {
    const res = await window.api.detectScenes(targetClip.path, 0.35);
    if (!res || !res.ok) {
      return toast('Erro na detecção de cenas: ' + (res?.error || 'falha no processamento'));
    }
    const cuts = res.scenes || [];
    if (!cuts.length) {
      return toast('Nenhum corte de cena significativo detectado neste vídeo');
    }

    const { starts } = layout();
    const clipIdx = state.clips.indexOf(targetClip);
    const clipStart = starts[clipIdx];
    let createdCount = 0;

    for (const cutTime of cuts) {
      const srcStart = targetClip.in;
      const srcEnd = targetClip.in + targetClip.duration * (targetClip.speed || 1);
      if (cutTime > srcStart && cutTime < srcEnd) {
        const tlTime = clipStart + (cutTime - srcStart) / (targetClip.speed || 1);
        if (!state.markers.some(m => Math.abs(m.time - tlTime) < 0.2)) {
          state.markers.push({
            id: uid++,
            time: Number(tlTime.toFixed(3)),
            label: 'Cena'
          });
          createdCount++;
        }
      }
    }

    renderTimeline();
    renderPreview();
    hCheck();
    toast(`🎬 ${createdCount} transições de cena detectadas e marcadas na timeline!`);
  } catch (err) {
    toast('Erro: ' + (err.message || err));
  } finally {
    if (btn) btn.disabled = false;
  }
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
    if (m.hasVideo || m.isImage) {
      const bCut = document.createElement('button');
      bCut.className = 'pip';
      bCut.textContent = '✂';
      bCut.title = 'Remover fundo por IA (Smart Cutout)';
      bCut.style.marginRight = '4px';
      bCut.onclick = (ev) => {
        ev.stopPropagation();
        executeSmartCutout(m.path, 'media', m);
      };
      e.prepend(bCut);

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
if ($('btnDetectScenes')) $('btnDetectScenes').onclick = detectScenes;
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
  else if (e.key === 'b' || e.key === 'B') addFlashEffect();
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

if ($('btnImportCapcut')) {
  $('btnImportCapcut').onclick = async () => {
    toast('Carregando projeto do CapCut...');
    const res = await window.api.importCapCutDraft();
    if (!res) return;
    if (!res.ok) return toast('Erro: ' + (res.error || 'Falha ao importar'));
    const d = res.project;
    Object.assign(state, {
      media: d.media || [],
      clips: d.clips || [],
      texts: d.texts || [],
      audios: d.audios || [],
      overlays: d.overlays || [],
      markers: d.markers || [],
      tracks: d.tracks || { video: { visible: true, mute: false }, overlay: { visible: true }, text: { visible: true }, audio: { mute: false, solo: false } },
      selected: null,
      time: 0
    });
    uid = 1 + Math.max(0, ...state.clips.map(c => c.id), ...state.texts.map(t => t.id), ...state.audios.map(a => a.id), ...state.overlays.map(o => o.id), ...(state.markers || []).map(m => m.id));
    if (d.settings) {
      if ($('expAspect')) $('expAspect').value = d.settings.aspect || '16:9';
      if ($('expRes')) $('expRes').value = d.settings.res || '1080';
      if ($('expFps')) $('expFps').value = d.settings.fps || '30';
      if ($('expQ')) $('expQ').value = d.settings.crf || '18';
    }
    renderMedia(); renderTrackHeaders(); renderTimeline(); renderProps(); applyAspect();
    hCheck();
    toast(`CapCut importado com sucesso: ${state.clips.length} clipes, ${state.audios.length} áudios`);
  };
}

if ($('btnExportCapcut')) {
  $('btnExportCapcut').onclick = async () => {
    if (!state.clips.length && !state.audios.length) return toast('Adicione clipes à timeline antes de exportar');
    const projectState = {
      media: state.media,
      clips: state.clips,
      texts: state.texts,
      audios: state.audios,
      overlays: state.overlays,
      tracks: state.tracks,
      settings: {
        aspect: $('expAspect').value,
        res: $('expRes').value,
        fps: $('expFps').value,
        crf: $('expQ').value
      }
    };
    const ok = await window.api.exportCapCutDraft(projectState);
    if (ok) toast('Projeto exportado no formato CapCut (draft_content.json)');
  };
}
// ── Fase 8: Controles Dinâmicos de Formato, Bitrate e Exportação de Áudio ─────
function updateExportControls() {
  const fmt = $('expFormat') ? $('expFormat').value : 'mp4';
  const mode = $('expBitrateMode') ? $('expBitrateMode').value : 'crf';
  const isProRes = fmt.startsWith('prores');

  if ($('expBitrateMode')) $('expBitrateMode').style.display = isProRes ? 'none' : 'inline-block';

  if (isProRes) {
    if ($('expBitrate')) $('expBitrate').style.display = 'none';
    if ($('expQ')) $('expQ').style.display = 'none';
  } else if (mode === 'cbr' || mode === 'vbr2pass') {
    if ($('expBitrate')) $('expBitrate').style.display = 'inline-block';
    if ($('expQ')) $('expQ').style.display = 'none';
  } else {
    // Modo CRF
    if ($('expBitrate')) $('expBitrate').style.display = 'none';
    if ($('expQ')) $('expQ').style.display = 'inline-block';
  }
}
if ($('expFormat')) $('expFormat').onchange = updateExportControls;
if ($('expBitrateMode')) $('expBitrateMode').onchange = updateExportControls;
updateExportControls();

$('btnExport').onclick = async () => {
  if (!state.clips.length) return toast('Adicione clipes à timeline');
  toast('Exportando...');
  window.api.onProgress(s => {
    const tot = total() || 1;
    if (typeof s === 'object' && s !== null) {
      toast(`${s.text} ${Math.min(99, Math.round(s.time / tot * 100))}%`);
    } else {
      toast(`Exportando... ${Math.min(99, Math.round(s / tot * 100))}%`);
    }
  });

  const format = $('expFormat') ? $('expFormat').value : 'mp4';
  const bitrateMode = $('expBitrateMode') ? $('expBitrateMode').value : 'crf';
  const bitrate = $('expBitrate') ? +$('expBitrate').value : 8000;
  const colorProfile = $('expColorProfile') ? $('expColorProfile').value : 'bt709';

  const r = await window.api.exportVideo({
    clips: state.clips, texts: state.texts, audios: state.audios, overlays: state.overlays, tracks: state.tracks,
    settings: {
      height: +$('expRes').value,
      fps: +$('expFps').value,
      crf: +$('expQ').value,
      aspect: $('expAspect').value,
      format,
      bitrateMode,
      bitrate,
      colorProfile
    }
  });
  toast(r.ok ? 'Exportado com sucesso: ' + r.path : (r.log ? 'Erro: ' + r.log.slice(-200) : 'Cancelado'));
};

if ($('btnExportAudio')) {
  $('btnExportAudio').onclick = async () => {
    if (!state.clips.length && (!state.audios || !state.audios.length)) {
      return toast('Adicione clipes ou áudios à timeline');
    }
    toast('Exportando áudio...');
    if (window.api.onExportAudioProgress) {
      window.api.onExportAudioProgress(s => {
        const tot = total() || 1;
        toast(`Exportando áudio... ${Math.min(99, Math.round(s / tot * 100))}%`);
      });
    }
    const r = await window.api.exportAudioOnly({
      clips: state.clips,
      audios: state.audios,
      tracks: state.tracks
    });
    toast(r.ok ? 'Áudio exportado: ' + r.path : (r.log ? 'Erro: ' + r.log.slice(-200) : 'Cancelado'));
  };
}

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

let sfxAudioPlayer = null;

function initPanelTabs() {
  const tabM = $('tabMedia'), tabS = $('tabSfx');
  const viewM = $('mediaView'), viewS = $('sfxView');
  if (tabM && tabS && viewM && viewS) {
    tabM.onclick = () => {
      tabM.classList.add('active');
      tabS.classList.remove('active');
      viewM.hidden = false;
      viewS.hidden = true;
    };
    tabS.onclick = () => {
      tabS.classList.add('active');
      tabM.classList.remove('active');
      viewM.hidden = true;
      viewS.hidden = false;
    };
  }
}

async function initSfx() {
  const listEl = $('sfxList');
  if (!listEl || !window.api || !window.api.getSfxList) return;
  try {
    const list = await window.api.getSfxList();
    listEl.innerHTML = '';
    list.forEach(item => {
      const el = document.createElement('div');
      el.className = 'sfx-item';
      el.innerHTML = `
        <div class="sfx-info">
          <span class="sfx-title">${item.name}</span>
          <span class="sfx-dur">${item.duration.toFixed(2)}s · Efeito Nativo</span>
        </div>
        <div class="sfx-actions">
          <button class="sfx-preview-btn" title="Ouvir pré-escuta">▶</button>
          <button class="sfx-add-btn" title="Inserir na trilha de áudio">+</button>
        </div>
      `;
      const btnPlay = el.querySelector('.sfx-preview-btn');
      const btnAdd = el.querySelector('.sfx-add-btn');

      btnPlay.onclick = async (ev) => {
        ev.stopPropagation();
        if (btnPlay.textContent === '⏹') {
          if (sfxAudioPlayer) { sfxAudioPlayer.pause(); sfxAudioPlayer = null; }
          btnPlay.textContent = '▶';
          return;
        }
        btnPlay.textContent = '⏳';
        try {
          const res = await window.api.generateSfx(item.key);
          if (sfxAudioPlayer) { sfxAudioPlayer.pause(); }
          sfxAudioPlayer = new Audio(fileUrl(res.path));
          sfxAudioPlayer.onended = () => { btnPlay.textContent = '▶'; };
          await sfxAudioPlayer.play();
          btnPlay.textContent = '⏹';
        } catch (err) {
          btnPlay.textContent = '▶';
          toast('Erro ao reproduzir SFX: ' + (err.message || err));
        }
      };

      btnAdd.onclick = async (ev) => {
        ev.stopPropagation();
        btnAdd.disabled = true;
        try {
          const res = await window.api.generateSfx(item.key);
          const a = {
            id: uid++,
            path: res.path,
            name: res.name,
            start: state.time,
            in: 0,
            duration: res.duration,
            max: res.duration,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0
          };
          state.audios.push(a);
          select({ kind: 'audio', id: a.id });
          renderTimeline();
          renderPreview();
          toast(`Efeito adicionado: ${res.name}`);
        } catch (err) {
          toast('Erro ao inserir SFX: ' + (err.message || err));
        } finally {
          btnAdd.disabled = false;
        }
      };

      listEl.appendChild(el);
    });
  } catch (err) {
    console.error('Falha ao carregar lista de SFX:', err);
  }
}

async function addFlashEffect() {
  try {
    const res = await window.api.generateFlash();
    if (!res || !res.path) return;
    const dur = 0.25;
    const ov = {
      id: uid++,
      path: res.path,
      name: '⚡ Flash Batida',
      isImage: true,
      start: state.time,
      in: 0,
      duration: dur,
      max: 999,
      scale: 100,
      rotate: 0,
      hflip: false,
      x: 0.5,
      y: 0.5,
      opacity: 1,
      motion: false,
      anim: 'fade',
      chroma: false
    };
    state.overlays.push(ov);
    select({ kind: 'overlay', id: ov.id });
    renderTimeline();
    renderPreview();
    toast('⚡ Flash de impacto inserido no cursor!');
  } catch (err) {
    toast('Erro ao gerar Flash: ' + (err.message || err));
  }
}

if ($('btnFlash')) $('btnFlash').onclick = addFlashEffect;

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 7 — IA Avançada Local: Lógica de UI e Integração
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Tab IA: controle de visibilidade ────────────────────────────────────────
function initAiTab() {
  const tabAi = $('tabAi'), viewAi = $('aiView');
  const tabMedia = $('tabMedia'), viewMedia = $('mediaView');
  const tabSfx = $('tabSfx'), viewSfx = $('sfxView');
  if (!tabAi || !viewAi) return;

  // Registra o tabAi no sistema de tabs existente
  const origTabMediaClick = tabMedia?.onclick;
  const origTabSfxClick = tabSfx?.onclick;

  tabAi.onclick = () => {
    tabAi.classList.add('active');
    if (tabMedia) { tabMedia.classList.remove('active'); if (viewMedia) viewMedia.hidden = true; }
    if (tabSfx) { tabSfx.classList.remove('active'); if (viewSfx) viewSfx.hidden = true; }
    viewAi.hidden = false;
  };

  // Sobrescreve os clicks das outras abas para também ocultar o aiView
  if (tabMedia) {
    tabMedia.onclick = () => {
      tabMedia.classList.add('active');
      if (tabSfx) tabSfx.classList.remove('active');
      tabAi.classList.remove('active');
      if (viewMedia) viewMedia.hidden = false;
      if (viewSfx) viewSfx.hidden = true;
      viewAi.hidden = true;
    };
  }
  if (tabSfx) {
    tabSfx.onclick = () => {
      tabSfx.classList.add('active');
      if (tabMedia) tabMedia.classList.remove('active');
      tabAi.classList.remove('active');
      if (viewSfx) viewSfx.hidden = false;
      if (viewMedia) viewMedia.hidden = true;
      viewAi.hidden = true;
    };
  }

  // Sliders com valor ao vivo
  const beatSens = $('beatSensitivity'), beatSensVal = $('beatSensVal');
  if (beatSens && beatSensVal) {
    beatSens.oninput = () => { beatSensVal.textContent = parseFloat(beatSens.value).toFixed(2); };
  }
  const ttsSpeed = $('ttsSpeed'), ttsSpeedVal = $('ttsSpeedVal');
  if (ttsSpeed && ttsSpeedVal) {
    ttsSpeed.oninput = () => { ttsSpeedVal.textContent = parseFloat(ttsSpeed.value).toFixed(1) + 'x'; };
  }
}

// ─── 7.1a: Separação de Stems ────────────────────────────────────────────────
function initStemSeparation() {
  const btn = $('btnStemSep'), status = $('stemStatus');
  if (!btn || !window.api?.stemSeparate) return;

  window.api.onStemProgress((data) => {
    if (status) {
      status.hidden = false;
      status.textContent = typeof data === 'string' ? data : (data.text || '');
    }
  });

  btn.onclick = async () => {
    // Tenta usar o clipe selecionado ou o primeiro da timeline/áudio
    let targetPath = null;
    if (state.selected) {
      const { kind, id } = state.selected;
      const item = (kind === 'clip' ? state.clips : kind === 'audio' ? state.audios : []).find(x => x.id === id);
      if (item?.path) targetPath = item.path;
    }
    if (!targetPath && state.clips.length) targetPath = state.clips[0].path;
    if (!targetPath && state.audios.length) targetPath = state.audios[0].path;
    if (!targetPath) return toast('Selecione um clipe ou áudio na timeline primeiro');

    btn.disabled = true;
    if (status) { status.hidden = false; status.textContent = 'Iniciando separação de stems...'; }
    toast('🎚️ Separando stems de áudio...');

    try {
      const mode = $('stemMode')?.value || 'both';
      const res = await window.api.stemSeparate({ inputPath: targetPath, mode });
      if (!res.ok) {
        toast('Erro: ' + (res.error || 'Falha na separação'));
        if (status) status.textContent = '❌ ' + (res.error || 'Falha');
        return;
      }

      let added = 0;
      if (res.vocalPath) {
        const vInfo = res.vocalInfo || {};
        const a = {
          id: uid++,
          path: res.vocalPath,
          name: '🎙️ Voz: ' + (vInfo.name || 'vocal.wav'),
          start: state.time,
          in: 0,
          duration: vInfo.duration || 5,
          max: vInfo.duration || 5,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          wave: vInfo.wave
        };
        state.audios.push(a);
        added++;
      }
      if (res.instrPath) {
        const iInfo = res.instrInfo || {};
        const a = {
          id: uid++,
          path: res.instrPath,
          name: '🎵 Instrumental: ' + (iInfo.name || 'instrumental.wav'),
          start: state.time + (res.vocalPath ? (res.vocalInfo?.duration || 0) + 0.1 : 0),
          in: 0,
          duration: iInfo.duration || 5,
          max: iInfo.duration || 5,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          wave: iInfo.wave
        };
        // Coloca o instrumental abaixo da voz, ambos no cursor atual
        a.start = state.time;
        state.audios.push(a);
        added++;
      }

      renderTimeline(); renderPreview();
      const msg = `✅ ${added} stem(s) adicionados na trilha de áudio!`;
      toast(msg);
      if (status) status.textContent = msg;
    } catch (err) {
      toast('Erro ao separar stems: ' + (err.message || err));
      if (status) status.textContent = '❌ Erro: ' + (err.message || err);
    } finally {
      btn.disabled = false;
    }
  };
}

// ─── 7.1b: Detecção de Batidas ───────────────────────────────────────────────
async function runBeatDetect(opts = {}) {
  const btnTool = $('btnBeatDetect'), btnBar = $('btnBeatMarks');
  const status = $('beatStatus');
  [btnTool, btnBar].forEach(b => { if (b) b.disabled = true; });
  if (status) { status.hidden = false; status.textContent = 'Analisando batidas...'; }
  toast('🥁 Detectando batidas musicais...');

  // Determina o arquivo-alvo
  let targetPath = opts.inputPath;
  if (!targetPath) {
    if (state.selected) {
      const { kind, id } = state.selected;
      const item = (kind === 'clip' ? state.clips : kind === 'audio' ? state.audios : []).find(x => x.id === id);
      if (item?.path) targetPath = item.path;
    }
    if (!targetPath && state.clips.length) targetPath = state.clips[0].path;
    if (!targetPath && state.audios.length) targetPath = state.audios[0].path;
  }
  if (!targetPath) {
    toast('Selecione um clipe ou áudio para detectar batidas');
    [btnTool, btnBar].forEach(b => { if (b) b.disabled = false; });
    return;
  }

  window.api.onBeatProgress((data) => {
    if (status) status.textContent = typeof data === 'string' ? data : (data.text || '');
  });

  try {
    const sensitivity = parseFloat($('beatSensitivity')?.value || 0.6);
    const maxBpm = parseInt($('beatMaxBpm')?.value || 200);
    const res = await window.api.beatDetect({ inputPath: targetPath, sensitivity, minBpm: 60, maxBpm });
    if (!res.ok) {
      toast('Erro: ' + (res.error || 'Falha na detecção'));
      if (status) status.textContent = '❌ ' + res.error;
      return;
    }

    // Gera marcadores na timeline para cada batida
    let added = 0;
    for (const t of res.beats) {
      const existing = (state.markers || []).some(m => Math.abs(m.time - t) < 0.05);
      if (!existing) {
        if (!state.markers) state.markers = [];
        state.markers.push({ id: uid++, time: t, label: '🥁', color: '#ff9f43' });
        added++;
      }
    }

    renderTimeline();
    const msg = `✅ ${added} marcadores de batida criados! BPM estimado: ~${res.estimatedBpm}`;
    toast(msg);
    if (status) status.textContent = msg;
  } catch (err) {
    toast('Erro: ' + (err.message || err));
    if (status) status.textContent = '❌ ' + (err.message || err);
  } finally {
    [btnTool, btnBar].forEach(b => { if (b) b.disabled = false; });
  }
}

function initBeatDetect() {
  if ($('btnBeatDetect')) $('btnBeatDetect').onclick = () => runBeatDetect();
  if ($('btnBeatMarks')) $('btnBeatMarks').onclick = () => runBeatDetect();
}

// ─── 7.1c: Text-to-Speech (TTS) ─────────────────────────────────────────────
function initTts() {
  const btn = $('btnTtsSpeak'), status = $('ttsStatus');
  if (!btn || !window.api?.ttsSpeak) return;

  window.api.onTtsProgress((msg) => {
    if (status) { status.hidden = false; status.textContent = msg; }
    toast(msg);
  });

  btn.onclick = async () => {
    const text = $('ttsText')?.value?.trim();
    if (!text) return toast('Digite um texto para narrar primeiro');
    const speed = parseFloat($('ttsSpeed')?.value || 1.0);

    btn.disabled = true;
    if (status) { status.hidden = false; status.textContent = 'Iniciando TTS...'; }
    toast('🗣️ Gerando narração...');

    try {
      const res = await window.api.ttsSpeak({ text, speed });
      if (!res.ok) {
        toast('Erro TTS: ' + (res.error || 'Falha'));
        if (status) status.textContent = '❌ ' + (res.error || 'Falha');
        return;
      }

      const info = res.info || {};
      const a = {
        id: uid++,
        path: res.path,
        name: info.name || `🗣️ TTS: ${text.slice(0, 20)}`,
        start: state.time,
        in: 0,
        duration: info.duration || 3,
        max: info.duration || 3,
        volume: 1,
        fadeIn: 0.1,
        fadeOut: 0.1,
        wave: info.wave
      };
      state.audios.push(a);
      select({ kind: 'audio', id: a.id });
      renderTimeline(); renderPreview();

      const msg = res.fallback
        ? `⚠️ Narração sintética gerada (modo fallback) — ${Math.round(info.duration || 0)}s`
        : `✅ Narração TTS inserida — ${Math.round(info.duration || 0)}s`;
      toast(msg);
      if (status) status.textContent = msg;
    } catch (err) {
      toast('Erro: ' + (err.message || err));
      if (status) status.textContent = '❌ ' + (err.message || err);
    } finally {
      btn.disabled = false;
    }
  };
}

// ─── 7.2a: Tradução de Legendas ──────────────────────────────────────────────
function initTranslation() {
  const registerTranslateBtn = (btnId) => {
    const btn = $(btnId);
    if (!btn || !window.api?.translateSubtitles) return;

    btn.onclick = async () => {
      if (!state.texts.length) return toast('Não há legendas na timeline para traduzir');

      const srcLang = $('translateSrc')?.value || 'pt';
      const tgtLang = $('translateTgt')?.value || 'en';
      const translateStatus = $('translateStatus');

      btn.disabled = true;
      if (translateStatus) { translateStatus.hidden = false; translateStatus.textContent = 'Iniciando tradução...'; }
      toast(`🌐 Traduzindo ${state.texts.length} legendas (${srcLang} → ${tgtLang})...`);

      window.api.onTranslateProgress((msg) => {
        if (translateStatus) translateStatus.textContent = msg;
        toast(msg);
      });

      try {
        const chunks = state.texts.map(t => ({ id: t.id, text: t.text, start: t.start, end: t.start + t.duration }));
        const res = await window.api.translateSubtitles({ chunks, srcLang, tgtLang });

        if (!res.ok) {
          toast('⚠️ ' + (res.error || 'Falha na tradução'));
          if (translateStatus) translateStatus.textContent = '⚠️ ' + (res.error || 'Falha');
          return;
        }

        // Aplica traduções de volta nos textos da timeline
        let updated = 0;
        for (const translated of res.chunks) {
          const textItem = state.texts.find(t => t.id === translated.id);
          if (textItem && translated.text !== textItem.text) {
            textItem.text = translated.text;
            updated++;
          }
        }

        renderTimeline(); renderPreview();
        const msg = `✅ ${updated} legendas traduzidas (${srcLang} → ${tgtLang})`;
        toast(msg);
        if (translateStatus) translateStatus.textContent = msg;
      } catch (err) {
        toast('Erro: ' + (err.message || err));
        if (translateStatus) translateStatus.textContent = '❌ ' + (err.message || err);
      } finally {
        btn.disabled = false;
      }
    };
  };

  registerTranslateBtn('btnTranslate');
  registerTranslateBtn('btnTranslateSubs');
}

// ─── 7.2b: Super-Resolução ───────────────────────────────────────────────────
function initSuperResolution() {
  const btn = $('btnSuperRes'), srStatus = $('srStatus');
  const srProgress = $('srProgress'), srProgressFill = $('srProgressFill');
  if (!btn || !window.api?.superResolve) return;

  window.api.onSuperResProgress((data) => {
    const pct = data.percent ?? 0;
    const text = data.text || '';
    if (srProgress) srProgress.hidden = false;
    if (srProgressFill) srProgressFill.style.width = pct + '%';
    if (srStatus) { srStatus.hidden = false; srStatus.textContent = text; }
  });

  btn.onclick = async () => {
    // Determina clipe-alvo (selecionado ou primeiro da timeline)
    let targetClip = null;
    if (state.selected?.kind === 'clip') {
      targetClip = state.clips.find(c => c.id === state.selected.id);
    }
    if (!targetClip && state.clips.length) targetClip = state.clips[0];
    if (!targetClip) return toast('Selecione um clipe de vídeo na timeline primeiro');
    if (targetClip.isImage) return toast('Super-resolução não se aplica a imagens');

    const scale = parseInt($('srScale')?.value || 2);
    const denoise = $('srDenoise')?.checked !== false;
    const sharpen = $('srSharpen')?.checked !== false;

    btn.disabled = true;
    if (srProgress) srProgress.hidden = false;
    if (srProgressFill) srProgressFill.style.width = '0%';
    if (srStatus) { srStatus.hidden = false; srStatus.textContent = `Iniciando upscale ${scale}x...`; }
    toast(`🔬 Iniciando super-resolução ${scale}x...`);

    try {
      const res = await window.api.superResolve({ inputPath: targetClip.path, scale, denoise, sharpen });

      if (!res.ok) {
        toast('Erro: ' + (res.error || 'Falha'));
        if (srStatus) srStatus.textContent = '❌ ' + (res.error || 'Falha');
        return;
      }

      // Substitui o clipe original pelo clipe upscalado na timeline
      const info = res.info || {};
      targetClip.path = res.path;
      targetClip.name = info.name || `↑${scale}x ${targetClip.name}`;
      if (info.duration) targetClip.duration = Math.min(targetClip.duration, info.duration);
      if (info.thumb) targetClip.thumb = info.thumb;

      // Adiciona também na biblioteca de mídia
      const mediaItem = { ...info, name: info.name || `↑${scale}x ${path?.basename?.(res.path) || 'upscaled'}` };
      state.media.push(mediaItem);
      renderMedia();
      renderTimeline(); renderPreview();

      if (srProgressFill) srProgressFill.style.width = '100%';
      const msg = `✅ Super-resolução ${scale}x concluída! (${res.origW}×${res.origH} → ${res.targetW}×${res.targetH})`;
      toast(msg);
      if (srStatus) srStatus.textContent = msg;
    } catch (err) {
      toast('Erro: ' + (err.message || err));
      if (srStatus) srStatus.textContent = '❌ ' + (err.message || err);
    } finally {
      btn.disabled = false;
    }
  };
}

initPanelTabs();
initSfx();
initAiTab();
initStemSeparation();
initBeatDetect();
initTts();
initTranslation();
initSuperResolution();
