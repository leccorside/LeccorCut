const $ = (id) => document.getElementById(id);
const state = {
  media: [], clips: [], texts: [], audios: [], overlays: [], markers: [], selected: null, time: 0, playing: false,
  tracks: {
    video: { visible: true, mute: false, locked: false },
    overlay: { visible: true, locked: false },
    text: { visible: true, locked: false },
    audio: { mute: false, solo: false, locked: false }
  }
};

// ── Fase 13: Helpers de Keyframing Universal, Compound Clips e Track Lock ──
const EASING_FNS = {
  linear: (t) => t,
  ease_in: (t) => t * t,
  ease_out: (t) => t * (2 - t),
  smooth: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  bezier: (t) => t * t * (3 - 2 * t)
};

function interpolateKeyframes(keyframes, currentTime, defaultValue = 0) {
  if (!keyframes || !Array.isArray(keyframes) || keyframes.length === 0) return defaultValue;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (currentTime <= sorted[0].time) return sorted[0].value;
  if (currentTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i], k2 = sorted[i + 1];
    if (currentTime >= k1.time && currentTime <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 0) return k2.value;
      const progress = (currentTime - k1.time) / span;
      const easeFn = EASING_FNS[k1.easing] || EASING_FNS.linear;
      return k1.value + (k2.value - k1.value) * easeFn(progress);
    }
  }
  return defaultValue;
}

function setKeyframe(item, prop, time, value, easing = 'linear') {
  if (!item) return;
  if (!item.keyframes) item.keyframes = {};
  if (!item.keyframes[prop]) item.keyframes[prop] = [];
  const list = item.keyframes[prop];
  const roundedTime = Number(time.toFixed(3));
  const existingIndex = list.findIndex(k => Math.abs(k.time - roundedTime) < 0.04);
  if (existingIndex >= 0) {
    list[existingIndex].value = value;
    list[existingIndex].easing = easing;
  } else {
    list.push({ time: roundedTime, value, easing });
    list.sort((a, b) => a.time - b.time);
  }
}

function removeKeyframe(item, prop, time) {
  if (!item || !item.keyframes || !item.keyframes[prop]) return false;
  const list = item.keyframes[prop];
  const len = list.length;
  item.keyframes[prop] = list.filter(k => Math.abs(k.time - time) >= 0.05);
  return item.keyframes[prop].length < len;
}

function hasKeyframeAtTime(item, prop, time) {
  if (!item || !item.keyframes || !item.keyframes[prop]) return false;
  return item.keyframes[prop].some(k => Math.abs(k.time - time) < 0.05);
}

function isTrackLocked(kind) {
  if (!state.tracks || !state.tracks[kind]) return false;
  return !!state.tracks[kind].locked;
}

function createCompoundClip(clips, name = 'Clipe Composto') {
  if (!clips || clips.length === 0) return null;
  const sorted = [...clips].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const startTime = sorted[0].start ?? 0;
  let maxEndTime = startTime;
  sorted.forEach(c => {
    const cEnd = (c.start ?? 0) + (c.duration ?? 0);
    if (cEnd > maxEndTime) maxEndTime = cEnd;
  });
  return {
    id: uid++,
    isCompound: true,
    name,
    start: startTime,
    duration: maxEndTime - startTime,
    originalClips: JSON.parse(JSON.stringify(sorted)),
    color: '#7c5cff'
  };
}

function expandCompoundClip(compoundClip) {
  if (!compoundClip || !compoundClip.isCompound || !Array.isArray(compoundClip.originalClips)) return [];
  const offset = compoundClip.start - (compoundClip.originalClips[0]?.start ?? compoundClip.start);
  return compoundClip.originalClips.map(clip => {
    const restored = JSON.parse(JSON.stringify(clip));
    if (restored.start !== undefined) restored.start += offset;
    return restored;
  });
}

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
function cssFilter(f = {}, grading = {}) {
  let b = 1 + (f.brightness || 0) / 100;
  let c = 1 + (f.contrast || 0) / 100;
  let s = 1 + (f.saturation || 0) / 100;
  if (f.beauty) {
    b += (f.beautyGlow ?? 30) / 350;
    c += 0.03;
    s += 0.05;
  }
  let extraGrading = '';
  if (grading) {
    if (grading.temp) {
      const t = grading.temp;
      if (t > 0) extraGrading += ` sepia(${Math.min(0.6, t / 160).toFixed(2)})`;
      else extraGrading += ` hue-rotate(${Math.max(-45, t * 0.4).toFixed(1)}deg)`;
    }
    if (grading.tint) {
      extraGrading += ` hue-rotate(${(grading.tint * 0.4).toFixed(1)}deg)`;
    }
    if (grading.highlights) {
      b += grading.highlights * 0.002;
    }
    if (grading.shadows) {
      c += grading.shadows * 0.002;
    }
  }
  return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)}) blur(${f.blur || 0}px) grayscale(${f.grayscale ? 1 : 0}) ${CSS_PRESETS[f.preset] || ''}${extraGrading}`;
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
  if (o.keyframes) {
    if (o.keyframes.x) ox = interpolateKeyframes(o.keyframes.x, dt, ox);
    if (o.keyframes.y) oy = interpolateKeyframes(o.keyframes.y, dt, oy);
  }
  let op = o.opacity ?? 1;
  if (o.keyframes && o.keyframes.opacity) {
    op = interpolateKeyframes(o.keyframes.opacity, dt, op);
  }

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

  let rot = o.rotate || 0;
  if (o.keyframes && o.keyframes.rotate) {
    rot = interpolateKeyframes(o.keyframes.rotate, dt, rot);
  }
  let currentScale = o.scale || 30;
  if (o.keyframes && o.keyframes.scale) {
    currentScale = interpolateKeyframes(o.keyframes.scale, dt, currentScale);
  }
  const flip = o.hflip ? -1 : 1;

  el.style.width = currentScale + '%';
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

  // Fase 11: Modos de Mesclagem (mix-blend-mode) e Máscaras Geométricas (clip-path)
  el.style.mixBlendMode = o.blendMode || 'normal';
  if (o.mask && o.mask.type && o.mask.type !== 'none') {
    const s = o.mask.size ?? 80;
    if (o.mask.type === 'rectangle') {
      const half = s / 2;
      el.style.clipPath = `inset(${(50 - half).toFixed(1)}% ${(50 - half).toFixed(1)}% ${(50 - half).toFixed(1)}% ${(50 - half).toFixed(1)}% round ${o.mask.roundness || 0}px)`;
    } else if (o.mask.type === 'circle') {
      el.style.clipPath = `circle(${(s / 2).toFixed(1)}% at 50% 50%)`;
    } else if (o.mask.type === 'linear') {
      el.style.clipPath = `polygon(0 0, ${s}% 0, ${s}% 100%, 0 100%)`;
    } else if (o.mask.type === 'mirror') {
      const half = s / 2;
      el.style.clipPath = `polygon(${50 - half}% 0, ${50 + half}% 0, ${50 + half}% 100%, ${50 - half}% 100%)`;
    }
  } else {
    el.style.clipPath = 'none';
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
  if (a.keyframes && a.keyframes.volume) {
    vol = interpolateKeyframes(a.keyframes.volume, local, vol);
  }
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
  const f = cssFilter(view.filters, view.colorGrading);
  const fillMode = view.filters?.fillMode || 'fit';

  // Fase 11: Máscara Geométrica no player principal
  if (view.mask && view.mask.type && view.mask.type !== 'none') {
    const s = view.mask.size ?? 80;
    if (view.mask.type === 'rectangle') {
      const half = s / 2;
      player.style.clipPath = img.style.clipPath = `inset(${(50 - half).toFixed(1)}% ${(50 - half).toFixed(1)}% ${(50 - half).toFixed(1)}% ${(50 - half).toFixed(1)}% round ${view.mask.roundness || 0}px)`;
    } else if (view.mask.type === 'circle') {
      player.style.clipPath = img.style.clipPath = `circle(${(s / 2).toFixed(1)}% at 50% 50%)`;
    } else if (view.mask.type === 'linear') {
      player.style.clipPath = img.style.clipPath = `polygon(0 0, ${s}% 0, ${s}% 100%, 0 100%)`;
    } else if (view.mask.type === 'mirror') {
      const half = s / 2;
      player.style.clipPath = img.style.clipPath = `polygon(${50 - half}% 0, ${50 + half}% 0, ${50 + half}% 100%, ${50 - half}% 100%)`;
    }
  } else {
    player.style.clipPath = img.style.clipPath = 'none';
  }

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
    let clipVol = Math.min(1, view.volume ?? 1);
    if (view.keyframes && view.keyframes.volume) {
      clipVol = interpolateKeyframes(view.keyframes.volume, hit.local, clipVol);
    }
    player.muted = isMuted;
    player.volume = isMuted ? 0 : Math.max(0, Math.min(1, clipVol));
    const target = sample.targetTime;
    if (!state.playing || Math.abs(player.currentTime - target) > 0.3) player.currentTime = target;
    if (state.playing && player.paused) player.play().catch(() => {});
  }
  syncAudio();
  updateTime();
}

function updateTime() {
  const tStr = `${fmt(state.time)} / ${fmt(total())}`;
  $('timeLabel').textContent = tStr;
  if ($('cinemaTimeLabel')) $('cinemaTimeLabel').textContent = tStr;
  $('playhead').style.left = (12 + state.time * pxPerSec) + 'px';
}

function tick(ts) {
  if (!state.playing) return;
  state.time += (ts - lastTs) / 1000; lastTs = ts;
  if (state.time >= total()) { state.time = total(); setPlaying(false); }
  renderPreview(); raf = requestAnimationFrame(tick);
}
function setPlaying(p) {
  state.playing = p && total() > 0;
  const icon = state.playing ? '⏸' : '▶';
  $('btnPlay').textContent = icon;
  if ($('btnCinemaPlay')) $('btnCinemaPlay').textContent = icon;
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
  if (isTrackLocked(kind)) {
    return toast('🔒 Trilha bloqueada! Desbloqueie a trilha para mover ou redimensionar.');
  }
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

function renderClipKeyframes(clipEl, item) {
  if (!item || !item.keyframes) return;
  const props = ['x', 'y', 'scale', 'rotate', 'opacity', 'volume'];
  const renderedTimes = new Set();
  props.forEach(p => {
    const list = item.keyframes[p];
    if (Array.isArray(list)) {
      list.forEach(kf => {
        const tKey = kf.time.toFixed(2);
        if (renderedTimes.has(tKey)) return;
        renderedTimes.add(tKey);

        const dia = document.createElement('div');
        dia.className = 'keyframe-diamond';
        dia.style.left = (kf.time * pxPerSec) + 'px';
        const globalTime = (item.start || 0) + kf.time;
        if (Math.abs(state.time - globalTime) < 0.1) {
          dia.classList.add('active');
        }
        dia.title = `🔷 Keyframe: ${fmt(globalTime)} (${p}: ${kf.value})`;
        dia.onclick = (ev) => {
          ev.stopPropagation();
          state.time = globalTime;
          renderPreview();
          updateTime();
        };
        clipEl.appendChild(dia);
      });
    }
  });
}

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
    const e = document.createElement('div'); e.className = 'clip' + (state.selected?.id === c.id ? ' sel' : '') + (c.isCompound ? ' compound' : '');
    e.style.left = acc * pxPerSec + 'px'; e.style.width = c.duration * pxPerSec + 'px';
    const baseName = (c.isCompound ? '📦 ' : '') + (c.transition && c.transition !== 'none' ? '⇆ ' : '') + c.name;
    let audioBadges = '';
    if (c.voiceEffect && c.voiceEffect !== 'none') audioBadges += `<span class="clip-audio-badge">🎙️ ${c.voiceEffect}</span>`;
    if (c.pitchShift) audioBadges += `<span class="clip-audio-badge">🎚️ ${c.pitchShift > 0 ? '+' : ''}${c.pitchShift}st</span>`;
    if (c.compressor) audioBadges += `<span class="clip-audio-badge">🗜️ Comp</span>`;

    if (c.speedCurve && c.speedCurve !== 'none' && SPEED_CURVES[c.speedCurve]) {
      e.innerHTML = `<span class="clip-title">${baseName}</span><span class="clip-speed-badge">${SPEED_CURVES[c.speedCurve].badge}</span>${audioBadges}`;
    } else if (c.speed && c.speed !== 1) {
      e.innerHTML = `<span class="clip-title">${baseName}</span><span class="clip-speed-badge">${c.speed}x</span>${audioBadges}`;
    } else {
      e.innerHTML = `<span class="clip-title">${baseName}</span>${audioBadges}`;
    }
    if (c.thumb) { e.style.backgroundImage = `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)),url(${c.thumb})`; e.style.backgroundSize = 'auto 100%'; e.style.backgroundRepeat = 'repeat-x'; }
    renderClipKeyframes(e, c);
    decorate(e, 'clip', c);
    tv.appendChild(e);
  });
  state.texts.forEach(t => {
    const e = document.createElement('div'); e.className = 'clip text' + (state.selected?.id === t.id ? ' sel' : '');
    e.style.left = t.start * pxPerSec + 'px'; e.style.width = t.duration * pxPerSec + 'px'; e.textContent = 'T: ' + t.text;
    renderClipKeyframes(e, t);
    decorate(e, 'text', t);
    tt.appendChild(e);
  });
  state.overlays.forEach(o => {
    const e = document.createElement('div'); e.className = 'clip overlay' + (state.selected?.id === o.id ? ' sel' : '');
    e.style.left = o.start * pxPerSec + 'px'; e.style.width = o.duration * pxPerSec + 'px'; e.textContent = 'PiP: ' + o.name;
    if (o.thumb) { e.style.backgroundImage = `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)),url(${o.thumb})`; e.style.backgroundSize = 'auto 100%'; e.style.backgroundRepeat = 'repeat-x'; }
    renderClipKeyframes(e, o);
    decorate(e, 'overlay', o);
    to.appendChild(e);
  });
  state.audios.forEach(a => {
    const e = document.createElement('div'); e.className = 'clip audio' + (state.selected?.id === a.id ? ' sel' : '');
    e.style.left = a.start * pxPerSec + 'px'; e.style.width = a.duration * pxPerSec + 'px';
    let audioBadges = '';
    if (a.voiceEffect && a.voiceEffect !== 'none') audioBadges += `<span class="clip-audio-badge">🎙️ ${a.voiceEffect}</span>`;
    if (a.pitchShift) audioBadges += `<span class="clip-audio-badge">🎚️ ${a.pitchShift > 0 ? '+' : ''}${a.pitchShift}st</span>`;
    if (a.compressor) audioBadges += `<span class="clip-audio-badge">🗜️ Comp</span>`;
    e.innerHTML = `<span class="clip-title">♪ ${a.name}</span>${audioBadges}`;
    if (a.wave) { e.style.backgroundImage = `url(${a.wave}), linear-gradient(135deg,#00b894,#00e5c3)`; e.style.backgroundSize = `${a.max * pxPerSec}px 100%, 100% 100%`; e.style.backgroundPosition = `${-(a.in || 0) * pxPerSec}px 0, 0 0`; e.style.backgroundRepeat = 'no-repeat'; }
    renderClipKeyframes(e, a);
    decorate(e, 'audio', a);
    ta.appendChild(e);
  });
  updateTime();
}

function select(s) {
  state.selected = s;
  renderTimeline();
  renderProps();
  if (typeof syncFxPanel === 'function') syncFxPanel();
  if (typeof syncAudioProPanel === 'function') syncAudioProPanel();
}

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
    const kfBtn = (prop) => {
      const relTime = Math.max(0, state.time - (o.start || 0));
      const hasKf = hasKeyframeAtTime(o, prop, relTime);
      return `<button type="button" class="btn-keyframe-prop ${hasKf ? 'has-kf' : ''}" data-kf-prop="${prop}" title="Alternar Keyframe de ${prop}">🔷</button>`;
    };
    const r = (id, label, min, max, step, val, prop) =>
      `<div class="prop"><div class="prop-kf-row"><span>${label}</span>${prop ? kfBtn(prop) : ''}</div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
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
      + r('oScale', 'Tamanho (%)', 10, 100, 1, o.scale, 'scale')
      + r('oRot', 'Rotação (°)', -180, 180, 1, o.rotate || 0, 'rotate')
      + `<div class="prop"><label><input type="checkbox" id="oFlip" ${o.hflip ? 'checked' : ''}> Espelhar horizontalmente</label></div>`
      + r('oX', 'Posição horizontal', 0, 1, 0.01, o.x, 'x')
      + r('oY', 'Posição vertical', 0, 1, 0.01, o.y, 'y')
      + r('oOp', 'Opacidade', 0.1, 1, 0.05, o.opacity, 'opacity')
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
    p.querySelectorAll('.btn-keyframe-prop').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const prop = btn.dataset.kfProp;
        const relTime = Math.max(0, state.time - (o.start || 0));
        if (hasKeyframeAtTime(o, prop, relTime)) {
          removeKeyframe(o, prop, relTime);
          toast(`🔷 Keyframe de ${prop} removido`);
        } else {
          const curVal = o[prop] ?? (prop === 'opacity' ? 1 : (prop === 'scale' ? 30 : 0));
          setKeyframe(o, prop, relTime, curVal, 'linear');
          toast(`🔷 Keyframe de ${prop} inserido em ${relTime.toFixed(2)}s`);
        }
        renderTimeline();
        renderProps();
        renderPreview();
      };
    });
    return;
  }
  if (s.kind === 'audio') {
    const a = state.audios.find(x => x.id === s.id); if (!a) return;
    const kfBtnAudio = (prop) => {
      const relTime = Math.max(0, state.time - (a.start || 0));
      const hasKf = hasKeyframeAtTime(a, prop, relTime);
      return `<button type="button" class="btn-keyframe-prop ${hasKf ? 'has-kf' : ''}" data-kf-prop="${prop}" title="Alternar Keyframe de ${prop}">🔷</button>`;
    };
    p.innerHTML = `<div class="prop">Início (s)<input type="number" id="aStart" value="${a.start.toFixed(1)}" min="0" step="0.5"></div>
      <div class="prop">Duração (s)<input type="number" id="aDur" value="${a.duration.toFixed(1)}" min="0.5" step="0.5"></div>
      <div class="prop"><div class="prop-kf-row"><span>Volume</span>${kfBtnAudio('volume')}</div><input type="range" id="aVol" min="0" max="1" step="0.05" value="${a.volume ?? 1}"></div>
      <div class="prop">Fade in (s)<input type="number" id="aFadeIn" value="${a.fadeIn || 0}" min="0" max="10" step="0.2"></div>
      <div class="prop">Fade out (s)<input type="number" id="aFadeOut" value="${a.fadeOut || 0}" min="0" max="10" step="0.2"></div>
      <div class="prop"><label><input type="checkbox" id="aDenoise" ${a.denoise ? 'checked' : ''}> Redução de ruído (chiado)</label></div>
      <div class="prop"><label><input type="checkbox" id="aLoudnorm" ${a.loudnorm ? 'checked' : ''}> Normalizar volume (-14 LUFS)</label></div>
      <div class="prop-card">
        <div class="prop-card-title">🎚️ Efeitos de Voz & Tom (Fase 12)</div>
        <div class="prop">Modulador de Voz
          <select id="aVoiceEffect">
            <option value="none" ${(a.voiceEffect || 'none') === 'none' ? 'selected' : ''}>Original</option>
            <option value="deep_monster" ${a.voiceEffect === 'deep_monster' ? 'selected' : ''}>👹 Monstro / Grave</option>
            <option value="chipmunk" ${a.voiceEffect === 'chipmunk' ? 'selected' : ''}>🐿️ Esquilo / Agudo</option>
            <option value="robot" ${a.voiceEffect === 'robot' ? 'selected' : ''}>🤖 Robô</option>
            <option value="megaphone" ${a.voiceEffect === 'megaphone' ? 'selected' : ''}>📢 Megafone</option>
            <option value="space_echo" ${a.voiceEffect === 'space_echo' ? 'selected' : ''}>🌌 Eco Espacial</option>
          </select>
        </div>
        <div class="prop">Pitch Shifter: <span id="lblAPitch">${a.pitchShift ? (a.pitchShift > 0 ? '+' : '') + a.pitchShift + ' st' : '0 st'}</span>
          <input type="range" id="aPitchShift" min="-12" max="12" step="1" value="${a.pitchShift || 0}">
        </div>
        <div class="prop"><label><input type="checkbox" id="aCompressor" ${a.compressor ? 'checked' : ''}> Compressor de Estúdio</label></div>
        <button id="btnOpenAudioProFromAudio" class="wide btn-small" style="margin-top:6px;">📊 Abrir Equalizador de 10 Bandas (EQ10)</button>
        <button id="btnSeparate4StemsFromAudio" class="wide secondary" style="margin-top:4px;">🎛️ Separar em 4 Stems (Voz, Bateria, Baixo, Outros)</button>
      </div>`;
    p.querySelectorAll('.btn-keyframe-prop').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const prop = btn.dataset.kfProp;
        const relTime = Math.max(0, state.time - (a.start || 0));
        if (hasKeyframeAtTime(a, prop, relTime)) {
          removeKeyframe(a, prop, relTime);
          toast(`🔷 Keyframe de ${prop} removido`);
        } else {
          const curVal = a[prop] ?? 1;
          setKeyframe(a, prop, relTime, curVal, 'linear');
          toast(`🔷 Keyframe de ${prop} inserido em ${relTime.toFixed(2)}s`);
        }
        renderTimeline();
        renderProps();
        renderPreview();
      };
    });
    $('aStart').onchange = (e) => { a.start = Math.max(0, +e.target.value); renderTimeline(); };
    $('aDur').onchange = (e) => { a.duration = Math.min(a.max, +e.target.value); renderTimeline(); };
    $('aVol').oninput = (e) => { a.volume = +e.target.value; syncAudio(); };
    $('aFadeIn').onchange = (e) => { a.fadeIn = Math.max(0, +e.target.value); };
    $('aFadeOut').onchange = (e) => { a.fadeOut = Math.max(0, +e.target.value); };
    $('aDenoise').onchange = (e) => { a.denoise = e.target.checked; };
    $('aLoudnorm').onchange = (e) => { a.loudnorm = e.target.checked; };
    $('aVoiceEffect').onchange = (e) => { a.voiceEffect = e.target.value; renderTimeline(); if (typeof syncAudioProPanel === 'function') syncAudioProPanel(); };
    $('aPitchShift').oninput = (e) => {
      a.pitchShift = +e.target.value;
      if ($('lblAPitch')) $('lblAPitch').textContent = `${a.pitchShift > 0 ? '+' : ''}${a.pitchShift} st`;
      renderTimeline();
      if (typeof syncAudioProPanel === 'function') syncAudioProPanel();
    };
    $('aCompressor').onchange = (e) => { a.compressor = e.target.checked; renderTimeline(); if (typeof syncAudioProPanel === 'function') syncAudioProPanel(); };
    if ($('btnOpenAudioProFromAudio')) $('btnOpenAudioProFromAudio').onclick = () => {
      if ($('tabAudioPro')) $('tabAudioPro').click();
    };
    if ($('btnSeparate4StemsFromAudio')) $('btnSeparate4StemsFromAudio').onclick = () => executeFourStemsSeparation(a.path, a);
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
  if (c.isCompound) {
    p.innerHTML = `<div class="prop-card" style="border-color:#7c5cff;background:rgba(124,92,255,0.08);">
      <div class="prop-card-title" style="color:#a29bfe;">📦 Clipe Composto (${c.name || 'Agrupado'})</div>
      <p style="font-size:11px;color:#aaa;margin-bottom:8px;">Este bloco modular agrupa ${c.originalClips?.length || 0} clipes da timeline.</p>
      <div class="prop">Duração total: <span>${c.duration.toFixed(2)}s</span></div>
      <button id="btnUngroupCompound" class="wide primary" style="background:#7c5cff;margin-top:6px;">📦 Desagrupar Clipe Composto</button>
    </div>`
    + `<div class="prop">Início (s)<input type="number" id="pCompStart" value="${c.start.toFixed(1)}" min="0" step="0.5"></div>`
    + `<div class="prop">Duração (s)<input type="number" id="pCompDur" value="${c.duration.toFixed(1)}" min="0.5" step="0.5"></div>`;
    if ($('btnUngroupCompound')) $('btnUngroupCompound').onclick = toggleCompoundClipAction;
    if ($('pCompStart')) $('pCompStart').onchange = (e) => { c.start = Math.max(0, +e.target.value); renderTimeline(); renderPreview(); };
    if ($('pCompDur')) $('pCompDur').onchange = (e) => { c.duration = Math.max(0.1, +e.target.value); renderTimeline(); renderPreview(); };
    return;
  }
  const kfBtnClip = (prop) => {
    const localTime = Math.max(0, state.time - (c.start || 0));
    const hasKf = hasKeyframeAtTime(c, prop, localTime);
    return `<button type="button" class="btn-keyframe-prop ${hasKf ? 'has-kf' : ''}" data-kf-prop="${prop}" title="Alternar Keyframe de ${prop}">🔷</button>`;
  };
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
       + `<div class="prop"><div class="prop-kf-row"><span>Volume</span>${kfBtnClip('volume')}</div><input type="range" id="pVol" min="0" max="1" step="0.05" value="${c.volume ?? 1}"></div>
       <div class="prop"><label><input type="checkbox" id="pDenoise" ${c.filters.denoise ? 'checked' : ''}> Redução de ruído (chiado)</label></div>
       <div class="prop"><label><input type="checkbox" id="pLoudnorm" ${c.filters.loudnorm ? 'checked' : ''}> Normalizar volume (-14 LUFS)</label></div>`
        + (c.hasAudio && !c.isImage ? `
          <div class="prop-card">
            <div class="prop-card-title">🎚️ Efeitos de Voz & Tom (Fase 12)</div>
            <div class="prop">Modulador de Voz
              <select id="cVoiceEffect">
                <option value="none" ${(c.voiceEffect || 'none') === 'none' ? 'selected' : ''}>Original</option>
                <option value="deep_monster" ${c.voiceEffect === 'deep_monster' ? 'selected' : ''}>👹 Monstro / Grave</option>
                <option value="chipmunk" ${c.voiceEffect === 'chipmunk' ? 'selected' : ''}>🐿️ Esquilo / Agudo</option>
                <option value="robot" ${c.voiceEffect === 'robot' ? 'selected' : ''}>🤖 Robô</option>
                <option value="megaphone" ${c.voiceEffect === 'megaphone' ? 'selected' : ''}>📢 Megafone</option>
                <option value="space_echo" ${c.voiceEffect === 'space_echo' ? 'selected' : ''}>🌌 Eco Espacial</option>
              </select>
            </div>
            <div class="prop">Pitch Shifter: <span id="lblCPitch">${c.pitchShift ? (c.pitchShift > 0 ? '+' : '') + c.pitchShift + ' st' : '0 st'}</span>
              <input type="range" id="cPitchShift" min="-12" max="12" step="1" value="${c.pitchShift || 0}">
            </div>
            <div class="prop"><label><input type="checkbox" id="cCompressor" ${c.compressor ? 'checked' : ''}> Compressor de Estúdio</label></div>
            <button id="btnOpenAudioProFromClip" class="wide btn-small" style="margin-top:6px;">📊 Abrir Equalizador de 10 Bandas (EQ10)</button>
            <button id="btnSeparate4StemsFromClip" class="wide secondary" style="margin-top:4px;">🎛️ Separar em 4 Stems (Voz, Bateria, Baixo, Outros)</button>
          </div>
        ` : '')
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
  if ($('cVoiceEffect')) $('cVoiceEffect').onchange = (e) => { c.voiceEffect = e.target.value; renderTimeline(); if (typeof syncAudioProPanel === 'function') syncAudioProPanel(); };
  if ($('cPitchShift')) $('cPitchShift').oninput = (e) => {
    c.pitchShift = +e.target.value;
    if ($('lblCPitch')) $('lblCPitch').textContent = `${c.pitchShift > 0 ? '+' : ''}${c.pitchShift} st`;
    renderTimeline();
    if (typeof syncAudioProPanel === 'function') syncAudioProPanel();
  };
  if ($('cCompressor')) $('cCompressor').onchange = (e) => { c.compressor = e.target.checked; renderTimeline(); if (typeof syncAudioProPanel === 'function') syncAudioProPanel(); };
  if ($('btnOpenAudioProFromClip')) $('btnOpenAudioProFromClip').onclick = () => {
    if ($('tabAudioPro')) $('tabAudioPro').click();
  };
  if ($('btnSeparate4StemsFromClip')) $('btnSeparate4StemsFromClip').onclick = () => executeFourStemsSeparation(c.path, c);
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
  p.querySelectorAll('.btn-keyframe-prop').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prop = btn.dataset.kfProp;
      const localTime = Math.max(0, state.time - (c.start || 0));
      if (hasKeyframeAtTime(c, prop, localTime)) {
        removeKeyframe(c, prop, localTime);
        toast(`🔷 Keyframe de ${prop} removido`);
      } else {
        const curVal = c[prop] ?? 1;
        setKeyframe(c, prop, localTime, curVal, 'linear');
        toast(`🔷 Keyframe de ${prop} inserido em ${localTime.toFixed(2)}s`);
      }
      renderTimeline();
      renderProps();
      renderPreview();
    };
  });
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
  if (isTrackLocked('video')) {
    return toast('🔒 Trilha de vídeo bloqueada! Desbloqueie a trilha para dividir.');
  }
  const c = hit.c, idx = state.clips.indexOf(c);
  const sample = getClipSample(c, hit.local);
  const b = { ...c, id: uid++, filters: { ...(c.filters || {}) }, in: sample.targetTime, duration: c.duration - hit.local };
  c.duration = hit.local; c.transition = 'none'; state.clips.splice(idx + 1, 0, b); renderTimeline();
}
function del() {
  const s = state.selected; if (!s) return;
  if (isTrackLocked(s.kind)) {
    return toast('🔒 Trilha bloqueada! Desbloqueie a trilha para excluir o item.');
  }
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
  const setLock = (btnId, trackElemId, isLocked) => {
    const btn = $(btnId);
    const trackEl = $(trackElemId);
    if (btn) {
      btn.textContent = isLocked ? '🔒' : '🔓';
      btn.classList.toggle('locked', !!isLocked);
    }
    if (trackEl) {
      trackEl.classList.toggle('locked', !!isLocked);
    }
  };

  setBtn('thEyeVideo', false, tr.video.visible === false);
  setBtn('thMuteVideo', tr.video.mute, tr.video.mute);
  setLock('thLockVideo', 'trackVideo', tr.video.locked);
  if ($('thGroupVideo')) $('thGroupVideo').style.opacity = tr.video.visible === false ? '0.5' : '1';

  setBtn('thEyeOverlay', false, tr.overlay.visible === false);
  setLock('thLockOverlay', 'trackOverlay', tr.overlay.locked);
  if ($('thGroupOverlay')) $('thGroupOverlay').style.opacity = tr.overlay.visible === false ? '0.5' : '1';

  setBtn('thEyeText', false, tr.text.visible === false);
  setLock('thLockText', 'trackText', tr.text.locked);
  if ($('thGroupText')) $('thGroupText').style.opacity = tr.text.visible === false ? '0.5' : '1';

  setBtn('thMuteAudio', tr.audio.mute, tr.audio.mute);
  setBtn('thSoloAudio', tr.audio.solo, false);
  setLock('thLockAudio', 'trackAudio', tr.audio.locked);
  if ($('thGroupAudio')) $('thGroupAudio').style.opacity = tr.audio.mute ? '0.5' : '1';
}

function initTrackHeaders() {
  const bindLock = (btnId, key) => {
    const el = $(btnId);
    if (el) {
      el.onclick = () => {
        state.tracks[key].locked = !state.tracks[key].locked;
        renderTrackHeaders();
        toast(state.tracks[key].locked ? `🔒 Trilha de ${key} bloqueada` : `🔓 Trilha de ${key} desbloqueada`);
      };
    }
  };
  bindLock('thLockVideo', 'video');
  bindLock('thLockOverlay', 'overlay');
  bindLock('thLockText', 'text');
  bindLock('thLockAudio', 'audio');

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
function toggleKeyframeAtPlayhead() {
  const s = state.selected;
  if (!s) {
    return toast('Selecione um clipe, sobreposição ou áudio na timeline para alternar keyframes.');
  }
  let target = null;
  let relTime = 0;
  let prop = 'volume';
  let defaultVal = 1;

  if (s.kind === 'overlay') {
    target = state.overlays.find(x => x.id === s.id);
    if (!target) return;
    relTime = Math.max(0, state.time - (target.start || 0));
    prop = 'scale';
    defaultVal = target.scale || 30;
  } else if (s.kind === 'audio') {
    target = state.audios.find(x => x.id === s.id);
    if (!target) return;
    relTime = Math.max(0, state.time - (target.start || 0));
    prop = 'volume';
    defaultVal = target.volume ?? 1;
  } else if (s.kind === 'clip') {
    target = state.clips.find(x => x.id === s.id);
    if (!target) return;
    relTime = Math.max(0, state.time - (target.start || 0));
    prop = 'volume';
    defaultVal = target.volume ?? 1;
  } else if (s.kind === 'text') {
    target = state.texts.find(x => x.id === s.id);
    if (!target) return;
    relTime = Math.max(0, state.time - (target.start || 0));
    prop = 'opacity';
    defaultVal = 1;
  }

  if (target) {
    if (hasKeyframeAtTime(target, prop, relTime)) {
      removeKeyframe(target, prop, relTime);
      toast(`🔷 Keyframe de ${prop} removido na agulha`);
    } else {
      setKeyframe(target, prop, relTime, defaultVal, 'linear');
      toast(`🔷 Keyframe de ${prop} inserido na agulha (${relTime.toFixed(2)}s)`);
    }
    renderTimeline();
    renderProps();
    renderPreview();
  }
}

function toggleCompoundClipAction() {
  const s = state.selected;
  if (s && s.kind === 'clip') {
    const c = state.clips.find(x => x.id === s.id);
    if (c && c.isCompound) {
      const restored = expandCompoundClip(c);
      const idx = state.clips.indexOf(c);
      if (idx >= 0) {
        state.clips.splice(idx, 1, ...restored);
        state.selected = restored[0] ? { kind: 'clip', id: restored[0].id } : null;
        renderTimeline();
        renderProps();
        renderPreview();
        toast('📦 Clipe Composto desagrupado com sucesso!');
        return;
      }
    }
  }

  if (state.clips.length >= 2) {
    const comp = createCompoundClip(state.clips, `Clipe Composto ${state.clips.filter(x => x.isCompound).length + 1}`);
    state.clips = [comp];
    state.selected = { kind: 'clip', id: comp.id };
    renderTimeline();
    renderProps();
    renderPreview();
    toast('📦 Clipe Composto criado com sucesso!');
  } else {
    toast('Adicione pelo menos 2 clipes na trilha de vídeo para criar um Clipe Composto.');
  }
}

if ($('btnKeyframe')) $('btnKeyframe').onclick = toggleKeyframeAtPlayhead;
if ($('btnCompound')) $('btnCompound').onclick = toggleCompoundClipAction;
$('btnMarker').onclick = addOrToggleMarker;
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  // Atalho de Clipe Composto (Ctrl+G)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
    e.preventDefault();
    toggleCompoundClipAction();
    return;
  }

  // Sair do Modo Cinema com Escape
  if (e.key === 'Escape' && $('stage')?.classList.contains('cinema-mode')) {
    e.preventDefault();
    if (typeof toggleCinemaMode === 'function') toggleCinemaMode();
    return;
  }

  // Atalho do Modo Cinema (F11 ou Ctrl+F)
  const isCinemaShortcut = e.key === 'F11' || ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F'));
  if (isCinemaShortcut) {
    e.preventDefault();
    if (typeof toggleCinemaMode === 'function') toggleCinemaMode();
    return;
  }

  const fps = +$('expFps').value || 30;
  const frameDur = 1 / fps;
  const k = e.key;
  const kLower = k.toLowerCase();

  const matchAction = (actName, fallbackKey) => {
    if (typeof activeShortcuts !== 'undefined' && activeShortcuts[actName]?.key) {
      const target = activeShortcuts[actName].key;
      return target.toLowerCase() === kLower || target === k;
    }
    return fallbackKey ? (fallbackKey.toLowerCase() === kLower || fallbackKey === k) : false;
  };

  if (matchAction('split', 's')) split();
  else if (matchAction('voiceover', 'r') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (typeof openVoiceoverModal === 'function') openVoiceoverModal();
  }
  else if (matchAction('webcam', 'w') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (typeof openWebcamModal === 'function') openWebcamModal();
  }
  else if (matchAction('delete', 'Delete') || k === 'Backspace') del();
  else if (matchAction('freeze', 'f') && !e.ctrlKey) freezeFrame();
  else if (matchAction('flash', 'b') && !e.ctrlKey) addFlashEffect();
  else if (matchAction('marker', 'm')) addOrToggleMarker();
  else if (matchAction('snap', 'n')) toggleSnap();
  else if (matchAction('play_pause', ' ')) { e.preventDefault(); setPlaying(!state.playing); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); state.time = Math.max(0, state.time - (e.shiftKey ? 1 : frameDur)); renderPreview(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); state.time = Math.min(total(), state.time + (e.shiftKey ? 1 : frameDur)); renderPreview(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); jumpCut(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); jumpCut(1); }
  else if (e.key === 'Home') { e.preventDefault(); state.time = 0; renderPreview(); }
  else if (e.key === 'End') { e.preventDefault(); state.time = total(); renderPreview(); }
  else if (e.key === 'j' || e.key === 'J') { state.time = Math.max(0, state.time - 2); renderPreview(); }
  else if (e.key === 'k' || e.key === 'K') {
    if (state.playing) {
      setPlaying(false);
    } else if (state.selected) {
      toggleKeyframeAtPlayhead();
    }
  }
  else if (e.key === 'l' || e.key === 'L') { state.time = Math.min(total(), state.time + 2); renderPreview(); }
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

// ── Fase 14: Handlers de Interoperabilidade Pro (EDL, FCPXML e Project Bundle) ─
function getFullProjectState() {
  return {
    media: state.media,
    clips: state.clips,
    texts: state.texts,
    audios: state.audios,
    overlays: state.overlays,
    tracks: state.tracks,
    markers: state.markers,
    settings: {
      aspect: $('expAspect')?.value || '16:9',
      res: $('expRes')?.value || '1080',
      fps: $('expFps')?.value || '30',
      crf: $('expQ')?.value || '18'
    }
  };
}

if ($('btnExportEdl')) {
  $('btnExportEdl').onclick = async () => {
    if (!state.clips.length && !state.audios.length) return toast('Adicione clipes à timeline antes de exportar EDL');
    const r = await window.api.exportEdl(getFullProjectState());
    if (r && r.ok) {
      toast(`📄 EDL CMX 3600 exportado com sucesso!`);
    } else if (r && r.error) {
      toast(`Erro ao exportar EDL: ${r.error}`);
    }
  };
}

if ($('btnExportFcpxml')) {
  $('btnExportFcpxml').onclick = async () => {
    if (!state.clips.length && !state.audios.length) return toast('Adicione clipes à timeline antes de exportar FCPXML');
    const r = await window.api.exportFcpxml(getFullProjectState());
    if (r && r.ok) {
      toast(`🎞️ FCPXML exportado com sucesso (compatível com DaVinci e Premiere)!`);
    } else if (r && r.error) {
      toast(`Erro ao exportar FCPXML: ${r.error}`);
    }
  };
}

if ($('btnBundleProject')) {
  $('btnBundleProject').onclick = async () => {
    if (!state.clips.length && !state.audios.length && !state.media.length) {
      return toast('Adicione mídias à timeline antes de empacotar o projeto.');
    }
    toast('📦 Coletando mídias e gerando pacote portátil...');
    const r = await window.api.bundleProject(getFullProjectState());
    if (r && r.ok) {
      const mb = (r.totalBytes / (1024 * 1024)).toFixed(1);
      toast(`📦 Pacote criado com sucesso! ${r.totalFiles} mídias coletadas (${mb} MB).`);
    } else if (r && r.error) {
      toast(`Erro ao empacotar projeto: ${r.error}`);
    }
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
  const accel = $('expAccel') ? $('expAccel').value : 'auto';

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
      colorProfile,
      accel
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
  const tabs = [
    { btn: $('tabMedia'), view: $('mediaView') },
    { btn: $('tabSfx'), view: $('sfxView') },
    { btn: $('tabAssets'), view: $('assetsView') },
    { btn: $('tabAi'), view: $('aiView') },
    { btn: $('tabFx'), view: $('fxView') },
    { btn: $('tabAudioPro'), view: $('audioProView') }
  ].filter(t => t.btn && t.view);

  tabs.forEach(activeTab => {
    activeTab.btn.onclick = () => {
      tabs.forEach(t => {
        const isSel = t === activeTab;
        t.btn.classList.toggle('active', isSel);
        t.view.hidden = !isSel;
      });
      if (activeTab.btn.id === 'tabAssets' && typeof window.renderAssetsList === 'function') {
        window.renderAssetsList();
      }
    };
  });
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

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 9 — UX, Produtividade, Assets e Backups: Lógica de UI e Integração
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 9.1a: Modo Cinema / Tela Cheia ──────────────────────────────────────────
function toggleCinemaMode() {
  const stage = $('stage');
  const ctrl = $('cinemaControls');
  if (!stage) return;

  const isCinema = stage.classList.toggle('cinema-mode');
  if (ctrl) ctrl.hidden = !isCinema;

  if (isCinema) {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (_) {}
    toast('Modo Cinema ativado (Pressione Esc ou F11 para sair)');
  } else {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (_) {}
  }
  renderPreview();
}

function initCinemaMode() {
  if ($('btnCinema')) $('btnCinema').onclick = toggleCinemaMode;
  if ($('btnExitCinema')) $('btnExitCinema').onclick = toggleCinemaMode;
  if ($('btnCinemaPlay')) {
    $('btnCinemaPlay').onclick = () => setPlaying(!state.playing);
  }
}

// ─── 9.1b: Biblioteca Integrada de Assets e Stickers ─────────────────────────
let cachedAssets = [];

async function initAssetsTab() {
  const grid = $('assetsGrid');
  const catFilter = $('assetCategoryFilter');
  const searchInput = $('assetSearchInput');
  if (!grid || !window.api?.getAssetsList) return;

  try {
    cachedAssets = await window.api.getAssetsList();
  } catch (_) {
    cachedAssets = [];
  }

  function renderGrid() {
    const cat = catFilter ? catFilter.value : 'all';
    const q = (searchInput?.value || '').toLowerCase().trim();

    const filtered = cachedAssets.filter(item => {
      const matchCat = cat === 'all' || item.category === cat;
      const matchQ = !q || item.name.toLowerCase().includes(q) || (item.tags || []).some(t => t.includes(q));
      return matchCat && matchQ;
    });

    grid.innerHTML = '';
    if (!filtered.length) {
      grid.innerHTML = '<p class="hint" style="grid-column: 1/-1; padding: 16px; text-align: center;">Nenhum sticker localizado.</p>';
      return;
    }

    filtered.forEach(asset => {
      const card = document.createElement('div');
      card.className = 'asset-card';
      card.innerHTML = `
        <div class="asset-card-preview">${asset.svg}</div>
        <div class="asset-card-title" title="${asset.name}">${asset.name}</div>
        <button class="asset-card-btn">+ Inserir</button>
      `;
      card.onclick = async () => {
        try {
          const fileInfo = await window.api.ensureAssetFile(asset.id);
          if (!fileInfo || !fileInfo.path) return toast('Erro ao carregar asset');

          const newOv = {
            id: uid++,
            path: fileInfo.path,
            name: asset.name,
            isImage: true,
            start: state.time,
            in: 0,
            duration: 3,
            max: 3,
            x: 0.5,
            y: 0.5,
            scale: 25,
            opacity: 1,
            anim: 'pop'
          };
          state.overlays.push(newOv);
          renderTimeline();
          renderPreview();
          toast(`Sticker "${asset.name}" adicionado à timeline`);
        } catch (e) {
          toast('Falha ao inserir sticker: ' + (e.message || e));
        }
      };
      grid.appendChild(card);
    });
  }

  if (catFilter) catFilter.onchange = renderGrid;
  if (searchInput) searchInput.oninput = renderGrid;
  window.renderAssetsList = renderGrid;
  renderGrid();
}

// ─── 9.1c: Histórico Visual de Versões e Backups Automáticos (.lccut) ─────────
function initBackups() {
  const modal = $('historyModal');
  const btnHistory = $('btnHistory');
  const btnClose = $('btnCloseHistory');
  const listEl = $('historyList');
  const btnCreate = $('btnCreateSnapshot');
  const labelInput = $('manualSnapshotLabel');

  if (!btnHistory || !window.api?.saveBackup) return;

  async function loadHistory() {
    if (!listEl) return;
    listEl.innerHTML = '<p class="hint" style="text-align: center; padding: 12px;">Carregando versões...</p>';
    const items = await window.api.listBackups();
    listEl.innerHTML = '';
    if (!items || !items.length) {
      listEl.innerHTML = '<p class="hint" style="text-align: center; padding: 20px;">Nenhum snapshot de backup salvo ainda.</p>';
      return;
    }
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const dt = new Date(item.date).toLocaleString('pt-BR');
      el.innerHTML = `
        <div class="history-info">
          <span class="history-title">${item.label || 'Snapshot'}</span>
          <span class="history-meta">${dt} · ${item.clipsCount} clipe(s) · ${item.overlaysCount} sticker(s)</span>
        </div>
        <div class="history-actions">
          <button class="history-restore-btn">Restaurar</button>
          <button class="history-del-btn" title="Excluir backup">🗑</button>
        </div>
      `;
      el.querySelector('.history-restore-btn').onclick = async () => {
        if (!confirm(`Deseja restaurar a versão "${item.label}" de ${dt}? O estado atual será substituído.`)) return;
        const res = await window.api.restoreBackup(item.id);
        if (res.ok && res.project) {
          hApply(JSON.stringify(res.project));
          modal.hidden = true;
          toast(`Versão "${item.label}" restaurada com sucesso!`);
        } else {
          toast('Falha ao restaurar: ' + (res.error || 'Erro'));
        }
      };
      el.querySelector('.history-del-btn').onclick = async () => {
        await window.api.deleteBackup(item.id);
        loadHistory();
      };
      listEl.appendChild(el);
    });
  }

  btnHistory.onclick = () => {
    modal.hidden = false;
    loadHistory();
  };
  if (btnClose) btnClose.onclick = () => { modal.hidden = true; };
  modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };

  if (btnCreate) {
    btnCreate.onclick = async () => {
      const lbl = labelInput?.value?.trim() || 'Manual';
      const snap = {
        clips: state.clips, texts: state.texts, audios: state.audios,
        overlays: state.overlays, tracks: state.tracks, markers: state.markers,
        settings: { height: +$('expRes')?.value, fps: +$('expFps')?.value, aspect: $('expAspect')?.value }
      };
      const res = await window.api.saveBackup({ project: snap, label: lbl });
      if (res.ok) {
        toast(`Snapshot "${lbl}" criado com sucesso!`);
        if (labelInput) labelInput.value = '';
        loadHistory();
      }
    };
  }

  // Auto-backup periódico a cada 2 minutos se houver clipes
  let lastAutoBackupHash = '';
  setInterval(async () => {
    if (!state.clips.length) return;
    const curHash = JSON.stringify({ clips: state.clips, texts: state.texts, audios: state.audios, overlays: state.overlays });
    if (curHash === lastAutoBackupHash) return;
    lastAutoBackupHash = curHash;
    const snap = {
      clips: state.clips, texts: state.texts, audios: state.audios,
      overlays: state.overlays, tracks: state.tracks, markers: state.markers
    };
    await window.api.saveBackup({ project: snap, label: 'Auto-Backup' });
  }, 120000);
}

// ─── 9.1d: Painel de Customização de Atalhos de Teclado ──────────────────────
const DEFAULT_SHORTCUTS = {
  play_pause: { key: ' ', label: 'Espaço', name: 'Reproduzir / Pausar' },
  split: { key: 's', label: 'S', name: 'Dividir Clipe (Split)' },
  delete: { key: 'Delete', label: 'Delete', name: 'Excluir Selecionado' },
  freeze: { key: 'f', label: 'F', name: 'Congelar Quadro (Freeze)' },
  flash: { key: 'b', label: 'B', name: 'Flash de Batida' },
  marker: { key: 'm', label: 'M', name: 'Marcador de Batida' },
  snap: { key: 'n', label: 'N', name: 'Alternar Snap Magnético' },
  cinema: { key: 'F11', label: 'F11', name: 'Modo Cinema / Tela Cheia' },
  voiceover: { key: 'r', label: 'R', name: 'Gravar Locução / Voiceover' },
  webcam: { key: 'w', label: 'W', name: 'Gravar Câmera / Webcam PiP' }
};

let activeShortcuts = { ...DEFAULT_SHORTCUTS };

function loadCustomShortcuts() {
  try {
    const saved = localStorage.getItem('leccorcut_custom_shortcuts');
    if (saved) activeShortcuts = Object.assign({}, DEFAULT_SHORTCUTS, JSON.parse(saved));
  } catch (_) {}
}

function initShortcuts() {
  loadCustomShortcuts();
  const modal = $('shortcutsModal');
  const btn = $('btnShortcuts');
  const btnClose = $('btnCloseShortcuts');
  const listEl = $('shortcutsList');
  const btnReset = $('btnResetShortcuts');
  const btnSave = $('btnSaveShortcuts');
  let recordingAction = null;

  function renderShortcutsList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    Object.keys(activeShortcuts).forEach(act => {
      const cfg = activeShortcuts[act];
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      row.innerHTML = `
        <span class="shortcut-action-name">${cfg.name}</span>
        <button class="shortcut-key-badge ${recordingAction === act ? 'recording' : ''}" data-act="${act}">
          ${recordingAction === act ? 'Pressione tecla...' : cfg.label}
        </button>
      `;
      row.querySelector('.shortcut-key-badge').onclick = () => {
        recordingAction = act;
        renderShortcutsList();
      };
      listEl.appendChild(row);
    });
  }

  if (btn) {
    btn.onclick = () => {
      recordingAction = null;
      modal.hidden = false;
      renderShortcutsList();
    };
  }
  if (btnClose) btnClose.onclick = () => { modal.hidden = true; };
  modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };

  if (btnReset) {
    btnReset.onclick = () => {
      activeShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
      localStorage.removeItem('leccorcut_custom_shortcuts');
      recordingAction = null;
      renderShortcutsList();
      toast('Atalhos restaurados para o padrão original');
    };
  }

  if (btnSave) {
    btnSave.onclick = () => {
      localStorage.setItem('leccorcut_custom_shortcuts', JSON.stringify(activeShortcuts));
      modal.hidden = true;
      toast('Atalhos personalizados salvos com sucesso!');
    };
  }

  window.addEventListener('keydown', (e) => {
    if (!recordingAction) return;
    e.preventDefault();
    e.stopPropagation();
    let key = e.key;
    let label = key === ' ' ? 'Espaço' : key.toUpperCase();
    if (e.ctrlKey && key !== 'Control') {
      key = 'Ctrl+' + key;
      label = 'Ctrl+' + label;
    }
    activeShortcuts[recordingAction].key = key;
    activeShortcuts[recordingAction].label = label;
    recordingAction = null;
    renderShortcutsList();
  }, true);
}

initCinemaMode();
initAssetsTab();
initBackups();
initShortcuts();

// ─── Fase 10: Detecção de GPU e Aceleração por Hardware ──────────────────────
async function initGpuDetection() {
  const badge = $('gpuStatusBadge');
  const accelSel = $('expAccel');
  const gpuDetectText = $('gpuDetectText');
  const btnRefreshGpu = $('btnRefreshGpu');

  if (!window.api || !window.api.detectGpu) return;

  async function updateGpuStatus(forceRefresh = false) {
    try {
      const gpuInfo = await window.api.detectGpu(forceRefresh);
      const userPref = accelSel ? accelSel.value : 'auto';
      const format = $('expFormat') ? $('expFormat').value : 'mp4';
      const colorProfile = $('expColorProfile') ? $('expColorProfile').value : 'bt709';

      const resolved = await window.api.resolveEncoderArgs({ userPref, format, colorProfile });

      if (badge) {
        badge.hidden = false;
        if (resolved.isGpu) {
          badge.className = 'gpu-badge gpu-active';
          badge.textContent = `⚡ ${resolved.label}`;
          badge.title = `Encoder ativo: ${resolved.label} (${resolved.codecArgs.join(' ')})`;
        } else {
          badge.className = 'gpu-badge cpu';
          badge.textContent = `🖥️ CPU`;
          badge.title = 'Renderização por software (libx264)';
        }
      }

      if (gpuDetectText) {
        if (gpuInfo.available && gpuInfo.available.length > 0) {
          const names = gpuInfo.available.map(k => gpuInfo.encoders[k]?.label || k).join(', ');
          gpuDetectText.textContent = `${names} (${gpuInfo.hwaccelFlag || 'd3d11va'})`;
        } else {
          gpuDetectText.textContent = 'Nenhuma GPU compatível detectada — Usando CPU (libx264)';
        }
      }
    } catch (e) {
      if (gpuDetectText) gpuDetectText.textContent = 'Erro ao sondar GPU: ' + e.message;
    }
  }

  if (accelSel) accelSel.onchange = () => updateGpuStatus(false);
  if ($('expFormat')) {
    const origFmtChange = $('expFormat').onchange;
    $('expFormat').onchange = (e) => {
      if (origFmtChange) origFmtChange(e);
      updateGpuStatus(false);
    };
  }
  if (btnRefreshGpu) btnRefreshGpu.onclick = () => {
    toast('Rescaneando encoders de hardware...');
    updateGpuStatus(true);
  };

  await updateGpuStatus(false);
}

// ─── Fase 10: Gerenciador de Mídia Proxy e Pré-Render ───────────────────────
function initProxyManagerUI() {
  const modal = $('proxyModal');
  const btnProxy = $('btnProxy');
  const btnClose = $('btnCloseProxy');
  const btnRefresh = $('btnRefreshProxyStats');
  const btnClear = $('btnClearProxyCache');
  const btnGenerate = $('btnGenerateProxies');
  const listEl = $('proxyList');
  const countEl = $('proxyCacheCount');
  const mbEl = $('proxyCacheMB');
  const dirEl = $('proxyCacheDir');
  const progressWrap = $('proxyProgressWrap');
  const progressLabel = $('proxyProgressLabel');
  const progressBar = $('proxyProgressBar');

  if (!window.api || !window.api.generateProxy) return;

  async function refreshStats() {
    try {
      const stats = await window.api.proxyCacheStats();
      if (countEl) countEl.textContent = stats.count;
      if (mbEl) mbEl.textContent = `${stats.totalMB} MB`;
      if (dirEl) dirEl.textContent = stats.dir ? stats.dir.split(/[\\/]/).slice(-2).join('/') : '—';

      const proxies = await window.api.listProxies();
      if (listEl) {
        listEl.innerHTML = '';
        if (!proxies || !proxies.length) {
          listEl.innerHTML = '<p class="hint" style="text-align:center;padding:12px;">Nenhum arquivo proxy em cache.</p>';
        } else {
          proxies.forEach(p => {
            const row = document.createElement('div');
            row.className = 'proxy-list-item';
            row.innerHTML = `
              <span class="proxy-list-item-name" title="${p.proxyPath}">${p.srcHash}.mp4</span>
              <span class="proxy-list-item-meta">${p.sizeMB} MB</span>
              <div class="proxy-list-item-actions">
                <button class="btn-small btn-danger del-proxy-btn" title="Excluir proxy">🗑</button>
              </div>
            `;
            row.querySelector('.del-proxy-btn').onclick = async () => {
              await window.api.deleteProxy(p.proxyPath);
              refreshStats();
            };
            listEl.appendChild(row);
          });
        }
      }
    } catch (_) {}
  }

  if (btnProxy) {
    btnProxy.onclick = () => {
      if (modal) modal.hidden = false;
      refreshStats();
    };
  }
  if (btnClose) btnClose.onclick = () => { if (modal) modal.hidden = true; };
  if (modal) modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };
  if (btnRefresh) btnRefresh.onclick = refreshStats;

  if (btnClear) {
    btnClear.onclick = async () => {
      if (!confirm('Deseja limpar todo o cache de mídia proxy? Os vídeos originais não serão afetados.')) return;
      const res = await window.api.clearProxyCache();
      toast(`Cache de proxy limpo (${res.removed || 0} arquivos removidos)`);
      refreshStats();
    };
  }

  if (btnGenerate) {
    btnGenerate.onclick = async () => {
      const videoClips = (state.clips || []).filter(c => !c.isImage && c.path);
      if (!videoClips.length) return toast('Nenhum clipe de vídeo na timeline para gerar proxy');

      const targetHeight = $('proxyTargetHeight') ? +$('proxyTargetHeight').value : 720;
      const crf = $('proxyCrf') ? +$('proxyCrf').value : 28;

      if (progressWrap) progressWrap.hidden = false;
      btnGenerate.disabled = true;

      for (let i = 0; i < videoClips.length; i++) {
        const c = videoClips[i];
        if (progressLabel) progressLabel.textContent = `Gerando proxy (${i + 1}/${videoClips.length}): ${c.name || 'Vídeo'}...`;
        if (progressBar) progressBar.style.width = '0%';
        try {
          await window.api.generateProxy({ srcPath: c.path, targetHeight, crf });
        } catch (e) {
          toast(`Falha no proxy de ${c.name}: ${e.message}`);
        }
      }

      btnGenerate.disabled = false;
      if (progressWrap) progressWrap.hidden = true;
      refreshStats();
      toast('Processamento de proxies concluído com sucesso!');
    };
  }

  if (window.api.onProxyProgress) {
    window.api.onProxyProgress((data) => {
      if (progressBar && data.percent !== undefined) {
        progressBar.style.width = `${data.percent}%`;
      }
      if (progressLabel && data.done) {
        progressLabel.textContent = data.error ? `Erro: ${data.error}` : 'Proxy concluído!';
      }
    });
  }
}

initGpuDetection();
initProxyManagerUI();

// ─── Fase 11: Efeitos Visuais, Shaders, Modos de Mesclagem e LUTs 3D ─────────
function getActiveTarget() {
  if (!state.selected) return null;
  if (state.selected.kind === 'overlay') {
    return state.overlays.find(o => o.id === state.selected.id);
  }
  return state.clips.find(c => c.id === state.selected.id);
}

function syncFxPanel() {
  const target = getActiveTarget();
  if (!target) return;

  // 1. Blend Mode & Opacidade
  if ($('blendModeSelect')) $('blendModeSelect').value = target.blendMode || 'normal';
  if ($('blendOpacityRange')) {
    const opVal = Math.round((target.opacity ?? 1) * 100);
    $('blendOpacityRange').value = opVal;
    if ($('blendOpacityVal')) $('blendOpacityVal').textContent = `${opVal}%`;
  }

  // 2. Máscara de Camada
  const mask = target.mask || {};
  if ($('maskTypeSelect')) {
    $('maskTypeSelect').value = mask.type || 'none';
    if ($('maskControls')) $('maskControls').hidden = !mask.type || mask.type === 'none';
  }
  if ($('maskSizeRange')) {
    $('maskSizeRange').value = mask.size ?? 80;
    if ($('maskSizeVal')) $('maskSizeVal').textContent = `${mask.size ?? 80}%`;
  }
  if ($('maskFeatherRange')) {
    $('maskFeatherRange').value = mask.feather ?? 5;
    if ($('maskFeatherVal')) $('maskFeatherVal').textContent = `${mask.feather ?? 5}px`;
  }
  if ($('maskRotationRange')) {
    $('maskRotationRange').value = mask.rotation ?? 0;
    if ($('maskRotationVal')) $('maskRotationVal').textContent = `${mask.rotation ?? 0}°`;
  }
  if ($('maskInvertCheck')) $('maskInvertCheck').checked = !!mask.invert;

  // 3. Color Grading & 3D LUT
  const grading = target.colorGrading || {};
  if ($('gradingTempRange')) {
    $('gradingTempRange').value = grading.temp ?? 0;
    if ($('gradingTempVal')) $('gradingTempVal').textContent = grading.temp ?? 0;
  }
  if ($('gradingTintRange')) {
    $('gradingTintRange').value = grading.tint ?? 0;
    if ($('gradingTintVal')) $('gradingTintVal').textContent = grading.tint ?? 0;
  }
  if ($('gradingHighlightsRange')) {
    $('gradingHighlightsRange').value = grading.highlights ?? 0;
    if ($('gradingHighlightsVal')) $('gradingHighlightsVal').textContent = grading.highlights ?? 0;
  }
  if ($('gradingShadowsRange')) {
    $('gradingShadowsRange').value = grading.shadows ?? 0;
    if ($('gradingShadowsVal')) $('gradingShadowsVal').textContent = grading.shadows ?? 0;
  }

  const activeLutLabel = $('activeLutPathLabel');
  if (activeLutLabel) {
    if (target.lutPath) {
      activeLutLabel.hidden = false;
      activeLutLabel.textContent = `LUT ativa: ${target.lutPath.split(/[\\/]/).pop()}`;
    } else {
      activeLutLabel.hidden = true;
    }
  }

  // 4. Efeitos de Estilização
  const effs = target.effects || [];
  const hasEff = (k) => effs.some(e => (typeof e === 'string' ? e : e.type) === k);
  if ($('fxGlitchCheck')) {
    $('fxGlitchCheck').checked = hasEff('glitch');
    if ($('fxGlitchRow')) $('fxGlitchRow').hidden = !hasEff('glitch');
  }
  if ($('fxGrainCheck')) {
    $('fxGrainCheck').checked = hasEff('film_grain');
    if ($('fxGrainRow')) $('fxGrainRow').hidden = !hasEff('film_grain');
  }
  if ($('fxShakeCheck')) {
    $('fxShakeCheck').checked = hasEff('camera_shake');
    if ($('fxShakeRow')) $('fxShakeRow').hidden = !hasEff('camera_shake');
  }
  if ($('fxBloomCheck')) {
    $('fxBloomCheck').checked = hasEff('bloom');
    if ($('fxBloomRow')) $('fxBloomRow').hidden = !hasEff('bloom');
  }
}

function initVisualEffects() {
  // 1. Modos de Mesclagem
  if ($('blendModeSelect')) {
    $('blendModeSelect').onchange = (e) => {
      const target = getActiveTarget();
      if (!target) return toast('Selecione um clipe ou sobreposição primeiro');
      target.blendMode = e.target.value;
      renderPreview();
    };
  }

  if ($('blendOpacityRange')) {
    $('blendOpacityRange').oninput = (e) => {
      const target = getActiveTarget();
      if (!target) return;
      const v = +e.target.value;
      target.opacity = v / 100;
      if ($('blendOpacityVal')) $('blendOpacityVal').textContent = `${v}%`;
      renderPreview();
    };
  }

  // 2. Máscaras Geométricas
  if ($('maskTypeSelect')) {
    $('maskTypeSelect').onchange = (e) => {
      const target = getActiveTarget();
      if (!target) return toast('Selecione um clipe ou sobreposição primeiro');
      const val = e.target.value;
      if (!target.mask) target.mask = {};
      target.mask.type = val;
      if ($('maskControls')) $('maskControls').hidden = val === 'none';
      renderPreview();
    };
  }

  if ($('maskSizeRange')) {
    $('maskSizeRange').oninput = (e) => {
      const target = getActiveTarget();
      if (!target || !target.mask) return;
      const v = +e.target.value;
      target.mask.size = v;
      if ($('maskSizeVal')) $('maskSizeVal').textContent = `${v}%`;
      renderPreview();
    };
  }

  if ($('maskFeatherRange')) {
    $('maskFeatherRange').oninput = (e) => {
      const target = getActiveTarget();
      if (!target || !target.mask) return;
      const v = +e.target.value;
      target.mask.feather = v;
      if ($('maskFeatherVal')) $('maskFeatherVal').textContent = `${v}px`;
      renderPreview();
    };
  }

  if ($('maskRotationRange')) {
    $('maskRotationRange').oninput = (e) => {
      const target = getActiveTarget();
      if (!target || !target.mask) return;
      const v = +e.target.value;
      target.mask.rotation = v;
      if ($('maskRotationVal')) $('maskRotationVal').textContent = `${v}°`;
      renderPreview();
    };
  }

  if ($('maskInvertCheck')) {
    $('maskInvertCheck').onchange = (e) => {
      const target = getActiveTarget();
      if (!target || !target.mask) return;
      target.mask.invert = e.target.checked;
      renderPreview();
    };
  }

  // 3. 3D LUTs e Color Grading
  if ($('lutPresetSelect')) {
    $('lutPresetSelect').onchange = async (e) => {
      const target = getActiveTarget();
      if (!target) return toast('Selecione um clipe ou sobreposição primeiro');
      const val = e.target.value;
      if (val === 'none') {
        target.lutPath = null;
        if ($('activeLutPathLabel')) $('activeLutPathLabel').hidden = true;
      } else if (window.api?.ensureBuiltinLut) {
        try {
          const res = await window.api.ensureBuiltinLut(val);
          if (res.ok && res.path) {
            target.lutPath = res.path;
            if ($('activeLutPathLabel')) {
              $('activeLutPathLabel').hidden = false;
              $('activeLutPathLabel').textContent = `LUT ativa: ${res.path.split(/[\\/]/).pop()}`;
            }
            toast(`Preset 3D LUT "${val}" aplicado!`);
          }
        } catch (err) {
          toast('Falha ao aplicar LUT: ' + err.message);
        }
      }
      renderPreview();
    };
  }

  if ($('btnImportLut')) {
    $('btnImportLut').onclick = async () => {
      const target = getActiveTarget();
      if (!target) return toast('Selecione um clipe ou sobreposição primeiro');
      if (window.api?.importLut) {
        const filePath = await window.api.importLut();
        if (filePath) {
          target.lutPath = filePath;
          if ($('lutPresetSelect')) $('lutPresetSelect').value = 'none';
          if ($('activeLutPathLabel')) {
            $('activeLutPathLabel').hidden = false;
            $('activeLutPathLabel').textContent = `LUT custom: ${filePath.split(/[\\/]/).pop()}`;
          }
          toast('Arquivo 3D LUT importado com sucesso!');
          renderPreview();
        }
      }
    };
  }

  // Sliders de Color Grading
  const gradingInputs = [
    { id: 'gradingTempRange', valId: 'gradingTempVal', key: 'temp', unit: '' },
    { id: 'gradingTintRange', valId: 'gradingTintVal', key: 'tint', unit: '' },
    { id: 'gradingHighlightsRange', valId: 'gradingHighlightsVal', key: 'highlights', unit: '' },
    { id: 'gradingShadowsRange', valId: 'gradingShadowsVal', key: 'shadows', unit: '' }
  ];

  gradingInputs.forEach(({ id, valId, key, unit }) => {
    const el = $(id);
    if (!el) return;
    el.oninput = (e) => {
      const target = getActiveTarget();
      if (!target) return;
      if (!target.colorGrading) target.colorGrading = {};
      const v = +e.target.value;
      target.colorGrading[key] = v;
      if ($(valId)) $(valId).textContent = `${v}${unit}`;
      renderPreview();
    };
  });

  if ($('btnResetGrading')) {
    $('btnResetGrading').onclick = () => {
      const target = getActiveTarget();
      if (!target) return;
      target.colorGrading = {};
      target.lutPath = null;
      if ($('lutPresetSelect')) $('lutPresetSelect').value = 'none';
      if ($('activeLutPathLabel')) $('activeLutPathLabel').hidden = true;
      gradingInputs.forEach(({ id, valId, unit }) => {
        if ($(id)) $(id).value = 0;
        if ($(valId)) $(valId).textContent = `0${unit}`;
      });
      renderPreview();
      toast('Color grading resetado');
    };
  }

  // 4. Shaders e Efeitos de Estilização
  const fxToggles = [
    { checkId: 'fxGlitchCheck', rowId: 'fxGlitchRow', sliderId: 'fxGlitchIntensity', valId: 'fxGlitchVal', key: 'glitch' },
    { checkId: 'fxGrainCheck', rowId: 'fxGrainRow', sliderId: 'fxGrainIntensity', valId: 'fxGrainVal', key: 'film_grain' },
    { checkId: 'fxShakeCheck', rowId: 'fxShakeRow', sliderId: 'fxShakeIntensity', valId: 'fxShakeVal', key: 'camera_shake' },
    { checkId: 'fxBloomCheck', rowId: 'fxBloomRow', sliderId: 'fxBloomIntensity', valId: 'fxBloomVal', key: 'bloom' }
  ];

  fxToggles.forEach(({ checkId, rowId, sliderId, valId, key }) => {
    const chk = $(checkId);
    const row = $(rowId);
    const sld = $(sliderId);
    const val = $(valId);
    if (!chk) return;

    function updateEff() {
      const target = getActiveTarget();
      if (!target) return;
      if (!target.effects) target.effects = [];
      target.effects = target.effects.filter(e => (typeof e === 'string' ? e : e.type) !== key);
      if (chk.checked) {
        const intensity = sld ? +sld.value : 1.0;
        target.effects.push({ type: key, intensity });
      }
      if (row) row.hidden = !chk.checked;
      renderPreview();
    }

    chk.onchange = updateEff;
    if (sld) {
      sld.oninput = () => {
        if (val) val.textContent = `${sld.value}x`;
        updateEff();
      };
    }
  });
}

initVisualEffects();

// ── Fase 12: Áudio Avançado, Voice Changers e Separação Neural ────────────────

const EQ_FREQUENCIES_HZ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass_boost: [6, 5, 3, 0, 0, 0, 0, 0, 0, 0],
  vocal_clarity: [-3, -2, 0, 1, 3, 4, 3, 1, 0, 0],
  treble_boost: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  podcast: [-6, -2, 2, 1, 1, 3, 3, 1, -1, -2]
};

const VOICE_DESCRIPTIONS = {
  none: 'Voz original sem alterações.',
  deep_monster: '👹 Pitch grave (-7 st) com ressonância profunda de sub-graves.',
  chipmunk: '🐿️ Pitch agudo (+8 st) acelerado harmonicamente.',
  robot: '🤖 Modulação metálica em anel com ressonância flanger.',
  megaphone: '📢 Passa-banda telefônico estreito com saturação harmônica.',
  space_echo: '🌌 Reflexões acústicas multidirecionais com atenuação suave.'
};

function getActiveAudioTarget() {
  const s = state.selected;
  if (s) {
    if (s.kind === 'clip') {
      const c = state.clips.find(x => x.id === s.id);
      if (c && c.hasAudio && !c.isImage) return c;
    } else if (s.kind === 'audio') {
      const a = state.audios.find(x => x.id === s.id);
      if (a) return a;
    }
  }
  const firstClip = state.clips.find(c => c.hasAudio && !c.isImage);
  if (firstClip) return firstClip;
  return state.audios[0] || null;
}

function syncAudioProPanel() {
  const target = getActiveAudioTarget();
  const effectSelect = $('voiceEffectSelect');
  const effectDesc = $('voiceEffectDesc');
  const pitchRange = $('pitchShiftRange');
  const pitchVal = $('pitchShiftVal');
  const compCheck = $('audioCompressorCheck');

  if (!target) {
    if (effectDesc) effectDesc.textContent = 'Selecione um clipe ou faixa de áudio na timeline.';
    return;
  }

  const currentEff = target.voiceEffect || 'none';
  if (effectSelect) effectSelect.value = currentEff;
  if (effectDesc) effectDesc.textContent = VOICE_DESCRIPTIONS[currentEff] || '';

  const currentPitch = target.pitchShift || 0;
  if (pitchRange) pitchRange.value = currentPitch;
  if (pitchVal) pitchVal.textContent = currentPitch === 0 ? '0 st (Original)' : `${currentPitch > 0 ? '+' : ''}${currentPitch} st`;

  if (compCheck) compCheck.checked = !!target.compressor;

  const gains = Array.isArray(target.eq10) ? target.eq10 : (target.eq10 ? Object.values(target.eq10) : []);
  EQ_FREQUENCIES_HZ.forEach((_, idx) => {
    const sld = $(`eqSlider_${idx}`);
    const val = $(`eqVal_${idx}`);
    const g = Number(gains[idx]) || 0;
    if (sld) sld.value = g;
    if (val) val.textContent = `${g > 0 ? '+' : ''}${g}dB`;
  });
}

async function executeFourStemsSeparation(inputPath, targetItem) {
  if (!inputPath) {
    toast('Nenhum arquivo de áudio ou vídeo válido para separação de stems.');
    return;
  }
  const progWrap = $('stem4Progress');
  const progFill = $('stem4ProgressFill');
  const statusLbl = $('stem4Status');

  if (progWrap) progWrap.hidden = false;
  if (progFill) progFill.style.width = '10%';
  if (statusLbl) statusLbl.textContent = 'Iniciando separação neural em 4 stems (DSP)...';
  toast('Iniciando separação em 4 stems...');

  if (window.api && window.api.onStem4Progress) {
    window.api.onStem4Progress((data) => {
      if (progFill) progFill.style.width = `${data.percent}%`;
      if (statusLbl) statusLbl.textContent = `${data.stage ? `[${data.stage}] ` : ''}${data.text || `Processando: ${data.percent}%`}`;
    });
  }

  try {
    const res = await window.api.separateFourStems(inputPath);
    if (!res || !res.ok) {
      if (statusLbl) statusLbl.textContent = 'Erro: ' + (res?.error || 'Falha na separação');
      toast('Erro ao separar stems: ' + (res?.error || 'Falha ao processar'));
      return;
    }

    if (progFill) progFill.style.width = '100%';
    if (statusLbl) statusLbl.textContent = 'Separação concluída com sucesso!';

    const baseName = targetItem?.name ? targetItem.name.replace(/^♪\s*/, '') : 'Áudio';
    const start = targetItem?.start !== undefined ? targetItem.start : state.time;
    const dur = targetItem?.duration || 10;
    const max = targetItem?.max || dur;

    if (targetItem) {
      targetItem.volume = 0;
    }

    const stemMeta = [
      { key: 'vocal', prefix: '🎙️ Voz' },
      { key: 'drums', prefix: '🥁 Bateria' },
      { key: 'bass', prefix: '🎸 Baixo' },
      { key: 'other', prefix: '🎹 Outros' }
    ];

    for (const sm of stemMeta) {
      const stemPath = res.stems[sm.key];
      if (stemPath) {
        const audioObj = {
          id: uid++,
          path: stemPath,
          name: `${sm.prefix} - ${baseName}`,
          start,
          in: 0,
          duration: dur,
          max,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0
        };
        if (window.api && window.api.getWaveformData) {
          window.api.getWaveformData(stemPath, 160).then(wf => {
            if (wf && wf.ok && wf.points) {
              audioObj.waveformPoints = wf.points;
              renderTimeline();
            }
          }).catch(() => {});
        }
        state.audios.push(audioObj);
      }
    }

    renderTimeline();
    renderProps();
    toast('4 Stems (Voz, Bateria, Baixo e Outros) adicionados à timeline!');
    setTimeout(() => {
      if (progWrap) progWrap.hidden = true;
    }, 4000);
  } catch (err) {
    if (statusLbl) statusLbl.textContent = 'Erro: ' + (err.message || err);
    toast('Erro: ' + (err.message || err));
  }
}

function initAudioPro() {
  const eqContainer = $('eq10Container');
  if (eqContainer) {
    eqContainer.innerHTML = '';
    EQ_FREQUENCIES_HZ.forEach((freq, idx) => {
      const col = document.createElement('div');
      col.className = 'eq10-col';
      col.innerHTML = `
        <span class="eq10-val" id="eqVal_${idx}">0dB</span>
        <input type="range" class="eq10-slider" id="eqSlider_${idx}" min="-12" max="12" step="1" value="0" data-idx="${idx}">
        <span class="eq10-freq">${EQ_LABELS[idx]}</span>
      `;
      eqContainer.appendChild(col);
    });

    eqContainer.querySelectorAll('.eq10-slider').forEach(slider => {
      slider.oninput = (e) => {
        const idx = +e.target.dataset.idx;
        const val = +e.target.value;
        const valEl = $(`eqVal_${idx}`);
        if (valEl) valEl.textContent = `${val > 0 ? '+' : ''}${val}dB`;

        const target = getActiveAudioTarget();
        if (target) {
          if (!Array.isArray(target.eq10)) {
            target.eq10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          }
          target.eq10[idx] = val;
        }
      };
    });
  }

  const eqPresetSelect = $('eqPresetSelect');
  if (eqPresetSelect) {
    eqPresetSelect.onchange = (e) => {
      const presetKey = e.target.value;
      const presetGains = EQ_PRESETS[presetKey] || EQ_PRESETS.flat;
      const target = getActiveAudioTarget();
      if (target) target.eq10 = [...presetGains];

      EQ_FREQUENCIES_HZ.forEach((_, idx) => {
        const sld = $(`eqSlider_${idx}`);
        const val = $(`eqVal_${idx}`);
        const g = presetGains[idx] || 0;
        if (sld) sld.value = g;
        if (val) val.textContent = `${g > 0 ? '+' : ''}${g}dB`;
      });
      toast(`Equalizador aplicado: ${e.target.options[e.target.selectedIndex].text}`);
    };
  }

  const btnResetEq = $('btnResetEq');
  if (btnResetEq) {
    btnResetEq.onclick = () => {
      if (eqPresetSelect) eqPresetSelect.value = 'flat';
      const target = getActiveAudioTarget();
      if (target) target.eq10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      EQ_FREQUENCIES_HZ.forEach((_, idx) => {
        const sld = $(`eqSlider_${idx}`);
        const val = $(`eqVal_${idx}`);
        if (sld) sld.value = 0;
        if (val) val.textContent = '0dB';
      });
      toast('Equalizador resetado para 0 dB');
    };
  }

  const voiceSelect = $('voiceEffectSelect');
  if (voiceSelect) {
    voiceSelect.onchange = (e) => {
      const effectKey = e.target.value;
      const target = getActiveAudioTarget();
      if (target) {
        target.voiceEffect = effectKey;
        renderTimeline();
      }
      const descEl = $('voiceEffectDesc');
      if (descEl) descEl.textContent = VOICE_DESCRIPTIONS[effectKey] || '';
    };
  }

  const pitchRange = $('pitchShiftRange');
  const pitchVal = $('pitchShiftVal');
  const btnResetPitch = $('btnResetPitch');
  if (pitchRange) {
    pitchRange.oninput = (e) => {
      const semi = +e.target.value;
      if (pitchVal) pitchVal.textContent = semi === 0 ? '0 st (Original)' : `${semi > 0 ? '+' : ''}${semi} st`;
      const target = getActiveAudioTarget();
      if (target) {
        target.pitchShift = semi;
        renderTimeline();
      }
    };
  }
  if (btnResetPitch) {
    btnResetPitch.onclick = () => {
      if (pitchRange) pitchRange.value = 0;
      if (pitchVal) pitchVal.textContent = '0 st (Original)';
      const target = getActiveAudioTarget();
      if (target) {
        target.pitchShift = 0;
        renderTimeline();
      }
    };
  }

  const compCheck = $('audioCompressorCheck');
  if (compCheck) {
    compCheck.onchange = (e) => {
      const target = getActiveAudioTarget();
      if (target) {
        target.compressor = e.target.checked;
        renderTimeline();
      }
    };
  }

  const btnSep4 = $('btnSeparate4Stems');
  if (btnSep4) {
    btnSep4.onclick = () => {
      const target = getActiveAudioTarget();
      if (!target) {
        toast('Selecione um clipe ou faixa de áudio para separar em 4 stems.');
        return;
      }
      executeFourStemsSeparation(target.path, target);
    };
  }
}

initAudioPro();

// ─── Fase 15: Gravação Direta na Timeline: Voiceover & Webcam PiP ───────────
let openVoiceoverModal = () => {};
let openWebcamModal = () => {};

function initTimelineRecording() {
  // ── 15.1: Gravador de Locução / Voiceover ──────────────────────────
  const voiceModal = $('voiceoverModal');
  const btnVoiceover = $('btnVoiceover');
  const btnCloseVoice = $('btnCloseVoiceover');
  const voiceMicSelect = $('voiceMicSelect');
  const voiceMuteProjectCheck = $('voiceMuteProjectCheck');
  const voiceEchoCancelCheck = $('voiceEchoCancelCheck');
  const vuMeterBar = $('vuMeterBar');
  const vuMeterDb = $('vuMeterDb');
  const vuClipLed = $('vuClipLed');
  const voiceTimerEl = $('voiceRecordTimer');
  const voiceStatusEl = $('voiceRecordStatus');
  const btnToggleVoice = $('btnToggleVoiceRecord');
  const voiceRecBtnText = $('voiceRecBtnText');
  const voiceCountdownOverlay = $('voiceCountdownOverlay');
  const voiceCountdownNumber = $('voiceCountdownNumber');

  let voiceStream = null;
  let voiceAudioCtx = null;
  let voiceAnalyser = null;
  let voiceSourceNode = null;
  let voiceRecorder = null;
  let voiceChunks = [];
  let voiceRafId = null;
  let isVoiceRecording = false;
  let voiceStartAgulhaTime = 0;
  let voiceRecordStartTime = 0;
  let voiceTimerInterval = null;
  let wasAudioMutedBeforeRecord = false;
  let clipLedTimeout = null;

  async function enumerateAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      if (voiceMicSelect) {
        voiceMicSelect.innerHTML = '';
        if (audioInputs.length === 0) {
          voiceMicSelect.innerHTML = '<option value="default">Microfone Padrão</option>';
        } else {
          audioInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Microfone ${idx + 1}`;
            voiceMicSelect.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.warn('Erro ao listar microfones:', err);
    }
  }

  async function startVoiceMonitor() {
    stopVoiceMonitor();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (voiceStatusEl) voiceStatusEl.textContent = 'API de captura de áudio indisponível neste ambiente.';
      return;
    }
    const deviceId = voiceMicSelect ? voiceMicSelect.value : 'default';
    const echoCancel = voiceEchoCancelCheck ? voiceEchoCancelCheck.checked : true;
    try {
      const constraints = {
        audio: {
          deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
          echoCancellation: echoCancel,
          noiseSuppression: echoCancel
        }
      };
      voiceStream = await navigator.mediaDevices.getUserMedia(constraints);
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        voiceAudioCtx = new AudioContextClass();
        voiceSourceNode = voiceAudioCtx.createMediaStreamSource(voiceStream);
        voiceAnalyser = voiceAudioCtx.createAnalyser();
        voiceAnalyser.fftSize = 512;
        voiceSourceNode.connect(voiceAnalyser);

        const dataArray = new Uint8Array(voiceAnalyser.frequencyBinCount);
        const updateVu = () => {
          if (!voiceAnalyser) return;
          voiceAnalyser.getByteTimeDomainData(dataArray);
          let sumSquares = 0;
          let peak = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const norm = (dataArray[i] - 128) / 128;
            sumSquares += norm * norm;
            const abs = Math.abs(norm);
            if (abs > peak) peak = abs;
          }
          const rms = Math.sqrt(sumSquares / dataArray.length);
          let db = 20 * Math.log10(rms || 0.0001);
          db = Math.max(-60, Math.min(0, db));

          const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
          if (vuMeterBar) vuMeterBar.style.width = pct.toFixed(1) + '%';
          if (vuMeterDb) vuMeterDb.textContent = db <= -59.5 ? '-inf dB' : `${db.toFixed(1)} dB`;

          if (peak >= 0.96 && vuClipLed) {
            vuClipLed.classList.add('active');
            clearTimeout(clipLedTimeout);
            clipLedTimeout = setTimeout(() => {
              if (vuClipLed) vuClipLed.classList.remove('active');
            }, 350);
          }
          voiceRafId = requestAnimationFrame(updateVu);
        };
        voiceRafId = requestAnimationFrame(updateVu);
      }
      if (voiceStatusEl && !isVoiceRecording) {
        voiceStatusEl.textContent = 'Microfone conectado. Pronto para gravar na agulha.';
      }
    } catch (err) {
      console.warn('Falha ao acessar microfone:', err);
      if (voiceStatusEl) voiceStatusEl.textContent = 'Microfone não detectado ou permissão negada.';
    }
  }

  function stopVoiceMonitor() {
    if (voiceRafId) { cancelAnimationFrame(voiceRafId); voiceRafId = null; }
    if (voiceAudioCtx) { voiceAudioCtx.close().catch(() => {}); voiceAudioCtx = null; }
    if (voiceStream) {
      voiceStream.getTracks().forEach(t => t.stop());
      voiceStream = null;
    }
    if (vuMeterBar) vuMeterBar.style.width = '0%';
    if (vuMeterDb) vuMeterDb.textContent = '-inf dB';
    if (vuClipLed) vuClipLed.classList.remove('active');
  }

  openVoiceoverModal = async () => {
    if (!voiceModal) return;
    voiceModal.hidden = false;
    await enumerateAudioDevices();
    await startVoiceMonitor();
    if (voiceTimerEl) voiceTimerEl.textContent = '00:00.0';
    if (voiceStatusEl) voiceStatusEl.textContent = `Pronto para gravar no cursor (${fmt(state.time)}).`;
  };

  const closeVoiceoverModal = () => {
    if (isVoiceRecording) stopVoiceRecording();
    stopVoiceMonitor();
    if (voiceModal) voiceModal.hidden = true;
  };

  if (btnVoiceover) btnVoiceover.onclick = openVoiceoverModal;
  if (btnCloseVoice) btnCloseVoice.onclick = closeVoiceoverModal;
  if (voiceModal) {
    voiceModal.onclick = (e) => { if (e.target === voiceModal) closeVoiceoverModal(); };
  }
  if (voiceMicSelect) voiceMicSelect.onchange = () => startVoiceMonitor();
  if (voiceEchoCancelCheck) voiceEchoCancelCheck.onchange = () => startVoiceMonitor();

  async function startVoiceRecording() {
    if (!voiceStream) await startVoiceMonitor();
    if (!voiceStream) {
      toast('Não foi possível iniciar: nenhum microfone disponível.');
      return;
    }

    // Contagem Regressiva 3..2..1
    if (voiceCountdownOverlay && voiceCountdownNumber) {
      voiceCountdownOverlay.hidden = false;
      for (let count = 3; count >= 1; count--) {
        voiceCountdownNumber.textContent = count;
        await new Promise(r => setTimeout(r, 700));
      }
      voiceCountdownOverlay.hidden = true;
    }

    voiceChunks = [];
    voiceStartAgulhaTime = state.time;
    voiceRecordStartTime = Date.now();

    // Muta projeto se solicitado para não vazar
    if (voiceMuteProjectCheck && voiceMuteProjectCheck.checked) {
      wasAudioMutedBeforeRecord = !!(state.tracks.audio?.mute);
      if (state.tracks.audio) state.tracks.audio.mute = true;
    }

    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      voiceRecorder = new MediaRecorder(voiceStream, { mimeType: mime });
    } catch (_) {
      voiceRecorder = new MediaRecorder(voiceStream);
    }

    voiceRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) voiceChunks.push(e.data);
    };

    voiceRecorder.onstop = async () => {
      // Restaura áudio do projeto
      if (voiceMuteProjectCheck && voiceMuteProjectCheck.checked && state.tracks.audio) {
        state.tracks.audio.mute = wasAudioMutedBeforeRecord;
      }
      setPlaying(false);

      if (voiceChunks.length === 0) {
        toast('Nenhum dado de áudio gravado.');
        return;
      }

      if (voiceStatusEl) voiceStatusEl.textContent = 'Processando e convertendo áudio WAV em alta fidelidade...';
      try {
        const audioBlob = new Blob(voiceChunks, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const res = await window.api.saveAudioRecording(arrayBuffer, 'locucao_');

        if (res && res.success && res.media) {
          state.media.push(res.media);
          const recDuration = res.media.duration || Math.max(0.5, (Date.now() - voiceRecordStartTime) / 1000);
          state.audios.push({
            id: uid++,
            path: res.media.path,
            name: res.media.name || '🎙️ Locução Gravada',
            wave: res.media.wave || [],
            start: voiceStartAgulhaTime,
            in: 0,
            duration: recDuration,
            max: recDuration,
            volume: 1
          });
          renderMediaList();
          renderTimeline();
          toast(`🎙️ Locução gravada e inserida na timeline (${fmt(voiceStartAgulhaTime)})!`);
          closeVoiceoverModal();
        } else {
          toast('Erro ao processar gravação de locução.');
          if (voiceStatusEl) voiceStatusEl.textContent = 'Falha ao salvar gravação.';
        }
      } catch (err) {
        console.error('Erro ao finalizar gravação de voz:', err);
        toast('Erro ao converter arquivo de áudio gravado.');
      }
    };

    voiceRecorder.start(200);
    isVoiceRecording = true;

    if (btnToggleVoice) btnToggleVoice.classList.add('recording');
    if (voiceRecBtnText) voiceRecBtnText.textContent = 'Parar Gravação';
    if (voiceTimerEl) voiceTimerEl.classList.add('recording');
    if (voiceStatusEl) voiceStatusEl.textContent = '● Gravando locução ao vivo na timeline...';

    // Reproduz timeline simultaneamente para sincronização
    setPlaying(true);

    clearInterval(voiceTimerInterval);
    voiceTimerInterval = setInterval(() => {
      const elapsed = (Date.now() - voiceRecordStartTime) / 1000;
      if (voiceTimerEl) voiceTimerEl.textContent = fmt(elapsed);
    }, 100);
  }

  function stopVoiceRecording() {
    if (!isVoiceRecording || !voiceRecorder) return;
    isVoiceRecording = false;
    clearInterval(voiceTimerInterval);
    if (btnToggleVoice) btnToggleVoice.classList.remove('recording');
    if (voiceRecBtnText) voiceRecBtnText.textContent = 'Iniciar Gravação (3s)';
    if (voiceTimerEl) voiceTimerEl.classList.remove('recording');
    try {
      if (voiceRecorder.state !== 'inactive') voiceRecorder.stop();
    } catch (e) {
      console.warn('Erro ao parar voiceRecorder:', e);
    }
  }

  if (btnToggleVoice) {
    btnToggleVoice.onclick = () => {
      if (isVoiceRecording) {
        stopVoiceRecording();
      } else {
        startVoiceRecording();
      }
    };
  }

  // ── 15.2: Captura de Webcam para Picture-in-Picture (PiP) ─────────
  const camModal = $('webcamModal');
  const btnWebcamPiP = $('btnWebcamPiP');
  const btnCloseCam = $('btnCloseWebcam');
  const camDeviceSelect = $('camDeviceSelect');
  const camMicSelect = $('camMicSelect');
  const camLivePreview = $('camLivePreview');
  const camMaskSelect = $('camMaskSelect');
  const camPipPosition = $('camPipPosition');
  const camPipScale = $('camPipScale');
  const camPipScaleVal = $('camPipScaleVal');
  const camMuteProjectCheck = $('camMuteProjectCheck');
  const camTimerEl = $('camRecordTimer');
  const camStatusEl = $('camRecordStatus');
  const btnToggleCam = $('btnToggleCamRecord');
  const camRecBtnText = $('camRecBtnText');
  const camCountdownOverlay = $('camCountdownOverlay');
  const camCountdownNumber = $('camCountdownNumber');

  let camStream = null;
  let camRecorder = null;
  let camChunks = [];
  let isCamRecording = false;
  let camStartAgulhaTime = 0;
  let camRecordStartTime = 0;
  let camTimerInterval = null;
  let wasCamAudioMuted = false;

  if (camPipScale && camPipScaleVal) {
    camPipScale.oninput = (e) => {
      camPipScaleVal.textContent = `${e.target.value}%`;
    };
  }

  async function enumerateVideoDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const audioInputs = devices.filter(d => d.kind === 'audioinput');

      if (camDeviceSelect) {
        camDeviceSelect.innerHTML = '';
        if (videoInputs.length === 0) {
          camDeviceSelect.innerHTML = '<option value="default">Câmera Padrão</option>';
        } else {
          videoInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Câmera ${idx + 1}`;
            camDeviceSelect.appendChild(opt);
          });
        }
      }

      if (camMicSelect) {
        camMicSelect.innerHTML = '';
        if (audioInputs.length === 0) {
          camMicSelect.innerHTML = '<option value="default">Microfone Padrão</option>';
        } else {
          audioInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Microfone ${idx + 1}`;
            camMicSelect.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.warn('Erro ao listar câmeras e microfones:', err);
    }
  }

  async function startCamPreview() {
    stopCamPreview();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (camStatusEl) camStatusEl.textContent = 'API de captura de câmera indisponível.';
      return;
    }
    const videoDeviceId = camDeviceSelect ? camDeviceSelect.value : 'default';
    const audioDeviceId = camMicSelect ? camMicSelect.value : 'default';
    try {
      const constraints = {
        video: {
          deviceId: videoDeviceId !== 'default' ? { exact: videoDeviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          deviceId: audioDeviceId !== 'default' ? { exact: audioDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true
        }
      };
      camStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (camLivePreview) {
        camLivePreview.srcObject = camStream;
        camLivePreview.play().catch(() => {});
      }
      if (camStatusEl && !isCamRecording) {
        camStatusEl.textContent = 'Câmera conectada. Pronto para gravar reação PiP.';
      }
    } catch (err) {
      console.warn('Falha ao acessar câmera:', err);
      if (camStatusEl) camStatusEl.textContent = 'Câmera não detectada ou acesso não concedido.';
    }
  }

  function stopCamPreview() {
    if (camLivePreview) {
      camLivePreview.pause();
      camLivePreview.srcObject = null;
    }
    if (camStream) {
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
    }
  }

  openWebcamModal = async () => {
    if (!camModal) return;
    camModal.hidden = false;
    await enumerateVideoDevices();
    await startCamPreview();
    if (camTimerEl) camTimerEl.textContent = '00:00.0';
    if (camStatusEl) camStatusEl.textContent = `Pronto para gravar PiP no cursor (${fmt(state.time)}).`;
  };

  const closeWebcamModal = () => {
    if (isCamRecording) stopCamRecording();
    stopCamPreview();
    if (camModal) camModal.hidden = true;
  };

  if (btnWebcamPiP) btnWebcamPiP.onclick = openWebcamModal;
  if (btnCloseCam) btnCloseCam.onclick = closeWebcamModal;
  if (camModal) {
    camModal.onclick = (e) => { if (e.target === camModal) closeWebcamModal(); };
  }
  if (camDeviceSelect) camDeviceSelect.onchange = () => startCamPreview();
  if (camMicSelect) camMicSelect.onchange = () => startCamPreview();

  async function startCamRecording() {
    if (!camStream) await startCamPreview();
    if (!camStream) {
      toast('Não foi possível iniciar: câmera ou microfone indisponível.');
      return;
    }

    // Contagem Regressiva 3..2..1
    if (camCountdownOverlay && camCountdownNumber) {
      camCountdownOverlay.hidden = false;
      for (let count = 3; count >= 1; count--) {
        camCountdownNumber.textContent = count;
        await new Promise(r => setTimeout(r, 700));
      }
      camCountdownOverlay.hidden = true;
    }

    camChunks = [];
    camStartAgulhaTime = state.time;
    camRecordStartTime = Date.now();

    if (camMuteProjectCheck && camMuteProjectCheck.checked) {
      wasCamAudioMuted = !!(state.tracks.audio?.mute);
      if (state.tracks.audio) state.tracks.audio.mute = true;
    }

    try {
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';
      camRecorder = new MediaRecorder(camStream, { mimeType: mime });
    } catch (_) {
      camRecorder = new MediaRecorder(camStream);
    }

    camRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) camChunks.push(e.data);
    };

    camRecorder.onstop = async () => {
      if (camMuteProjectCheck && camMuteProjectCheck.checked && state.tracks.audio) {
        state.tracks.audio.mute = wasCamAudioMuted;
      }
      setPlaying(false);

      if (camChunks.length === 0) {
        toast('Nenhum dado de vídeo gravado.');
        return;
      }

      if (camStatusEl) camStatusEl.textContent = 'Processando vídeo MP4 H.264 e gerando miniatura...';
      try {
        const videoBlob = new Blob(camChunks, { type: 'video/webm' });
        const arrayBuffer = await videoBlob.arrayBuffer();
        const res = await window.api.saveVideoRecording(arrayBuffer, 'webcam_pip_');

        if (res && res.success && res.media) {
          state.media.push(res.media);
          const recDuration = res.media.duration || Math.max(0.5, (Date.now() - camRecordStartTime) / 1000);

          // Posição PiP
          const posMode = camPipPosition ? camPipPosition.value : 'bottom-right';
          let posX = 0.85, posY = 0.85;
          if (posMode === 'bottom-left') { posX = 0.15; posY = 0.85; }
          else if (posMode === 'top-right') { posX = 0.85; posY = 0.15; }
          else if (posMode === 'top-left') { posX = 0.15; posY = 0.15; }

          // Formato e Máscara
          const maskMode = camMaskSelect ? camMaskSelect.value : 'circle';
          const maskConfig = maskMode === 'circle'
            ? { type: 'circle', size: 80 }
            : { type: 'rectangle', size: 90 };

          const pipScale = camPipScale ? +camPipScale.value : 30;

          state.overlays.push({
            id: uid++,
            path: res.media.path,
            name: res.media.name || '📷 Webcam PiP',
            thumb: res.media.thumb,
            isImage: false,
            start: camStartAgulhaTime,
            in: 0,
            duration: recDuration,
            max: recDuration,
            x: posX,
            y: posY,
            scale: pipScale,
            opacity: 1,
            mask: maskConfig,
            borderRadius: maskMode === 'circle' ? 9999 : 6
          });

          renderMediaList();
          renderTimeline();
          toast(`📷 Reação PiP gravada e inserida na timeline (${fmt(camStartAgulhaTime)})!`);
          closeWebcamModal();
        } else {
          toast('Erro ao processar gravação de webcam.');
          if (camStatusEl) camStatusEl.textContent = 'Falha ao salvar gravação de vídeo.';
        }
      } catch (err) {
        console.error('Erro ao finalizar gravação de webcam:', err);
        toast('Erro ao converter vídeo gravado.');
      }
    };

    camRecorder.start(200);
    isCamRecording = true;

    if (btnToggleCam) btnToggleCam.classList.add('recording');
    if (camRecBtnText) camRecBtnText.textContent = 'Parar Gravação PiP';
    if (camTimerEl) camTimerEl.classList.add('recording');
    if (camStatusEl) camStatusEl.textContent = '● Gravando reação de webcam ao vivo...';

    setPlaying(true);

    clearInterval(camTimerInterval);
    camTimerInterval = setInterval(() => {
      const elapsed = (Date.now() - camRecordStartTime) / 1000;
      if (camTimerEl) camTimerEl.textContent = fmt(elapsed);
    }, 100);
  }

  function stopCamRecording() {
    if (!isCamRecording || !camRecorder) return;
    isCamRecording = false;
    clearInterval(camTimerInterval);
    if (btnToggleCam) btnToggleCam.classList.remove('recording');
    if (camRecBtnText) camRecBtnText.textContent = 'Iniciar Gravação PiP';
    if (camTimerEl) camTimerEl.classList.remove('recording');
    try {
      if (camRecorder.state !== 'inactive') camRecorder.stop();
    } catch (e) {
      console.warn('Erro ao parar camRecorder:', e);
    }
  }

  if (btnToggleCam) {
    btnToggleCam.onclick = () => {
      if (isCamRecording) {
        stopCamRecording();
      } else {
        startCamRecording();
      }
    };
  }
}

initTimelineRecording();

// ─── Fase 16: Detector Inteligente de Silêncio e Cortes Rítmicos ────────────
function initSilenceDetector() {
  const modal = $('silenceModal');
  const btnOpen = $('btnSilenceCut');
  const btnClose = $('btnCloseSilence');
  const noiseSelect = $('silenceNoiseThreshold');
  const minDurSelect = $('silenceMinDuration');
  const paddingSelect = $('silencePadding');
  const btnAnalyze = $('btnAnalyzeSilence');
  const statsBox = $('silenceStatsBox');
  const countVal = $('silenceCountVal');
  const timeVal = $('silenceRemovedTimeVal');
  const partsVal = $('silenceSpeechPartsVal');
  const previewList = $('silencePreviewList');
  const actionsWrap = $('silenceActionsWrap');
  const btnApplyCut = $('btnApplySilenceCut');
  const btnExportFile = $('btnExportSilenceFreeFile');

  let currentAnalysis = null;
  let targetMediaItem = null;

  function getTargetItem() {
    if (state.selected) {
      const { kind, id } = state.selected;
      if (kind === 'clip') return state.clips.find(c => c.id === id);
      if (kind === 'audio') return state.audios.find(a => a.id === id);
    }
    if (state.clips && state.clips.length > 0) return state.clips[0];
    if (state.audios && state.audios.length > 0) return state.audios[0];
    return null;
  }

  const openModal = () => {
    targetMediaItem = getTargetItem();
    if (!targetMediaItem || !targetMediaItem.path) {
      toast('Selecione um clipe ou adicione uma mídia à timeline primeiro.');
      return;
    }
    if (modal) modal.hidden = false;
    if (statsBox) statsBox.hidden = true;
    if (previewList) previewList.hidden = true;
    if (actionsWrap) actionsWrap.hidden = true;
    currentAnalysis = null;
  };

  const closeModal = () => {
    if (modal) modal.hidden = true;
  };

  if (btnOpen) btnOpen.onclick = openModal;
  if (btnClose) btnClose.onclick = closeModal;
  if (modal) {
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  }

  if (btnAnalyze) {
    btnAnalyze.onclick = async () => {
      targetMediaItem = getTargetItem();
      if (!targetMediaItem || !targetMediaItem.path) {
        toast('Nenhum clipe disponível para análise.');
        return;
      }

      btnAnalyze.disabled = true;
      btnAnalyze.textContent = '⏳ Analisando acústica do arquivo...';
      try {
        const noiseThreshold = noiseSelect ? noiseSelect.value : '-35dB';
        const minDuration = minDurSelect ? parseFloat(minDurSelect.value) : 0.4;
        const padding = paddingSelect ? parseFloat(paddingSelect.value) : 0.06;

        const res = await window.api.detectSilence({
          inputPath: targetMediaItem.path,
          noiseThreshold,
          minDuration,
          padding
        });

        if (!res || !res.ok) {
          toast('Falha na detecção de silêncio: ' + (res?.error || 'Erro desconhecido'));
          return;
        }

        currentAnalysis = res;

        if (statsBox) statsBox.hidden = false;
        if (countVal) countVal.textContent = res.silences.length;
        if (timeVal) timeVal.textContent = `${res.totalSilenceDuration.toFixed(1)}s`;
        if (partsVal) partsVal.textContent = res.speechSegments.length;

        if (previewList) {
          previewList.hidden = false;
          previewList.innerHTML = '';
          if (res.silences.length === 0) {
            previewList.innerHTML = '<div style="padding:6px;color:#8a8aa3">Nenhuma pausa silenciosa detectada com o limiar atual. Áudio contínuo!</div>';
          } else {
            res.silences.slice(0, 30).forEach((s, idx) => {
              const row = document.createElement('div');
              row.className = 'silence-item-row';
              row.innerHTML = `<span>Pausa #${idx + 1}: ${fmt(s.start)} → ${fmt(s.end)}</span> <span>${s.duration}s</span>`;
              previewList.appendChild(row);
            });
            if (res.silences.length > 30) {
              const more = document.createElement('div');
              more.style.padding = '4px';
              more.style.color = '#8a8aa3';
              more.textContent = `... e mais ${res.silences.length - 30} pausas detectadas.`;
              previewList.appendChild(more);
            }
          }
        }

        if (actionsWrap && res.speechSegments.length > 0) {
          actionsWrap.hidden = false;
        }
        toast(`Análise concluída: ${res.silences.length} pausas encontradas (${res.totalSilenceDuration.toFixed(1)}s economizados)`);
      } catch (err) {
        console.error('Erro na análise de silêncio:', err);
        toast('Erro ao analisar silêncio acústico.');
      } finally {
        btnAnalyze.disabled = false;
        btnAnalyze.textContent = '🔍 Analisar Pausas no Clipe Selecionado';
      }
    };
  }

  if (btnApplyCut) {
    btnApplyCut.onclick = async () => {
      if (!currentAnalysis || !currentAnalysis.speechSegments || currentAnalysis.speechSegments.length === 0) {
        toast('Faça a análise primeiro para detectar os blocos de fala.');
        return;
      }
      if (!targetMediaItem) targetMediaItem = getTargetItem();
      if (!targetMediaItem) return;

      const isClip = state.clips.some(c => c.id === targetMediaItem.id);
      const isAudio = state.audios.some(a => a.id === targetMediaItem.id);

      const res = await window.api.sliceClipSilence({
        baseClip: targetMediaItem,
        speechSegments: currentAnalysis.speechSegments,
        startPlayheadTime: targetMediaItem.start || 0
      });

      if (!res || !res.ok || !res.clips || res.clips.length === 0) {
        toast('Erro ao fatiar clipe na timeline.');
        return;
      }

      if (isClip) {
        const originalIndex = state.clips.findIndex(c => c.id === targetMediaItem.id);
        if (originalIndex >= 0) {
          state.clips.splice(originalIndex, 1, ...res.clips);
          // Ripple delete: reajusta starts dos clipes subsequentes para encostar sem lacunas
          const { starts } = layout();
          state.clips.forEach((c, idx) => {
            if (starts[idx] !== undefined) c.start = starts[idx];
          });
        }
      } else if (isAudio) {
        const originalIndex = state.audios.findIndex(a => a.id === targetMediaItem.id);
        if (originalIndex >= 0) {
          state.audios.splice(originalIndex, 1, ...res.clips);
        }
      }

      renderTimeline();
      renderPreview();
      toast(`✂️ Silêncios removidos! ${res.clips.length} partes preservadas com Ripple Delete.`);
      closeModal();
    };
  }

  if (btnExportFile) {
    btnExportFile.onclick = async () => {
      if (!targetMediaItem || !targetMediaItem.path) return;
      btnExportFile.disabled = true;
      btnExportFile.textContent = '⏳ Exportando arquivo sem silêncio...';
      try {
        const noiseThreshold = noiseSelect ? noiseSelect.value : '-35dB';
        const minDuration = minDurSelect ? parseFloat(minDurSelect.value) : 0.4;
        const padding = paddingSelect ? parseFloat(paddingSelect.value) : 0.06;

        const res = await window.api.removeSilenceFile({
          inputPath: targetMediaItem.path,
          noiseThreshold,
          minDuration,
          padding
        });

        if (res && res.ok && res.media) {
          state.media.push(res.media);
          renderMediaList();
          toast(`💾 Novo arquivo sem silêncio salvo com sucesso (${res.duration}s)!`);
          closeModal();
        } else {
          toast('Falha ao exportar arquivo sem silêncio.');
        }
      } catch (err) {
        console.error('Erro ao exportar arquivo sem silêncio:', err);
        toast('Erro ao gerar arquivo sem silêncios.');
      } finally {
        btnExportFile.disabled = false;
        btnExportFile.textContent = '💾 Salvar Arquivo Físico Sem Pausas';
      }
    };
  }
}

function initBeatSync() {
  const modal = $('beatSyncModal');
  const btnOpen = $('btnBeatSync');
  const btnClose = $('btnCloseBeatSync');
  const intervalSelect = $('beatSyncIntervalSelect');
  const minDurSelect = $('beatSyncMinDurSelect');
  const statusText = $('beatSyncStatusText');
  const btnExecute = $('btnExecuteBeatSync');

  const getBeats = () => {
    if (!state.markers || state.markers.length === 0) return [];
    return state.markers
      .map(m => (typeof m === 'number' ? m : m.time))
      .filter(t => typeof t === 'number' && !isNaN(t) && t >= 0)
      .sort((a, b) => a - b);
  };

  const openModal = () => {
    if (modal) modal.hidden = false;
    const beats = getBeats();
    if (statusText) {
      if (beats.length === 0) {
        statusText.innerHTML = '⚠️ Nenhuma batida detectada na timeline.<br><small>Clique no botão <strong>🥁 BeatMarks</strong> da timeline para detectar as batidas da música primeiro.</small>';
        if (btnExecute) btnExecute.disabled = true;
      } else {
        statusText.innerHTML = `✅ <strong>${beats.length} batidas musicais</strong> detectadas na timeline.<br><small>Pronto para alinhar ${state.clips?.length || 0} clipes de vídeo ao ritmo.</small>`;
        if (btnExecute) btnExecute.disabled = false;
      }
    }
  };

  const closeModal = () => {
    if (modal) modal.hidden = true;
  };

  if (btnOpen) btnOpen.onclick = openModal;
  if (btnClose) btnClose.onclick = closeModal;
  if (modal) {
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  }

  if (btnExecute) {
    btnExecute.onclick = async () => {
      const beats = getBeats();
      if (beats.length === 0) {
        toast('Detecte batidas musicais na timeline antes de sincronizar.');
        return;
      }
      if (!state.clips || state.clips.length === 0) {
        toast('Adicione clipes de vídeo à timeline para sincronizar ao ritmo.');
        return;
      }

      const beatInterval = intervalSelect ? parseInt(intervalSelect.value) || 1 : 1;
      const minClipDuration = minDurSelect ? parseFloat(minDurSelect.value) || 0.5 : 0.5;

      const res = await window.api.alignClipsToBeats({
        clips: state.clips,
        beats,
        beatInterval,
        minClipDuration,
        timelineStartOffset: 0
      });

      if (res && res.ok && res.alignedClips) {
        state.clips = res.alignedClips;
        renderTimeline();
        renderPreview();
        toast(`🎵 ${res.rhythmSummary || 'Clipes sincronizados ao ritmo da música!'}`);
        closeModal();
      } else {
        toast('Erro ao sincronizar clipes com as batidas: ' + (res?.error || ''));
      }
    };
  }
}

initSilenceDetector();
initBeatSync();


