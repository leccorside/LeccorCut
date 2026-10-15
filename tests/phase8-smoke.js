// tests/phase8-smoke.js — Testes unitários e end-to-end da Fase 8: Exportação Profissional e Codecs Adicionais
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const ffmpegPath = unpacked(require('ffmpeg-static'));
const { buildFfmpeg, buildCodecArgs, buildAudioOnlyFfmpeg } = require('../src/ffmpegBuilder');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-phase8-'));
let passed = 0;
let failed = 0;

function ok(condition, desc) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`);
    failed++;
  }
}

console.log('\n=== Fase 8 — Exportação Profissional e Codecs Adicionais: Testes ===\n');

// ── 1. Testes de Unidade: buildCodecArgs ──────────────────────────────────────
console.log('1. Testando gerador de argumentos de codec (buildCodecArgs)...');

// 1.1 MP4 padrão
const mp4Res = buildCodecArgs({ format: 'mp4', crf: 18, colorProfile: 'bt709' });
ok(mp4Res.vArgs.includes('libx264'), 'MP4 usa libx264');
ok(mp4Res.vArgs.includes('yuv420p'), 'MP4 usa pix_fmt yuv420p');
ok(mp4Res.aArgs.includes('aac'), 'MP4 usa áudio aac');
ok(mp4Res.vArgs.includes('-colorspace') && mp4Res.vArgs.includes('bt709'), 'MP4 bt709 aplica colorspace bt709');

// 1.2 WebM VP9 com suporte a alfa
const webmRes = buildCodecArgs({ format: 'webm', crf: 20 });
ok(webmRes.vArgs.includes('libvpx-vp9'), 'WebM usa libvpx-vp9');
ok(webmRes.vArgs.includes('yuva420p'), 'WebM usa pix_fmt yuva420p para canal alfa');
ok(webmRes.vArgs.includes('-auto-alt-ref') && webmRes.vArgs.includes('0'), 'WebM desativa auto-alt-ref para suporte a transparência');
ok(webmRes.aArgs.includes('libopus'), 'WebM usa áudio libopus');

// 1.3 Apple ProRes 422
const prores422Res = buildCodecArgs({ format: 'prores422' });
ok(prores422Res.vArgs.includes('prores_ks'), 'ProRes 422 usa codec prores_ks');
ok(prores422Res.vArgs.includes('2'), 'ProRes 422 usa profile:v 2');
ok(prores422Res.vArgs.includes('yuv422p10le'), 'ProRes 422 usa 10-bit 4:2:2 (yuv422p10le)');
ok(prores422Res.aArgs.includes('pcm_s16le'), 'ProRes usa áudio pcm_s16le sem compressão');

// 1.4 Apple ProRes 4444 com canal alfa
const prores4444Res = buildCodecArgs({ format: 'prores4444' });
ok(prores4444Res.vArgs.includes('prores_ks'), 'ProRes 4444 usa codec prores_ks');
ok(prores4444Res.vArgs.includes('4'), 'ProRes 4444 usa profile:v 4');
ok(prores4444Res.vArgs.includes('yuva444p10le'), 'ProRes 4444 usa 10-bit 4:4:4 com canal alfa (yuva444p10le)');

// 1.5 Modo de Bitrate CBR
const cbrRes = buildCodecArgs({ format: 'mp4', bitrateMode: 'cbr', bitrate: 6000 });
ok(cbrRes.vArgs.includes('-b:v') && cbrRes.vArgs.includes('6000k'), 'CBR define taxa nominal (-b:v 6000k)');
ok(cbrRes.vArgs.includes('-minrate') && cbrRes.vArgs.includes('6000k'), 'CBR define taxa mínima (-minrate 6000k)');
ok(cbrRes.vArgs.includes('-maxrate') && cbrRes.vArgs.includes('6000k'), 'CBR define taxa máxima (-maxrate 6000k)');
ok(cbrRes.vArgs.includes('-bufsize') && cbrRes.vArgs.includes('12000k'), 'CBR define buffer proporcional (-bufsize 12000k)');

// 1.6 Perfil de Cor BT.2020 (HDR)
const hdrRes = buildCodecArgs({ format: 'mp4', colorProfile: 'bt2020' });
ok(hdrRes.vArgs.includes('-colorspace') && hdrRes.vArgs.includes('bt2020nc'), 'HDR BT.2020 define colorspace bt2020nc');
ok(hdrRes.vArgs.includes('-color_primaries') && hdrRes.vArgs.includes('bt2020'), 'HDR BT.2020 define primaries bt2020');
ok(hdrRes.vArgs.includes('-color_trc') && hdrRes.vArgs.includes('smpte2084'), 'HDR BT.2020 define curva de transferência PQ (smpte2084)');
ok(hdrRes.vArgs.includes('yuv420p10le'), 'HDR BT.2020 exige profundidade de 10 bits');

// ── 2. Testes de Unidade: buildAudioOnlyFfmpeg ────────────────────────────────
console.log('\n2. Testando gerador de exportação independente de áudio (buildAudioOnlyFfmpeg)...');

const audioProj = {
  clips: [
    { path: path.join(tmpDir, 'dummy.mp4'), in: 0, duration: 2, hasAudio: true, volume: 0.8 }
  ],
  audios: [
    { path: path.join(tmpDir, 'bgm.mp3'), in: 0, duration: 2, start: 0, volume: 0.5, fadeIn: 0.2 }
  ]
};

const wavBuild = buildAudioOnlyFfmpeg(audioProj, path.join(tmpDir, 'out.wav'));
ok(wavBuild.args.includes('-vn'), 'Exportação de áudio desativa fluxo de vídeo (-vn)');
ok(wavBuild.args.includes('pcm_s16le'), 'Exportação .wav utiliza codec pcm_s16le');
ok(wavBuild.args.join(' ').includes('amix='), 'Mixagem reúne áudio dos clipes e trilha secundária via amix');

const mp3Build = buildAudioOnlyFfmpeg(audioProj, path.join(tmpDir, 'out.mp3'));
ok(mp3Build.args.includes('libmp3lame'), 'Exportação .mp3 utiliza codec libmp3lame');
ok(mp3Build.args.includes('320k'), 'Exportação .mp3 utiliza bitrate de alta fidelidade (320k)');

const aacBuild = buildAudioOnlyFfmpeg(audioProj, path.join(tmpDir, 'out.aac'));
ok(aacBuild.args.includes('aac'), 'Exportação .aac utiliza codec aac');

// ── 3. Testes End-to-End com FFmpeg Real ──────────────────────────────────────
console.log('\n3. Executando testes reais de renderização com FFmpeg...');

// Criar mídia sintética de 1 segundo com áudio senoidal e vídeo de teste
const sampleVideo = path.join(tmpDir, 'sample_test.mp4');
const genSample = spawnSync(ffmpegPath, [
  '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=24',
  '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', sampleVideo
], { encoding: 'utf8' });

ok(fs.existsSync(sampleVideo) && fs.statSync(sampleVideo).size > 1000, 'Mídia sintética base criada com sucesso');

const testProject = {
  clips: [{ path: sampleVideo, in: 0, duration: 1, hasAudio: true }],
  settings: { height: 240, fps: 24, aspect: '4:3' }
};

// 3.1 Render real: WebM VP9 (suporte a alfa)
const outWebM = path.join(tmpDir, 'out_alpha.webm');
const webmBuild = buildFfmpeg({ ...testProject, settings: { ...testProject.settings, format: 'webm' } }, outWebM);
const runWebm = spawnSync(ffmpegPath, webmBuild.args, { encoding: 'utf8' });
ok(runWebm.status === 0 && fs.existsSync(outWebM) && fs.statSync(outWebM).size > 1000,
  `Vídeo WebM VP9 com canal alfa gerado com sucesso (${fs.existsSync(outWebM) ? fs.statSync(outWebM).size : 0} bytes)`);

// 3.2 Render real: QuickTime Apple ProRes 422
const outProRes = path.join(tmpDir, 'out_prores422.mov');
const proresBuild = buildFfmpeg({ ...testProject, settings: { ...testProject.settings, format: 'prores422' } }, outProRes);
const runProres = spawnSync(ffmpegPath, proresBuild.args, { encoding: 'utf8' });
ok(runProres.status === 0 && fs.existsSync(outProRes) && fs.statSync(outProRes).size > 5000,
  `Vídeo ProRes 422 gerado com sucesso (${fs.existsSync(outProRes) ? fs.statSync(outProRes).size : 0} bytes)`);

// 3.3 Render real: MP4 com taxa CBR controlada
const outCbr = path.join(tmpDir, 'out_cbr.mp4');
const cbrBuild = buildFfmpeg({
  ...testProject,
  settings: { ...testProject.settings, format: 'mp4', bitrateMode: 'cbr', bitrate: 2500 }
}, outCbr);
const runCbr = spawnSync(ffmpegPath, cbrBuild.args, { encoding: 'utf8' });
ok(runCbr.status === 0 && fs.existsSync(outCbr) && fs.statSync(outCbr).size > 1000,
  `Vídeo MP4 CBR gerado com sucesso (${fs.existsSync(outCbr) ? fs.statSync(outCbr).size : 0} bytes)`);

// 3.4 Render real: MP4 com perfil de cor BT.2020 HDR 10-bit
const outHdr = path.join(tmpDir, 'out_hdr.mp4');
const hdrBuild = buildFfmpeg({
  ...testProject,
  settings: { ...testProject.settings, format: 'mp4', colorProfile: 'bt2020' }
}, outHdr);
const runHdr = spawnSync(ffmpegPath, hdrBuild.args, { encoding: 'utf8' });
ok(runHdr.status === 0 && fs.existsSync(outHdr) && fs.statSync(outHdr).size > 1000,
  `Vídeo MP4 BT.2020 HDR 10-bit gerado com sucesso (${fs.existsSync(outHdr) ? fs.statSync(outHdr).size : 0} bytes)`);

// 3.5 Render real: Exportação independente de áudio (.wav)
const outWav = path.join(tmpDir, 'exported_audio.wav');
const audioWavBuild = buildAudioOnlyFfmpeg(testProject, outWav);
const runAudioWav = spawnSync(ffmpegPath, audioWavBuild.args, { encoding: 'utf8' });
ok(runAudioWav.status === 0 && fs.existsSync(outWav) && fs.statSync(outWav).size > 5000,
  `Áudio independente WAV 16-bit PCM gerado (${fs.existsSync(outWav) ? fs.statSync(outWav).size : 0} bytes)`);

// 3.6 Render real: Exportação independente de áudio (.mp3)
const outMp3 = path.join(tmpDir, 'exported_audio.mp3');
const audioMp3Build = buildAudioOnlyFfmpeg(testProject, outMp3);
const runAudioMp3 = spawnSync(ffmpegPath, audioMp3Build.args, { encoding: 'utf8' });
ok(runAudioMp3.status === 0 && fs.existsSync(outMp3) && fs.statSync(outMp3).size > 500,
  `Áudio independente MP3 320k gerado (${fs.existsSync(outMp3) ? fs.statSync(outMp3).size : 0} bytes)`);

// ── 4. Verificação de Código e Arquitetura ────────────────────────────────────
console.log('\n4. Verificando integridade dos arquivos do projeto...');

const mainCode = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
ok(mainCode.includes("ipcMain.handle('export'"), 'Handler export no main.js');
ok(mainCode.includes("ipcMain.handle('export-audio-only'"), 'Handler export-audio-only no main.js');
ok(mainCode.includes('cleanPassLogs'), 'Função cleanPassLogs no main.js');
ok(mainCode.includes('isTwoPass'), 'Suporte a two-pass no handler export');

const preloadCode = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
ok(preloadCode.includes('exportAudioOnly:'), 'API exportAudioOnly no preload.js');
ok(preloadCode.includes('onExportAudioProgress:'), 'API onExportAudioProgress no preload.js');

const htmlCode = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
ok(htmlCode.includes('id="expFormat"'), 'Select expFormat no index.html');
ok(htmlCode.includes('id="expBitrateMode"'), 'Select expBitrateMode no index.html');
ok(htmlCode.includes('id="expBitrate"'), 'Input expBitrate no index.html');
ok(htmlCode.includes('id="expColorProfile"'), 'Select expColorProfile no index.html');
ok(htmlCode.includes('id="btnExportAudio"'), 'Botão btnExportAudio no index.html');

const rendererCode = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
ok(rendererCode.includes('updateExportControls'), 'Função updateExportControls no renderer.js');
ok(rendererCode.includes('btnExportAudio'), 'Handler btnExportAudio no renderer.js');
ok(rendererCode.includes('bitrateMode'), 'Envio de bitrateMode nas configurações de exportação');

// Limpeza de arquivos temporários
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch (_) {}

console.log(`\n--- Resultado: ${passed} passaram, ${failed} falharam ---`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 SUCESSO: Todos os testes da Fase 8 passaram com 100% de integridade!\n');
}
