const fs = require('fs');
const pathMod = require('path');
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
    const trim = (c.isImage ? '' : `trim=start=${c.in}:end=${c.in + c.duration * speed},setpts=(PTS-STARTPTS)/${speed},`)
      + (c.isImage ? 'setpts=PTS-STARTPTS,' : '');

    let inLabel = `[${i}:v]`;
    const preFilters = [];
    if (fillMode === 'blur') {
      f.push(`[${i}:v]${trim}split=2[raw_bg_${i}][raw_fg_${i}]`);
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
    if (!isVideoVisible) postFilters.push('drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill');

    const allFilters = [...preFilters, ...postFilters];
    f.push(`${inLabel}${allFilters.join(',')}[v${i}]`);
    if (c.hasAudio && !c.isImage && !isVideoMuted) {
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
  const audios = isAudioMuted ? [] : (project.audios || []);
  let aOut = 'ac0';
  if (audios.length) {
    audios.forEach((a, j) => {
      const idx = clips.length + j; args.push('-i', a.path);
      const ms = Math.round(a.start * 1000);
      let af = `atrim=start=${a.in || 0}:end=${(a.in || 0) + a.duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}`;
      if (a.fadeIn) af += `,afade=t=in:st=0:d=${a.fadeIn}`;
      if (a.fadeOut) af += `,afade=t=out:st=${Math.max(0, a.duration - a.fadeOut)}:d=${a.fadeOut}`;
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
    let alphaExpr = `aa=${o.opacity ?? 1}`;
    if (anim === 'fade') {
      alphaExpr = `aa='if(lt(t\\,${o.start}+0.4)\\,(t-${o.start})/0.4*${o.opacity ?? 1}\\,if(gt(t\\,${o.start + o.duration}-0.4)\\,(${o.start + o.duration}-t)/0.4*${o.opacity ?? 1}\\,${o.opacity ?? 1}))'`;
    }
    f.push(`[${idx}:v]${trim}setpts=PTS-STARTPTS+${o.start}/TB,scale=${Math.round(W * o.scale / 100 / 2) * 2}:-2,${flip}${rot}${ck}format=yuva420p,colorchannelmixer=${alphaExpr}[ov${k}]`);

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

    f.push(`[${last}][ov${k}]overlay=x='(W-w)*${ex}':y='(H-h)*${ey}':enable='between(t,${o.start},${o.start + o.duration})':eof_action=pass[o${k}]`);
    last = `o${k}`;
  });
  const texts = isTextVisible ? (project.texts || []) : [];
  texts.forEach((t, i) => {
    const fs0 = t.fontSize || t.size || 48;
    const fontFile = fontPath(t.font, t.bold !== false);
    const bw = t.outline ?? 2;
    const anim = t.anim || (t.fade ? 'fade' : 'none');
    let alpha = '';
    let yExpr = `(h-text_h)*${t.py ?? 0.88}`;
    let fsExpr = String(Math.round(fs0 * Math.min(W, H) / 720));

    if (anim === 'fade') {
      alpha = `:alpha='if(lt(t,${t.start}+0.3),(t-${t.start})/0.3,if(gt(t,${t.start + t.duration}-0.3),(${t.start + t.duration}-t)/0.3,1))'`;
    } else if (anim === 'slide') {
      alpha = `:alpha='if(lt(t,${t.start}+0.25),(t-${t.start})/0.25,1)'`;
      const slideDist = Math.round(35 * Math.min(W, H) / 720);
      yExpr = `if(lt(t\\,${t.start}+0.3)\\,(h-text_h)*${t.py ?? 0.88}+(1-(t-${t.start})/0.3)*${slideDist}\\,(h-text_h)*${t.py ?? 0.88})`;
    } else if (anim === 'pop') {
      alpha = `:alpha='if(lt(t,${t.start}+0.2),(t-${t.start})/0.2,1)'`;
      const baseFs = Math.round(fs0 * Math.min(W, H) / 720);
      fsExpr = `if(lt(t\\,${t.start}+0.25)\\,${baseFs}*(0.6+0.4*(t-${t.start})/0.25)\\,${baseFs})`;
    }

    const box = t.box ? `:box=1:boxcolor=${(t.boxColor || '#000000').replace('#', '0x')}@${t.boxOpacity ?? 0.6}:boxborderw=${Math.round(14 * Math.min(W, H) / 720)}` : '';
    f.push(`[${last}]drawtext=text='${esc(t.text)}'${fontFile ? `:fontfile='${fontFile}'` : ''}:fontcolor=${t.color || 'white'}:fontsize='${fsExpr}':x=(w-text_w)*${t.px ?? 0.5}:y='${yExpr}':borderw=${Math.round(bw * Math.min(W, H) / 720)}:bordercolor=black${box}${alpha}:enable='between(t,${t.start},${t.start + t.duration})'[t${i}]`);
    last = `t${i}`;
  });
  args.push('-filter_complex', f.join(';'), '-map', `[${last}]`, '-map', `[${aOut}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-y', outPath);
  return { args };
}

module.exports = { buildFfmpeg };
