// Teste de fumaça da exportação: gera mídias sintéticas e roda o filtergraph real do FFmpeg.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('ffmpeg-static');
const { buildFfmpeg } = require('../src/ffmpegBuilder');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-'));
const run = (args) => execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

const a = path.join(dir, 'a.mp4'), b = path.join(dir, 'b.mp4'), ov = path.join(dir, 'ov.mp4'), au = path.join(dir, 'music.wav'), img = path.join(dir, 'img.png');
run(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-shortest', '-pix_fmt', 'yuv420p', a]);
run(['-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=4', '-shortest', '-pix_fmt', 'yuv420p', b]);
run(['-f', 'lavfi', '-i', 'color=c=0x00ff00:size=200x200:rate=30:duration=3', '-pix_fmt', 'yuv420p', ov]);
run(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', au]);
run(['-f', 'lavfi', '-i', 'color=c=red:size=320x240:duration=1', '-frames:v', '1', img]);

const mk = (id, p, extra = {}) => ({ id, path: p, name: path.basename(p), duration: 3, srcDur: 4, in: 0.5, hasVideo: true, hasAudio: true, isImage: false, filters: {}, speed: 1, volume: 1, ...extra });
const project = {
  clips: [
    mk(1, a, { transition: 'dissolve', filters: { fillMode: 'blur', denoise: true, loudnorm: true, preset: 'vintage', zoom: 1.1, hflip: true, vignette: true } }),
    mk(2, b, { transition: 'wipeleft', speed: 1.5, duration: 2, filters: { fillMode: 'crop', brightness: 10, fade: true } }),
    mk(3, img, { isImage: true, hasAudio: false, duration: 2 })
  ],
  texts: [{ id: 4, text: "Olá: mundo's 100%", color: '#ffffff', size: 48, start: 0.5, duration: 3, px: 0.5, py: 0.2, font: 'Impact', bold: false, box: true, boxColor: '#000000', boxOpacity: 0.5, outline: 3, anim: 'slide' }],
  audios: [{ id: 5, path: au, name: 'music.wav', start: 1, in: 0, duration: 4, max: 6, volume: 0.5, fadeIn: 0.8, fadeOut: 1.0, denoise: true, loudnorm: true }],
  overlays: [{ id: 6, path: ov, name: 'ov.mp4', isImage: false, start: 1, in: 0, duration: 2.5, max: 3, x: 0, y: 0, x2: 1, y2: 1, motion: true, easing: 'smooth', anim: 'slide_left', rotate: 15, hflip: true, scale: 25, opacity: 0.9, chroma: true, chromaColor: '#00ff00', chromaSim: 0.3 }],
  settings: { height: 360, fps: 30, crf: 28, aspect: '9:16' }
};

const out = path.join(dir, 'out.mp4');
const { args } = buildFfmpeg(project, out);
try {
  execFileSync(ffmpeg, ['-v', 'error', ...args], { stdio: 'inherit' });
  const size = fs.statSync(out).size;
  console.log(`OK: exportação padrão gerada (${size} bytes) em ${out}`);
} catch (e) {
  console.error('FALHA na exportação padrão'); console.error('filter_complex:\n' + args[args.indexOf('-filter_complex') + 1].split(';').join(';\n'));
  process.exit(1);
}

// Teste com controles de trilha (vídeo mudo, PiP oculto, texto oculto, áudio solo)
const outTracks = path.join(dir, 'out-tracks.mp4');
const projectWithTracks = {
  ...project,
  tracks: {
    video: { visible: true, mute: true },
    overlay: { visible: false },
    text: { visible: false },
    audio: { mute: false, solo: true }
  }
};
const { args: argsTracks } = buildFfmpeg(projectWithTracks, outTracks);
try {
  execFileSync(ffmpeg, ['-v', 'error', ...argsTracks], { stdio: 'inherit' });
  const size2 = fs.statSync(outTracks).size;
  console.log(`OK: exportação com controles de trilha gerada (${size2} bytes) em ${outTracks}`);
} catch (e) {
  console.error('FALHA na exportação com controles de trilha');
  process.exit(1);
}

// Teste com Curva de Velocidade (Speed Ramping Heroico)
const outSpeedCurve = path.join(dir, 'out-speedcurve.mp4');
const projectWithSpeedCurve = {
  ...project,
  clips: [
    mk(1, a, { speedCurve: 'hero', duration: 2.5, in: 0.2, filters: { fillMode: 'blur', denoise: true } }),
    mk(2, b, { speedCurve: 'flash_out', duration: 2.0, in: 0.5, filters: { fillMode: 'fit' } })
  ],
  texts: [],
  overlays: [],
  audios: []
};
const { args: argsSpeed } = buildFfmpeg(projectWithSpeedCurve, outSpeedCurve);
try {
  execFileSync(ffmpeg, ['-v', 'error', ...argsSpeed], { stdio: 'inherit' });
  const size3 = fs.statSync(outSpeedCurve).size;
  console.log(`OK: exportação com Speed Ramping gerada (${size3} bytes) em ${outSpeedCurve}`);
} catch (e) {
  console.error('FALHA na exportação com Speed Ramping');
  console.error('filter_complex:\n' + argsSpeed[argsSpeed.indexOf('-filter_complex') + 1].split(';').join(';\n'));
  process.exit(1);
}

// Teste com Legendas Dinâmicas (Karaokê e Word-by-Word)
const outKaraoke = path.join(dir, 'out-karaoke.mp4');
const projectWithKaraoke = {
  ...project,
  clips: [mk(1, a, { duration: 3 })],
  overlays: [],
  audios: [],
  texts: [
    { id: 10, text: 'LeccorCut editor profissional com karaokê', start: 0.5, duration: 2.2, anim: 'karaoke', highlightColor: '#ffeb3b', color: '#ffffff', size: 44, px: 0.5, py: 0.8 },
    { id: 11, text: 'Palavra por palavra viral', start: 1.0, duration: 1.8, anim: 'word_by_word', color: '#00e5c3', size: 40, px: 0.5, py: 0.3 }
  ]
};
const { args: argsKaraoke } = buildFfmpeg(projectWithKaraoke, outKaraoke);
try {
  execFileSync(ffmpeg, ['-v', 'error', ...argsKaraoke], { stdio: 'inherit' });
  const size4 = fs.statSync(outKaraoke).size;
  console.log(`OK: exportação com Legendas Karaokê gerada (${size4} bytes) em ${outKaraoke}`);
} catch (e) {
  console.error('FALHA na exportação com Legendas Karaokê');
  console.error('filter_complex:\n' + argsKaraoke[argsKaraoke.indexOf('-filter_complex') + 1].split(';').join(';\n'));
  process.exit(1);
}

