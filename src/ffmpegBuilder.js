const fs = require('fs');
const os = require('os');
const pathMod = require('path');
const { buildColorGradingFilter, buildLutFilter, buildFfmpegMaskFilter, BLEND_MODES } = require('./visualEffects');
const FONTS = {
  'Arial': ['arial.ttf', 'arialbd.ttf'], 'Impact': ['impact.ttf', 'impact.ttf'], 'Segoe UI': ['segoeui.ttf', 'segoeuib.ttf'],
  'Comic Sans MS': ['comic.ttf', 'comicbd.ttf'], 'Times New Roman': ['times.ttf', 'timesbd.ttf'], 'Courier New': ['cour.ttf', 'courbd.ttf']
};
// Caminho escapado da fonte do Windows para o drawtext (ou null se não existir).
function fontPath(name, bold) {
  const pair = FONTS[name || 'Arial'] || FONTS.Arial;
  const p = pathMod.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', pair[bold ? 1 : 0]);
  return fs.existsSync(p) ? p.replace(/\\/g, '/').replace(/:/g, '\\:') : null;
}
const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019").replace(/%/g, '\\\\\\%');

const PRESETS = {
  sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
  vintage: 'curves=preset=vintage',
  warm: 'colorbalance=rs=.15:gs=.05:bs=-.15',
  cool: 'colorbalance=rs=-.15:bs=.15',
  cinematic: 'eq=contrast=1.15:saturation=0.9,colorbalance=rs=-.05:bs=.08:rh=.08:bh=-.05',
  vivid: 'eq=saturation=1.6:contrast=1.1'
};

const SPEED_CURVES = {
  hero: [
    { start: 0, end: 0.25, speed: 2.2 },
    { start: 0.25, end: 0.75, speed: 0.4 },
    { start: 0.75, end: 1.0, speed: 2.2 }
  ],
  bullet: [
    { start: 0, end: 0.2, speed: 3.0 },
    { start: 0.2, end: 0.7, speed: 0.35 },
    { start: 0.7, end: 1.0, speed: 1.0 }
  ],
  montage: [
    { start: 0, end: 0.25, speed: 2.5 },
    { start: 0.25, end: 0.5, speed: 0.5 },
    { start: 0.5, end: 0.75, speed: 2.5 },
    { start: 0.75, end: 1.0, speed: 0.5 }
  ],
  flash_in: [
    { start: 0, end: 0.3, speed: 3.0 },
    { start: 0.3, end: 1.0, speed: 1.0 }
  ],
  flash_out: [
    { start: 0, end: 0.7, speed: 1.0 },
    { start: 0.7, end: 1.0, speed: 3.0 }
  ]
};

function buildAtempo(speed) {
  let s = speed;
  const parts = [];
  while (s > 2.0) {
    parts.push('atempo=2.0');
    s /= 2.0;
  }
  while (s < 0.5) {
    parts.push('atempo=0.5');
    s /= 0.5;
  }
  parts.push(`atempo=${Number(s.toFixed(4))}`);
  return parts.join(',');
}

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

function getCurveSegments(c) {
  let curve = null;
  if (c.speedCurve === 'custom') {
    if (c.customSegments && c.customSegments.length) {
      curve = c.customSegments;
    } else if (c.customCurvePoints && c.customCurvePoints.length >= 2) {
      curve = pointsToSegments(c.customCurvePoints);
    } else {
      curve = [
        { start: 0, end: 0.35, speed: 2.5 },
        { start: 0.35, end: 0.65, speed: 0.4 },
        { start: 0.65, end: 1.0, speed: 1.0 }
      ];
    }
  } else {
    curve = SPEED_CURVES[c.speedCurve];
  }
  if (!curve) return null;
  const srcDur = c.srcDurUsed || (c.duration * (c.speed || 1));
  let tlAcc = 0;
  return curve.map(seg => {
    const inStart = c.in + seg.start * srcDur;
    const inEnd = c.in + seg.end * srcDur;
    const tlDur = (inEnd - inStart) / seg.speed;
    const sObj = { ...seg, inStart, inEnd, tlDur, tlStart: tlAcc, tlEnd: tlAcc + tlDur };
    tlAcc += tlDur;
    return sObj;
  });
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

function buildCodecArgs(settings, outPath, passNum = 0, passLogPrefix = null) {
  const S = settings || {};
  const fmt = (S.format || 'mp4').toLowerCase();
  const bitrateMode = S.bitrateMode || 'crf';
  const bitrate = Number(S.bitrate) || 8000;
  const crf = S.crf ?? 18;
  const colorProfile = S.colorProfile || 'bt709';

  const vArgs = [];
  const aArgs = [];

  // 1. Configuração de Vídeo por Formato
  if (fmt === 'webm') {
    vArgs.push('-c:v', 'libvpx-vp9');
    if (colorProfile === 'bt2020') {
      vArgs.push('-pix_fmt', 'yuv420p10le');
    } else {
      vArgs.push('-pix_fmt', 'yuva420p', '-auto-alt-ref', '0');
    }
    aArgs.push('-c:a', 'libopus', '-b:a', '128k');
  } else if (fmt === 'prores422') {
    vArgs.push('-c:v', 'prores_ks', '-profile:v', '2', '-vendor', 'apl0');
    vArgs.push('-pix_fmt', 'yuv422p10le');
    aArgs.push('-c:a', 'pcm_s16le');
  } else if (fmt === 'prores4444') {
    vArgs.push('-c:v', 'prores_ks', '-profile:v', '4', '-vendor', 'apl0');
    vArgs.push('-pix_fmt', 'yuva444p10le');
    aArgs.push('-c:a', 'pcm_s16le');
  } else {
    // mp4 (H.264 / HEVC via GPU ou libx264)
    if (S.gpuEncoder && Array.isArray(S.gpuEncoder.codecArgs) && S.gpuEncoder.codecArgs.length) {
      vArgs.push(...S.gpuEncoder.codecArgs);
    } else {
      vArgs.push('-c:v', 'libx264', '-preset', 'medium');
    }
    if (colorProfile === 'bt2020') {
      vArgs.push('-pix_fmt', 'yuv420p10le');
    } else {
      vArgs.push('-pix_fmt', 'yuv420p');
    }
    aArgs.push('-c:a', 'aac', '-b:a', '192k');
  }

  // 2. Perfis de Cor / HDR
  if (colorProfile === 'bt2020') {
    vArgs.push('-colorspace', 'bt2020nc', '-color_primaries', 'bt2020', '-color_trc', 'smpte2084');
  } else if (colorProfile === 'bt709') {
    vArgs.push('-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709');
  }

  // 3. Taxa de Bits / Modo de Codificação
  if (fmt.startsWith('prores')) {
    // ProRes tem bitrate controlado internamente pelo perfil de quantização
  } else if (bitrateMode === 'cbr') {
    vArgs.push('-b:v', `${bitrate}k`, '-minrate', `${bitrate}k`, '-maxrate', `${bitrate}k`, '-bufsize', `${bitrate * 2}k`);
  } else if (bitrateMode === 'vbr2pass') {
    vArgs.push('-b:v', `${bitrate}k`);
    if (passNum === 1) {
      vArgs.push('-pass', '1');
      if (passLogPrefix) vArgs.push('-passlogfile', passLogPrefix);
    } else if (passNum === 2) {
      vArgs.push('-pass', '2');
      if (passLogPrefix) vArgs.push('-passlogfile', passLogPrefix);
    }
  } else {
    // Modo CRF (Qualidade Constante)
    if (fmt === 'webm') {
      vArgs.push('-crf', String(crf), '-b:v', '0');
    } else if (!S.gpuEncoder || !S.gpuEncoder.isGpu) {
      vArgs.push('-crf', String(crf));
    }
  }

  return { vArgs, aArgs };
}

// Trilha principal: clips em sequência. Textos: sobreposição por tempo.
function buildFfmpeg(project, outPath) {
  const S = project.settings || {};
  const [ra, rb] = (S.aspect || '16:9').split(':').map(Number), r = ra / rb, res = S.height || 720;
  const ev = (n) => Math.round(n / 2) * 2;
  const H = r >= 1 ? ev(res) : ev(res / r), W = r >= 1 ? ev(res * r) : ev(res), FPS = S.fps || 30, CRF = S.crf || 18;
  const tracks = project.tracks || {};
  const isVideoVisible = tracks.video?.visible !== false;
  const isVideoMuted = !!tracks.video?.mute || !!tracks.audio?.solo;
  const isOverlayVisible = tracks.overlay?.visible !== false;
  const isTextVisible = tracks.text?.visible !== false;
  const isAudioMuted = !!tracks.audio?.mute;

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
    const fillMode = fl.fillMode || 'fit';
    const curveSegs = !c.isImage && c.speedCurve && SPEED_CURVES[c.speedCurve] ? getCurveSegments(c) : null;

    let inLabel = `[${i}:v]`;
    let audioLabel = `[${i}:a]`;
    let trim = '';

    if (curveSegs) {
      const hasAudioTrack = c.hasAudio && !c.isImage && !isVideoMuted;
      curveSegs.forEach((seg, k) => {
        f.push(`[${i}:v]trim=start=${seg.inStart.toFixed(4)}:end=${seg.inEnd.toFixed(4)},setpts=(PTS-STARTPTS)/${seg.speed}[v_${i}_${k}]`);
        if (hasAudioTrack) {
          f.push(`[${i}:a]atrim=start=${seg.inStart.toFixed(4)}:end=${seg.inEnd.toFixed(4)},asetpts=PTS-STARTPTS,${buildAtempo(seg.speed)}[a_${i}_${k}]`);
        }
      });
      if (hasAudioTrack) {
        const segInputs = curveSegs.map((_, k) => `[v_${i}_${k}][a_${i}_${k}]`).join('');
        f.push(`${segInputs}concat=n=${curveSegs.length}:v=1:a=1[v_raw_${i}][a_raw_${i}]`);
        audioLabel = `[a_raw_${i}]`;
      } else {
        const segInputs = curveSegs.map((_, k) => `[v_${i}_${k}]`).join('');
        f.push(`${segInputs}concat=n=${curveSegs.length}:v=1:a=0[v_raw_${i}]`);
      }
      inLabel = `[v_raw_${i}]`;
      trim = '';
    } else {
      trim = (c.isImage ? '' : `trim=start=${c.in}:end=${c.in + c.duration * speed},setpts=(PTS-STARTPTS)/${speed},`)
        + (c.isImage ? 'setpts=PTS-STARTPTS,' : '');
    }

    const preFilters = [];
    if (fillMode === 'blur') {
      f.push(`${inLabel}${trim}split=2[raw_bg_${i}][raw_fg_${i}]`);
      f.push(`[raw_bg_${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=30,eq=brightness=-0.15,setsar=1,fps=${FPS}[bg_${i}]`);
      f.push(`[raw_fg_${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1,fps=${FPS}[fg_${i}]`);
      f.push(`[bg_${i}][fg_${i}]overlay=(W-w)/2:(H-h)/2[c_base_${i}]`);
      inLabel = `[c_base_${i}]`;
    } else if (fillMode === 'crop') {
      preFilters.push(trim + `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}`);
    } else {
      preFilters.push(trim + `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}`);
    }

    const postFilters = [];
    if ((fl.zoom || 1) > 1) postFilters.push(`scale=${Math.round(W * fl.zoom)}:${Math.round(H * fl.zoom)},crop=${W}:${H}`);
    if (fl.hflip) postFilters.push('hflip');
    if (fl.vflip) postFilters.push('vflip');
    if (fl.rotate === 180) postFilters.push('hflip,vflip');
    if (fl.rotate === 90) postFilters.push(`transpose=1,scale=${W}:${H}`);
    else if (fl.rotate === 270) postFilters.push(`transpose=2,scale=${W}:${H}`);
    postFilters.push(`eq=brightness=${(fl.brightness || 0) / 100}:contrast=${1 + (fl.contrast || 0) / 100}:saturation=${1 + (fl.saturation || 0) / 100}`);
    if (PRESETS[fl.preset]) postFilters.push(PRESETS[fl.preset]);
    if (fl.blur) postFilters.push(`gblur=sigma=${fl.blur}`);
    if (fl.grayscale) postFilters.push('hue=s=0');
    if (fl.vignette) postFilters.push('vignette=PI/4');
    if (fl.fade) postFilters.push(`fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, c.duration - 0.5)}:d=0.5`);
    if (fl.smoothSlowMo && speed < 1) postFilters.push(`minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir`);
    if (fl.beauty) {
      const sm = fl.beautySmooth ?? 50;
      const gw = fl.beautyGlow ?? 30;
      const lr = (1.5 + sm * 0.02).toFixed(1);
      const lt = Math.round(4 + sm * 0.08);
      const bGlow = (gw * 0.0008).toFixed(3);
      postFilters.push(`smartblur=lr=${lr}:ls=0.6:lt=${lt},unsharp=5:5:0.5:5:5:0.0,eq=brightness=${bGlow}:contrast=1.03:saturation=1.05`);
    }
    // Fase 11: Color Grading Fino (Temperatura, Tint, Highlights, Shadows)
    if (c.colorGrading) {
      const cgf = buildColorGradingFilter(c.colorGrading);
      if (cgf) postFilters.push(cgf);
    }
    // Fase 11: 3D LUTs (.cube / .3dl)
    if (c.lutPath && fs.existsSync(c.lutPath)) {
      const lutF = buildLutFilter(c.lutPath);
      if (lutF) postFilters.push(lutF);
    }
    // Fase 11: Efeitos de Estilização (Glitch, Film Grain, Camera Shake, Bloom)
    if (c.effects && Array.isArray(c.effects)) {
      c.effects.forEach(eff => {
        const effKey = typeof eff === 'string' ? eff : eff.type;
        const effIntensity = (typeof eff === 'object' && eff.intensity) ? eff.intensity : 1;
        if (effKey === 'film_grain') {
          postFilters.push(`noise=alls=${Math.round(15 * effIntensity)}:allf=t+u`);
        } else if (effKey === 'camera_shake') {
          const amp = (0.015 * effIntensity).toFixed(4);
          postFilters.push(`crop=w='in_w*(1-${amp})':h='in_h*(1-${amp})':x='in_w*${amp}*abs(sin(2*PI*3*t))':y='in_h*${amp}*abs(cos(2*PI*4*t))',scale=${W}:${H}`);
        } else if (effKey === 'bloom') {
          postFilters.push(`unsharp=7:7:-1.5:7:7:0.0,eq=brightness=0.06:contrast=1.1`);
        }
      });
    }
    // Fase 11: Máscara Geométrica de Camada no Clipe
    if (c.mask && c.mask.type && c.mask.type !== 'none') {
      const maskFilter = buildFfmpegMaskFilter(c.mask, W, H);
      if (maskFilter) postFilters.push(maskFilter);
    }
    if (!isVideoVisible) postFilters.push('drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill');

    const allFilters = [...preFilters, ...postFilters];
    f.push(`${inLabel}${allFilters.join(',')}[v${i}]`);
    if (c.hasAudio && !c.isImage && !isVideoMuted) {
      if (curveSegs) {
        let af = `volume=${c.volume ?? 1}`;
        if (fl.denoise) af += ',afftdn=nf=-25';
        if (fl.loudnorm) af += ',loudnorm=I=-14:TP=-1.5:LRA=11';
        af += ',aresample=44100,aformat=channel_layouts=stereo';
        f.push(`${audioLabel}${af}[a${i}]`);
      } else {
        const tempo = speed !== 1 ? `,${buildAtempo(speed)}` : '';
        let af = `atrim=start=${c.in}:end=${c.in + c.duration * speed},asetpts=PTS-STARTPTS${tempo},volume=${c.volume ?? 1}`;
        if (fl.denoise) af += ',afftdn=nf=-25';
        if (fl.loudnorm) af += ',loudnorm=I=-14:TP=-1.5:LRA=11';
        af += ',aresample=44100,aformat=channel_layouts=stereo';
        f.push(`[${i}:a]${af}[a${i}]`);
      }
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
  const audios = isAudioMuted ? [] : (project.audios || []);
  let aOut = 'ac0';
  if (audios.length) {
    audios.forEach((a, j) => {
      const idx = clips.length + j; args.push('-i', a.path);
      const ms = Math.round(a.start * 1000);
      let af = `atrim=start=${a.in || 0}:end=${(a.in || 0) + a.duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}`;
      if (a.fadeIn) af += `,afade=t=in:st=0:d=${a.fadeIn}`;
      if (a.fadeOut) af += `,afade=t=out:st=${Math.max(0, a.duration - a.fadeOut)}:d=${a.fadeOut}`;
      if (a.denoise) af += ',afftdn=nf=-25';
      if (a.loudnorm) af += ',loudnorm=I=-14:TP=-1.5:LRA=11';
      af += `,aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}`;
      f.push(`[${idx}:a]${af}[m${j}]`);
    });
    const n = audios.length + 1;
    f.push(`[ac0]${audios.map((_, j) => `[m${j}]`).join('')}amix=inputs=${n}:duration=first:dropout_transition=0,volume=${n}[acm]`);
    aOut = 'acm';
  }
  let last = 'vc';
  const overlays = isOverlayVisible ? (project.overlays || []) : [];
  overlays.forEach((o, k) => {
    const idx = clips.length + audios.length + k;
    if (o.isImage) args.push('-loop', '1', '-t', String(o.duration), '-i', o.path); else args.push('-i', o.path);
    const trim = o.isImage ? '' : `trim=start=${o.in || 0}:end=${(o.in || 0) + o.duration},`;
    const ck = o.chroma ? `colorkey=color=0x${(o.chromaColor || '#00ff00').slice(1)}:similarity=${o.chromaSim ?? 0.3}:blend=0.1,` : '';
    const flip = o.hflip ? 'hflip,' : '';
    const rot = o.rotate ? `rotate=${o.rotate}*PI/180:c=none:ow='rotw(${o.rotate}*PI/180)':oh='roth(${o.rotate}*PI/180)',` : '';
    const anim = o.anim || 'none';
    let fadeFilter = '';
    if (anim === 'fade') {
      const fDur = Math.min(0.4, o.duration / 2);
      fadeFilter = `,fade=t=in:st=0:d=${fDur.toFixed(3)}:alpha=1,fade=t=out:st=${Math.max(0, o.duration - fDur).toFixed(3)}:d=${fDur.toFixed(3)}:alpha=1`;
    }
    let borderFilter = '';
    if (o.borderWidth && o.borderWidth > 0) {
      const bw = Math.min(25, Math.max(1, Math.round(o.borderWidth)));
      const bColor = (o.borderColor || '#ffffff').replace('#', '');
      borderFilter = `pad=w=iw+${bw * 2}:h=ih+${bw * 2}:x=${bw}:y=${bw}:color=0x${bColor},`;
    } else if (o.glow) {
      const gw = Math.min(20, Math.max(2, Math.round((o.glowBlur || 15) / 3)));
      const gColor = (o.glowColor || '#00e5c3').replace('#', '');
      borderFilter = `pad=w=iw+${gw * 2}:h=ih+${gw * 2}:x=${gw}:y=${gw}:color=0x${gColor},`;
    }
    const targetW = Math.round(W * o.scale / 100 / 2) * 2;
    let maskF = '';
    if (o.mask && o.mask.type && o.mask.type !== 'none') {
      const mf = buildFfmpegMaskFilter(o.mask, targetW, Math.round(H * o.scale / 100 / 2) * 2);
      if (mf) maskF = `,${mf}`;
    }
    f.push(`[${idx}:v]${trim}scale=${targetW}:-2,${flip}${rot}${ck}${borderFilter}format=yuva420p,colorchannelmixer=aa=${o.opacity ?? 1}${fadeFilter}${maskF},setpts=PTS-STARTPTS+${o.start}/TB[ov${k}]`);

    let pr = o.motion ? `min(1\\,max(0\\,(t-${o.start})/${o.duration}))` : '0';
    if (o.motion && o.easing === 'smooth') {
      pr = `(3*pow(${pr}\\,2)-2*pow(${pr}\\,3))`;
    }
    let ex = o.motion ? `(${o.x}+(${o.x2 ?? o.x}-${o.x})*${pr})` : `${o.x}`;
    let ey = o.motion ? `(${o.y}+(${o.y2 ?? o.y}-${o.y})*${pr})` : `${o.y}`;

    if (anim === 'slide_left') {
      ex = `if(lt(t\\,${o.start}+0.4)\\,${ex}-(1-(t-${o.start})/0.4)*0.35\\,${ex})`;
    } else if (anim === 'slide_right') {
      ex = `if(lt(t\\,${o.start}+0.4)\\,${ex}+(1-(t-${o.start})/0.4)*0.35\\,${ex})`;
    } else if (anim === 'float') {
      ey = `(${ey}+sin((t-${o.start})*PI)*0.03)`;
    }

    const bMode = o.blendMode && BLEND_MODES[o.blendMode]?.ffmpegMode;
    if (bMode) {
      f.push(`[ov${k}]pad=${W}:${H}:'(ow-iw)*${ex}':'(oh-ih)*${ey}':color=black@0[ov_pad_${k}]`);
      f.push(`[${last}][ov_pad_${k}]blend=all_mode=${bMode}:enable='between(t,${o.start},${o.start + o.duration})'[o${k}]`);
    } else {
      f.push(`[${last}][ov${k}]overlay=x='(W-w)*${ex}':y='(H-h)*${ey}':enable='between(t,${o.start},${o.start + o.duration})':eof_action=pass[o${k}]`);
    }
    last = `o${k}`;
  });
  const texts = isTextVisible ? (project.texts || []) : [];
  texts.forEach((t, i) => {
    const fs0 = t.fontSize || t.size || 48;
    const fontFile = fontPath(t.font, t.bold !== false);
    const bw = t.outline ?? 2;
    const anim = t.anim || (t.fade ? 'fade' : 'none');
    const hlColor = t.highlightColor || '#ffeb3b';
    const box = t.box ? `:box=1:boxcolor=${(t.boxColor || '#000000').replace('#', '0x')}@${t.boxOpacity ?? 0.6}:boxborderw=${Math.round(14 * Math.min(W, H) / 720)}` : '';
    const baseFs = Math.round(fs0 * Math.min(W, H) / 720);
    const yExpr = `(h-text_h)*${t.py ?? 0.88}`;
    const xExpr = `(w-text_w)*${t.px ?? 0.5}`;

    if (anim === 'single_word') {
      const words = getCaptionWords(t);
      const singleFs = Math.round(baseFs * 1.25);
      words.forEach((w, wi) => {
        f.push(`[${last}]drawtext=text='${esc(w.word)}'${fontFile ? `:fontfile='${fontFile}'` : ''}:fontcolor=${hlColor}:fontsize='${singleFs}':x=${xExpr}:y='${yExpr}':borderw=${Math.round(bw * Math.min(W, H) / 720)}:bordercolor=black${box}:enable='between(t,${w.start.toFixed(3)},${w.end.toFixed(3)})'[t_${i}_sw${wi}]`);
        last = `t_${i}_sw${wi}`;
      });
      return;
    }

    if (anim === 'word_by_word') {
      const words = getCaptionWords(t);
      words.forEach((w, wi) => {
        const textAccum = words.slice(0, wi + 1).map(x => x.word).join(' ');
        const inT = w.start.toFixed(3);
        const outT = (wi === words.length - 1 ? (t.start + t.duration) : words[wi + 1].start).toFixed(3);
        f.push(`[${last}]drawtext=text='${esc(textAccum)}'${fontFile ? `:fontfile='${fontFile}'` : ''}:fontcolor=${t.color || 'white'}:fontsize='${baseFs}':x=${xExpr}:y='${yExpr}':borderw=${Math.round(bw * Math.min(W, H) / 720)}:bordercolor=black${box}:enable='between(t,${inT},${outT})'[t_${i}_wbw${wi}]`);
        last = `t_${i}_wbw${wi}`;
      });
      return;
    }

    if (anim === 'karaoke') {
      const words = getCaptionWords(t);
      words.forEach((w, wi) => {
        const parts = words.map((x, idx) => idx === wi ? `[${x.word.toUpperCase()}]` : x.word).join(' ');
        const inT = w.start.toFixed(3);
        const outT = (wi === words.length - 1 ? (t.start + t.duration) : words[wi + 1].start).toFixed(3);
        f.push(`[${last}]drawtext=text='${esc(parts)}'${fontFile ? `:fontfile='${fontFile}'` : ''}:fontcolor=${hlColor}:fontsize='${baseFs}':x=${xExpr}:y='${yExpr}':borderw=${Math.round(bw * Math.min(W, H) / 720)}:bordercolor=black${box}:enable='between(t,${inT},${outT})'[t_${i}_k${wi}]`);
        last = `t_${i}_k${wi}`;
      });
      return;
    }

    let alpha = '';
    let animYExpr = yExpr;
    let fsExpr = String(baseFs);

    if (anim === 'fade') {
      alpha = `:alpha='if(lt(t,${t.start}+0.3),(t-${t.start})/0.3,if(gt(t,${t.start + t.duration}-0.3),(${t.start + t.duration}-t)/0.3,1))'`;
    } else if (anim === 'slide') {
      alpha = `:alpha='if(lt(t,${t.start}+0.25),(t-${t.start})/0.25,1)'`;
      const slideDist = Math.round(35 * Math.min(W, H) / 720);
      animYExpr = `if(lt(t\\,${t.start}+0.3)\\,(h-text_h)*${t.py ?? 0.88}+(1-(t-${t.start})/0.3)*${slideDist}\\,(h-text_h)*${t.py ?? 0.88})`;
    } else if (anim === 'pop') {
      alpha = `:alpha='if(lt(t,${t.start}+0.2),(t-${t.start})/0.2,1)'`;
      fsExpr = `if(lt(t\\,${t.start}+0.25)\\,${baseFs}*(0.6+0.4*(t-${t.start})/0.25)\\,${baseFs})`;
    }

    f.push(`[${last}]drawtext=text='${esc(t.text)}'${fontFile ? `:fontfile='${fontFile}'` : ''}:fontcolor=${t.color || 'white'}:fontsize='${fsExpr}':x=${xExpr}:y='${animYExpr}':borderw=${Math.round(bw * Math.min(W, H) / 720)}:bordercolor=black${box}${alpha}:enable='between(t,${t.start},${t.start + t.duration})'[t${i}]`);
    last = `t${i}`;
  });
  if (S.bitrateMode === 'vbr2pass' && !String(S.format || '').startsWith('prores')) {
    const tmpDir = os.tmpdir();
    const passPrefix = pathMod.join(tmpDir, `lccut_pass_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const { vArgs: v1 } = buildCodecArgs(S, null, 1, passPrefix);
    const nullDev = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const pass1Args = [...args, '-filter_complex', f.join(';'), '-map', `[${last}]`, ...v1, '-an', '-f', 'null', '-y', nullDev];
    const { vArgs: v2, aArgs } = buildCodecArgs(S, outPath, 2, passPrefix);
    const pass2Args = [...args, '-filter_complex', f.join(';'), '-map', `[${last}]`, '-map', `[${aOut}]`, ...v2, ...aArgs, '-y', outPath];
    return {
      isTwoPass: true,
      passLogPrefix: passPrefix,
      pass1Args,
      pass2Args,
      args: pass2Args
    };
  }

  const { vArgs, aArgs } = buildCodecArgs(S, outPath);
  args.push('-filter_complex', f.join(';'), '-map', `[${last}]`, '-map', `[${aOut}]`,
    ...vArgs, ...aArgs, '-y', outPath);
  return { args };
}

// Exportação independente de áudio direto da timeline (.wav, .mp3, .aac)
function buildAudioOnlyFfmpeg(project, outPath) {
  const tracks = project.tracks || {};
  const isVideoMuted = !!tracks.video?.mute || !!tracks.audio?.solo;
  const isAudioMuted = !!tracks.audio?.mute;
  const clips = project.clips || [];
  const audios = isAudioMuted ? [] : (project.audios || []);
  const args = [];
  const f = [];

  // 1. Carregar arquivos de mídia dos clipes de vídeo
  clips.forEach((c) => {
    if (c.isImage) args.push('-loop', '1', '-t', String(c.duration), '-i', c.path);
    else args.push('-i', c.path);
  });

  let concatIn = '';
  clips.forEach((c, i) => {
    const fl = c.filters || {};
    const speed = c.speed || 1;
    const curveSegs = !c.isImage && c.speedCurve && SPEED_CURVES[c.speedCurve] ? getCurveSegments(c) : null;
    const hasAudioTrack = c.hasAudio && !c.isImage && !isVideoMuted;

    if (hasAudioTrack) {
      if (curveSegs) {
        curveSegs.forEach((seg, k) => {
          f.push(`[${i}:a]atrim=start=${seg.inStart.toFixed(4)}:end=${seg.inEnd.toFixed(4)},asetpts=PTS-STARTPTS,${buildAtempo(seg.speed)}[a_${i}_${k}]`);
        });
        const segInputs = curveSegs.map((_, k) => `[a_${i}_${k}]`).join('');
        let af = `volume=${c.volume ?? 1}`;
        if (fl.denoise) af += ',afftdn=nf=-25';
        if (fl.loudnorm) af += ',loudnorm=I=-14:TP=-1.5:LRA=11';
        af += ',aresample=44100,aformat=channel_layouts=stereo';
        f.push(`${segInputs}concat=n=${curveSegs.length}:v=0:a=1,${af}[a${i}]`);
      } else {
        const tempo = speed !== 1 ? `,${buildAtempo(speed)}` : '';
        let af = `atrim=start=${c.in}:end=${c.in + c.duration * speed},asetpts=PTS-STARTPTS${tempo},volume=${c.volume ?? 1}`;
        if (fl.denoise) af += ',afftdn=nf=-25';
        if (fl.loudnorm) af += ',loudnorm=I=-14:TP=-1.5:LRA=11';
        af += ',aresample=44100,aformat=channel_layouts=stereo';
        f.push(`[${i}:a]${af}[a${i}]`);
      }
    } else {
      f.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${c.duration}[a${i}]`);
    }
    concatIn += `[a${i}]`;
  });

  let baseAudioOut = 'ac0';
  if (clips.length > 0) {
    const anyT = clips.some(c => c.transition && c.transition !== 'none');
    if (!anyT || clips.length === 1) {
      f.push(`${concatIn}concat=n=${clips.length}:v=0:a=1[ac0]`);
    } else {
      let aP = 'a0', L = clips[0].duration;
      for (let i = 1; i < clips.length; i++) {
        const prev = clips[i - 1], cur = clips[i];
        const has = prev.transition && prev.transition !== 'none';
        const d = has ? Math.max(0.05, Math.min(0.5, prev.duration / 2, cur.duration / 2)) : 0.04;
        f.push(`[${aP}][a${i}]acrossfade=d=${d}[xa${i}]`);
        aP = `xa${i}`;
        L += cur.duration - d;
      }
      f.push(`[${aP}]anull[ac0]`);
    }
  }

  // 2. Trilha de áudio secundária
  if (audios.length > 0) {
    audios.forEach((a, j) => {
      const idx = clips.length + j;
      args.push('-i', a.path);
      const ms = Math.round(a.start * 1000);
      let af = `atrim=start=${a.in || 0}:end=${(a.in || 0) + a.duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}`;
      if (a.fadeIn) af += `,afade=t=in:st=0:d=${a.fadeIn}`;
      if (a.fadeOut) af += `,afade=t=out:st=${Math.max(0, a.duration - a.fadeOut)}:d=${a.fadeOut}`;
      if (a.denoise) af += ',afftdn=nf=-25';
      if (a.loudnorm) af += ',loudnorm=I=-14:TP=-1.5:LRA=11';
      af += `,aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}`;
      f.push(`[${idx}:a]${af}[m${j}]`);
    });

    if (clips.length > 0) {
      const n = audios.length + 1;
      f.push(`[ac0]${audios.map((_, j) => `[m${j}]`).join('')}amix=inputs=${n}:duration=longest:dropout_transition=0,volume=${n}[acm]`);
      baseAudioOut = 'acm';
    } else {
      if (audios.length === 1) {
        baseAudioOut = 'm0';
      } else {
        f.push(`${audios.map((_, j) => `[m${j}]`).join('')}amix=inputs=${audios.length}:duration=longest:dropout_transition=0,volume=${audios.length}[acm]`);
        baseAudioOut = 'acm';
      }
    }
  }

  if (clips.length === 0 && audios.length === 0) {
    f.push('anullsrc=r=44100:cl=stereo,atrim=duration=1[aempty]');
    baseAudioOut = 'aempty';
  }

  const ext = (pathMod.extname(outPath) || '').toLowerCase();
  const aCodecs = [];
  if (ext === '.wav') {
    aCodecs.push('-c:a', 'pcm_s16le');
  } else if (ext === '.mp3') {
    aCodecs.push('-c:a', 'libmp3lame', '-b:a', '320k');
  } else if (ext === '.aac' || ext === '.m4a') {
    aCodecs.push('-c:a', 'aac', '-b:a', '256k');
  } else {
    aCodecs.push('-c:a', 'pcm_s16le');
  }

  args.push('-filter_complex', f.join(';'), '-map', `[${baseAudioOut}]`, '-vn', ...aCodecs, '-y', outPath);
  return { args };
}

module.exports = { buildFfmpeg, buildCodecArgs, buildAudioOnlyFfmpeg, SPEED_CURVES, buildAtempo, getCurveSegments, getCaptionWords };
