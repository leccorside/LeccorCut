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
    mk(1, a, { transition: 'dissolve', filters: { preset: 'vintage', zoom: 1.3, hflip: true } }),
    mk(2, b, { transition: 'wipeleft', speed: 1.5, duration: 2, filters: { brightness: 10, fade: true } }),
    mk(3, img, { isImage: true, hasAudio: false, duration: 2 })
  ],
  texts: [{ id: 4, text: "Olá: mundo's 100%", color: '#ffffff', size: 48, start: 0.5, duration: 3, px: 0.5, py: 0.2 }],
  audios: [{ id: 5, path: au, name: 'music.wav', start: 1, in: 0, duration: 4, max: 6, volume: 0.5 }],
  overlays: [{ id: 6, path: ov, name: 'ov.mp4', isImage: false, start: 1, in: 0, duration: 2.5, max: 3, x: 0, y: 0, x2: 1, y2: 1, motion: true, scale: 25, opacity: 0.9, chroma: true, chromaColor: '#00ff00', chromaSim: 0.3 }],
  settings: { height: 360, fps: 30, crf: 28, aspect: '9:16' }
};

const out = path.join(dir, 'out.mp4');
const { args } = buildFfmpeg(project, out);
try {
  execFileSync(ffmpeg, ['-v', 'error', ...args], { stdio: 'inherit' });
  const size = fs.statSync(out).size;
  console.log(`OK: exportação gerada (${size} bytes) em ${out}`);
} catch (e) {
  console.error('FALHA na exportação'); console.error('filter_complex:\n' + args[args.indexOf('-filter_complex') + 1].split(';').join(';\n'));
  process.exit(1);
}
