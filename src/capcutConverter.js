/**
 * capcutConverter.js — Conversor bidirecional de projetos entre CapCut (draft_content.json) e LeccorCut
 */

function parseTimeUs(us) {
  if (typeof us !== 'number' || isNaN(us)) return 0;
  return Number((us / 1000000).toFixed(4));
}

function toTimeUs(seconds) {
  return Math.round((Number(seconds) || 0) * 1000000);
}

/**
 * Converte um draft_content.json do CapCut para o estado do projeto do LeccorCut
 * @param {object|string} draftData - Conteúdo do draft_content.json (objeto ou string JSON)
 * @returns {object} Estado do LeccorCut pronto para carregar na timeline
 */
function capcutToLeccor(draftData) {
  const data = typeof draftData === 'string' ? JSON.parse(draftData) : draftData;

  const videoMats = new Map((data.materials?.videos || []).map(v => [v.id, v]));
  const audioMats = new Map((data.materials?.audios || []).map(a => [a.id, a]));
  const textMats = new Map((data.materials?.texts || []).map(t => [t.id, t]));
  const speedMats = new Map((data.materials?.speeds || []).map(s => [s.id, s]));

  const mediaList = [];
  const mediaPathSet = new Set();

  function registerMedia(path, name, hasVideo, hasAudio) {
    if (!path || mediaPathSet.has(path)) return;
    mediaPathSet.add(path);
    mediaList.push({
      id: mediaList.length + 1,
      path: path.replace(/\\/g, '/'),
      name: name || path.split(/[\/\\]/).pop(),
      hasVideo: !!hasVideo,
      hasAudio: !!hasAudio
    });
  }

  // Coleta todas as mídias dos materiais
  for (const v of videoMats.values()) {
    if (v.path) registerMedia(v.path, v.material_name, true, true);
  }
  for (const a of audioMats.values()) {
    if (a.path) registerMedia(a.path, a.name, false, true);
  }

  const clips = [];
  const overlays = [];
  const audios = [];
  const texts = [];
  const markers = [];
  let nextId = 1;

  let isFirstVideoTrack = true;

  const tracks = data.tracks || [];
  for (const track of tracks) {
    const type = track.type || 'video';
    const segments = track.segments || [];

    if (type === 'video') {
      if (isFirstVideoTrack) {
        // Trilha principal de vídeo (clips)
        isFirstVideoTrack = false;
        for (const seg of segments) {
          const mat = videoMats.get(seg.material_id);
          const speedObj = speedMats.get(seg.speed_id) || {};
          const speed = seg.speed || speedObj.speed || 1;
          const targetDur = parseTimeUs(seg.target_timerange?.duration);
          const sourceIn = parseTimeUs(seg.source_timerange?.start);
          const matPath = mat?.path ? mat.path.replace(/\\/g, '/') : '';
          const name = mat?.material_name || matPath.split(/[\/\\]/).pop() || `Clipe ${nextId}`;

          clips.push({
            id: nextId++,
            path: matPath,
            name,
            in: sourceIn,
            duration: targetDur,
            max: mat?.duration ? parseTimeUs(mat.duration) : targetDur,
            speed: Number(speed.toFixed(2)),
            volume: typeof seg.volume === 'number' ? seg.volume : 1,
            hasVideo: true,
            hasAudio: true,
            isImage: !!mat?.type && mat.type === 'image'
          });
        }
      } else {
        // Trilhas secundárias de vídeo -> Sobreposições / PiP
        for (const seg of segments) {
          const mat = videoMats.get(seg.material_id);
          const speedObj = speedMats.get(seg.speed_id) || {};
          const speed = seg.speed || speedObj.speed || 1;
          const start = parseTimeUs(seg.target_timerange?.start);
          const targetDur = parseTimeUs(seg.target_timerange?.duration);
          const sourceIn = parseTimeUs(seg.source_timerange?.start);
          const matPath = mat?.path ? mat.path.replace(/\\/g, '/') : '';
          const name = mat?.material_name || matPath.split(/[\/\\]/).pop() || `Sobreposição ${nextId}`;

          overlays.push({
            id: nextId++,
            path: matPath,
            name,
            start,
            in: sourceIn,
            duration: targetDur,
            max: mat?.duration ? parseTimeUs(mat.duration) : targetDur,
            speed: Number(speed.toFixed(2)),
            volume: typeof seg.volume === 'number' ? seg.volume : 1,
            x: 0,
            y: 0,
            w: 40,
            h: 40
          });
        }
      }
    } else if (type === 'audio') {
      // Trilhas de áudio
      for (const seg of segments) {
        const mat = audioMats.get(seg.material_id);
        const speedObj = speedMats.get(seg.speed_id) || {};
        const speed = seg.speed || speedObj.speed || 1;
        const start = parseTimeUs(seg.target_timerange?.start);
        const targetDur = parseTimeUs(seg.target_timerange?.duration);
        const sourceIn = parseTimeUs(seg.source_timerange?.start);
        const matPath = mat?.path ? mat.path.replace(/\\/g, '/') : '';
        const name = mat?.name || matPath.split(/[\/\\]/).pop() || `Áudio ${nextId}`;

        audios.push({
          id: nextId++,
          path: matPath,
          name,
          start,
          in: sourceIn,
          duration: targetDur,
          max: mat?.duration ? parseTimeUs(mat.duration) : targetDur,
          speed: Number(speed.toFixed(2)),
          volume: typeof seg.volume === 'number' ? seg.volume : 1
        });
      }
    } else if (type === 'text') {
      // Trilhas de texto / legendas
      for (const seg of segments) {
        const mat = textMats.get(seg.material_id);
        const start = parseTimeUs(seg.target_timerange?.start);
        const targetDur = parseTimeUs(seg.target_timerange?.duration);
        let rawContent = mat?.content || 'Texto';
        try {
          const parsed = JSON.parse(rawContent);
          if (parsed && parsed.text) rawContent = parsed.text;
        } catch {
          // Mantém string original
        }

        texts.push({
          id: nextId++,
          text: String(rawContent).trim(),
          start,
          duration: targetDur,
          x: 50,
          y: 80,
          size: 28,
          color: '#ffffff',
          font: 'Arial'
        });
      }
    }
  }

  // Detecta proporção do canvas
  let aspect = '16:9';
  const cWidth = data.canvas_config?.width || 1920;
  const cHeight = data.canvas_config?.height || 1080;
  if (cWidth && cHeight) {
    const ratio = cWidth / cHeight;
    if (Math.abs(ratio - 16 / 9) < 0.05) aspect = '16:9';
    else if (Math.abs(ratio - 9 / 16) < 0.05) aspect = '9:16';
    else if (Math.abs(ratio - 1) < 0.05) aspect = '1:1';
    else if (Math.abs(ratio - 4 / 5) < 0.05) aspect = '4:5';
    else if (Math.abs(ratio - 21 / 9) < 0.05) aspect = '21:9';
  }

  const fps = Math.round(data.fps || 30);
  const res = String(Math.min(cWidth, cHeight) >= 1080 ? 1080 : 720);

  return {
    media: mediaList,
    clips,
    overlays,
    audios,
    texts,
    markers,
    tracks: {
      video: { visible: true, mute: false },
      overlay: { visible: true },
      text: { visible: true },
      audio: { mute: false, solo: false }
    },
    settings: {
      aspect,
      res,
      fps: String(fps),
      crf: '18'
    }
  };
}

/**
 * Converte o estado do LeccorCut para a estrutura padrão draft_content.json do CapCut
 * @param {object} state - Estado do LeccorCut
 * @returns {object} Objeto formatado compatível com CapCut draft_content.json
 */
function leccorToCapcut(state) {
  const materials = {
    videos: [],
    audios: [],
    texts: [],
    speeds: [],
    canvases: [],
    transitions: []
  };

  const tracks = [];
  let videoTrackAccUs = 0;

  // 1. Trilha Principal de Vídeo
  const mainVideoSegments = [];
  (state.clips || []).forEach((c, idx) => {
    const vidId = `mat_video_${c.id || idx + 1}`;
    const durUs = toTimeUs(c.duration);
    const inUs = toTimeUs(c.in);

    materials.videos.push({
      id: vidId,
      path: c.path,
      material_name: c.name || `Clipe ${idx + 1}`,
      duration: toTimeUs(c.max || c.duration),
      type: c.isImage ? 'image' : 'video'
    });

    mainVideoSegments.push({
      id: `seg_vid_${c.id || idx + 1}`,
      material_id: vidId,
      render_index: idx,
      speed: c.speed || 1,
      volume: typeof c.volume === 'number' ? c.volume : 1,
      target_timerange: { start: videoTrackAccUs, duration: durUs },
      source_timerange: { start: inUs, duration: toTimeUs(c.duration * (c.speed || 1)) },
      visible: true
    });

    videoTrackAccUs += durUs;
  });

  if (mainVideoSegments.length) {
    tracks.push({
      id: 'track_main_video',
      type: 'video',
      flag: 0,
      segments: mainVideoSegments
    });
  }

  // 2. Trilha de Sobreposição / PiP
  const overlaySegments = (state.overlays || []).map((o, idx) => {
    const ovId = `mat_ov_${o.id || idx + 1}`;
    materials.videos.push({
      id: ovId,
      path: o.path,
      material_name: o.name || `Sobreposição ${idx + 1}`,
      duration: toTimeUs(o.max || o.duration),
      type: 'video'
    });

    return {
      id: `seg_ov_${o.id || idx + 1}`,
      material_id: ovId,
      render_index: 100 + idx,
      speed: o.speed || 1,
      volume: typeof o.volume === 'number' ? o.volume : 1,
      target_timerange: { start: toTimeUs(o.start), duration: toTimeUs(o.duration) },
      source_timerange: { start: toTimeUs(o.in), duration: toTimeUs(o.duration * (o.speed || 1)) },
      visible: true
    };
  });

  if (overlaySegments.length) {
    tracks.push({
      id: 'track_overlay_video',
      type: 'video',
      flag: 0,
      segments: overlaySegments
    });
  }

  // 3. Trilhas de Áudio
  const audioSegments = (state.audios || []).map((a, idx) => {
    const audId = `mat_aud_${a.id || idx + 1}`;
    materials.audios.push({
      id: audId,
      path: a.path,
      name: a.name || `Áudio ${idx + 1}`,
      duration: toTimeUs(a.max || a.duration)
    });

    return {
      id: `seg_aud_${a.id || idx + 1}`,
      material_id: audId,
      speed: a.speed || 1,
      volume: typeof a.volume === 'number' ? a.volume : 1,
      target_timerange: { start: toTimeUs(a.start), duration: toTimeUs(a.duration) },
      source_timerange: { start: toTimeUs(a.in), duration: toTimeUs(a.duration * (a.speed || 1)) }
    };
  });

  if (audioSegments.length) {
    tracks.push({
      id: 'track_audio_1',
      type: 'audio',
      flag: 0,
      segments: audioSegments
    });
  }

  // 4. Trilhas de Texto
  const textSegments = (state.texts || []).map((t, idx) => {
    const txtId = `mat_txt_${t.id || idx + 1}`;
    materials.texts.push({
      id: txtId,
      content: JSON.stringify({ text: t.text }),
      typesetting: 0
    });

    return {
      id: `seg_txt_${t.id || idx + 1}`,
      material_id: txtId,
      target_timerange: { start: toTimeUs(t.start), duration: toTimeUs(t.duration) }
    };
  });

  if (textSegments.length) {
    tracks.push({
      id: 'track_text_1',
      type: 'text',
      flag: 0,
      segments: textSegments
    });
  }

  // Resolução do canvas
  const aspect = state.settings?.aspect || '16:9';
  let width = 1920, height = 1080;
  if (aspect === '9:16') { width = 1080; height = 1920; }
  else if (aspect === '1:1') { width = 1080; height = 1080; }
  else if (aspect === '4:5') { width = 1080; height = 1350; }
  else if (aspect === '21:9') { width = 2560; height = 1080; }

  return {
    id: `leccor_draft_${Date.now()}`,
    version: 2,
    new_version: '96.0.0',
    fps: Number(state.settings?.fps) || 30.0,
    duration: videoTrackAccUs,
    canvas_config: {
      ratio: aspect,
      width,
      height,
      background: null
    },
    materials,
    tracks
  };
}

module.exports = {
  capcutToLeccor,
  leccorToCapcut,
  parseTimeUs,
  toTimeUs
};
