'use strict';
/**
 * tests/phase14-smoke.js — Testes Automatizados da Fase 14
 * Interoperabilidade Pro e Exportação para Outras NLEs (EDL, FCPXML e Project Bundler)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  secondsToTimecode,
  timecodeToSeconds,
  exportEdl,
  exportFcpxml,
  bundleProject
} = require('../src/proExporters');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- Início dos Testes da Fase 14: Interoperabilidade Pro (EDL, FCPXML, Bundler) ---\n');

  // ── 1. Conversão e Aritmética de Timecode SMPTE ──────────────────────────────
  test('secondsToTimecode calcula strings HH:MM:SS:FF com precisão em 30 fps', () => {
    assert.strictEqual(secondsToTimecode(0, 30), '00:00:00:00');
    assert.strictEqual(secondsToTimecode(1.0, 30), '00:00:01:00');
    assert.strictEqual(secondsToTimecode(1.5, 30), '00:00:01:15');
    assert.strictEqual(secondsToTimecode(65.1, 30), '00:01:05:03');
    assert.strictEqual(secondsToTimecode(3600, 30), '01:00:00:00');
  });

  test('secondsToTimecode lida corretamente com framerates de cinema e broadcast (24, 25, 60 fps)', () => {
    assert.strictEqual(secondsToTimecode(1.5, 24), '00:00:01:12'); // 1s + 12 frames
    assert.strictEqual(secondsToTimecode(1.5, 25), '00:00:01:13'); // 1s + 12.5 -> 13 frames
    assert.strictEqual(secondsToTimecode(1.5, 60), '00:00:01:30'); // 1s + 30 frames
  });

  test('timecodeToSeconds e secondsToTimecode são bidirecionais', () => {
    const tc = '01:15:30:15';
    const sec = timecodeToSeconds(tc, 30);
    const roundtripTc = secondsToTimecode(sec, 30);
    assert.strictEqual(roundtripTc, tc);
  });

  // ── 2. Exportação de Edit Decision List (EDL - CMX 3600) ─────────────────────
  test('exportEdl gera arquivo compatível com formato CMX 3600', () => {
    const project = {
      title: 'Projeto Comercial',
      settings: { fps: 30 },
      clips: [
        { name: 'Entrevista.mp4', path: 'C:/media/entrevista.mp4', in: 2.0, duration: 5.0, hasAudio: true },
        { name: 'B-Roll_Paisagem.mp4', path: 'C:/media/paisagem.mp4', in: 0, duration: 3.5, hasAudio: false }
      ],
      audios: [
        { name: 'TrilhaSonora.mp3', path: 'C:/media/musica.mp3', in: 10.0, start: 0, duration: 8.5 }
      ]
    };

    const edl = exportEdl(project);
    assert(edl.includes('TITLE: PROJETO_COMERCIAL'), 'Deve conter cabeçalho TITLE em maiúsculas');
    assert(edl.includes('FCM: NON-DROP FRAME'), 'Deve conter FCM: NON-DROP FRAME');

    // Eventos
    assert(edl.includes('001  AX       V/A   C'), 'Evento 1 deve conter corte de vídeo/áudio');
    assert(edl.includes('* FROM CLIP NAME: Entrevista.mp4'), 'Deve listar nome do clipe de origem');
    assert(edl.includes('* SOURCE FILE: C:/media/entrevista.mp4'), 'Deve listar caminho de origem');

    assert(edl.includes('002  AX       V     C'), 'Evento 2 deve ser vídeo puro');
    assert(edl.includes('* FROM CLIP NAME: B-Roll_Paisagem.mp4'));

    assert(edl.includes('003  AX       A2    C'), 'Evento 3 deve ser áudio secundário A2');
    assert(edl.includes('* FROM CLIP NAME: TrilhaSonora.mp3'));
  });

  // ── 3. Exportação de Final Cut Pro XML (FCPXML v1.9 / v1.10) ─────────────────
  test('exportFcpxml gera documento XML bem-estruturado para DaVinci e Premiere', () => {
    const project = {
      title: 'Documentario_Teaser',
      settings: { fps: 30, res: 1080, aspect: '16:9' },
      clips: [
        { name: 'Cena1.mp4', path: 'D:/video/cena1.mp4', in: 1.0, duration: 4.0, hasAudio: true },
        { name: 'Cena2.mp4', path: 'D:/video/cena2.mp4', in: 0, duration: 6.0, hasAudio: true }
      ],
      overlays: [
        { name: 'LogoPiP.png', path: 'D:/img/logo.png', start: 2.0, duration: 3.0 }
      ],
      texts: [
        { text: 'Apresentação Oficial', start: 1.5, duration: 2.5, font: 'Impact', size: 54, color: '#ffcc00' }
      ],
      audios: [
        { name: 'Ambiente.wav', path: 'D:/audio/amb.wav', in: 0, start: 0, duration: 10.0 }
      ]
    };

    const xml = exportFcpxml(project);
    assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Deve ter declaração XML');
    assert(xml.includes('<fcpxml version="1.9">'), 'Deve ter elemento raiz fcpxml');
    assert(xml.includes('width="1920" height="1080"'), 'Deve calcular resolução 1080p 16:9');

    // Recursos
    assert(xml.includes('<asset id="r_asset_1" name="Cena1.mp4"'), 'Deve declarar asset para Cena1');
    assert(xml.includes('<asset id="r_asset_2" name="Cena2.mp4"'), 'Deve declarar asset para Cena2');
    assert(xml.includes('<asset id="r_asset_3" name="LogoPiP.png"'), 'Deve declarar asset para overlay');
    assert(xml.includes('<asset id="r_asset_4" name="Ambiente.wav"'), 'Deve declarar asset para áudio');

    // Estrutura de Spine e Lanes
    assert(xml.includes('<spine>'), 'Deve conter elemento spine principal');
    assert(xml.includes('<asset-clip name="Cena1.mp4"'), 'Deve conter asset-clip principal');
    assert(xml.includes('<asset-clip lane="1" name="LogoPiP.png"'), 'Overlay deve estar no lane 1');
    assert(xml.includes('<title lane="2" name="Apresentação Oficial"'), 'Texto deve estar no lane 2');
    assert(xml.includes('<text-style font="Impact" fontSize="54" fontColor="#ffcc00">'), 'Deve preservar estilo do texto');
    assert(xml.includes('<asset-clip lane="-1" name="Ambiente.wav"'), 'Áudio secundário deve estar no lane -1');
    assert(xml.includes('</fcpxml>'), 'Deve fechar fcpxml');
  });

  // ── 4. Empacotador de Projeto (Project Bundler / Coleta de Arquivos) ──────────
  await asyncTest('bundleProject copia mídias e reescreve caminhos para formato relativo portátil', async () => {
    const tmpBase = path.join(os.tmpdir(), `leccor_bundle_test_${Date.now()}`);
    fs.mkdirSync(tmpBase, { recursive: true });

    const srcMedia1 = path.join(tmpBase, 'source_video.mp4');
    const srcMedia2 = path.join(tmpBase, 'source_audio.mp3');
    fs.writeFileSync(srcMedia1, 'fake video content buffer 123456');
    fs.writeFileSync(srcMedia2, 'fake audio content buffer abcdef');

    const projectData = {
      title: 'Projeto para Empacotar',
      media: [
        { path: srcMedia1, name: 'Video 1' },
        { path: srcMedia2, name: 'Audio 1' }
      ],
      clips: [
        { path: srcMedia1, name: 'Video 1', in: 0, duration: 5 }
      ],
      audios: [
        { path: srcMedia2, name: 'Audio 1', in: 0, start: 0, duration: 5 }
      ],
      overlays: [],
      texts: []
    };

    const targetBundleDir = path.join(tmpBase, 'Meu_Pacote_Final');
    const result = await bundleProject(projectData, targetBundleDir);

    assert(result.ok === true, 'Resultado deve ser ok: true');
    assert.strictEqual(result.totalFiles, 2, 'Deve ter copiado 2 arquivos');
    assert(result.totalBytes > 0, 'Deve ter calculado total de bytes');

    // Validação do diretório media/
    const bundleMediaDir = path.join(targetBundleDir, 'media');
    assert(fs.existsSync(bundleMediaDir), 'Diretório media deve existir');
    const filesInMedia = fs.readdirSync(bundleMediaDir);
    assert(filesInMedia.includes('source_video.mp4'), 'source_video.mp4 deve estar em media/');
    assert(filesInMedia.includes('source_audio.mp3'), 'source_audio.mp3 deve estar em media/');

    // Validação do arquivo project.lccut
    const bundleProjectFile = path.join(targetBundleDir, 'project.lccut');
    assert(fs.existsSync(bundleProjectFile), 'project.lccut deve ter sido gravado');

    const bundledJson = JSON.parse(fs.readFileSync(bundleProjectFile, 'utf-8'));
    assert.strictEqual(bundledJson.isBundled, true);
    assert(bundledJson.bundleDate !== undefined);

    // Caminhos convertidos para caminhos relativos portáteis
    assert.strictEqual(bundledJson.clips[0].path, './media/source_video.mp4');
    assert.strictEqual(bundledJson.clips[0].originalPath, srcMedia1);
    assert.strictEqual(bundledJson.audios[0].path, './media/source_audio.mp3');
    assert.strictEqual(bundledJson.media[0].path, './media/source_video.mp4');

    // Limpeza
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  // ── 5. Validação de Arquivos de UI, IPC e Preload ────────────────────────────
  test('src/index.html contém os botões da Fase 14 na barra superior', () => {
    const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf-8');
    assert(html.includes('id="btnExportEdl"'), 'Deve conter botão btnExportEdl');
    assert(html.includes('id="btnExportFcpxml"'), 'Deve conter botão btnExportFcpxml');
    assert(html.includes('id="btnBundleProject"'), 'Deve conter botão btnBundleProject');
  });

  test('src/styles.css possui estilo para .pro-btn', () => {
    const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf-8');
    assert(css.includes('.pro-btn'), 'Deve conter classe .pro-btn');
    assert(css.includes('.pro-btn:hover'), 'Deve conter estilo hover de .pro-btn');
  });

  test('src/preload.js expõe os métodos da Fase 14 no window.api', () => {
    const preload = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf-8');
    assert(preload.includes('exportEdl:'), 'Deve expor exportEdl');
    assert(preload.includes('exportFcpxml:'), 'Deve expor exportFcpxml');
    assert(preload.includes('bundleProject:'), 'Deve expor bundleProject');
  });

  test('src/main.js registra os handlers IPC da Fase 14', () => {
    const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf-8');
    assert(main.includes("ipcMain.handle('export-edl'"), 'Deve registrar export-edl');
    assert(main.includes("ipcMain.handle('export-fcpxml'"), 'Deve registrar export-fcpxml');
    assert(main.includes("ipcMain.handle('bundle-project'"), 'Deve registrar bundle-project');
  });

  test('src/renderer.js integra os cliques dos botões com toasts e chamadas à API', () => {
    const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf-8');
    assert(renderer.includes('btnExportEdl'), 'Deve vincular btnExportEdl');
    assert(renderer.includes('btnExportFcpxml'), 'Deve vincular btnExportFcpxml');
    assert(renderer.includes('btnBundleProject'), 'Deve vincular btnBundleProject');
  });

  // ── Resumo Final ────────────────────────────────────────────────────────────
  console.log(`\n========================================`);
  console.log(`Total de testes: ${passed + failed}`);
  console.log(`Sucessos: ${passed}`);
  console.log(`Falhas: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
