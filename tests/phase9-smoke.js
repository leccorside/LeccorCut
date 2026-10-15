// tests/phase9-smoke.js — Testes unitários e end-to-end da Fase 9: UX, Produtividade e Assets
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const ffmpegPath = unpacked(require('ffmpeg-static'));
const { buildFfmpeg } = require('../src/ffmpegBuilder');
const { getAssetsList, getAssetById, ensureAssetFile } = require('../src/assetsLibrary');
const backupManager = require('../src/backupManager');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-phase9-'));
backupManager.setBackupsDir(path.join(tmpDir, 'backups'));

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

console.log('\n=== Fase 9 — UX, Produtividade e Assets: Testes ===\n');

// ── 1. Biblioteca Integrada de Assets e Stickers ──────────────────────────────
console.log('1. Testando módulo assetsLibrary...');

const allAssets = getAssetsList();
ok(Array.isArray(allAssets) && allAssets.length >= 10, `Biblioteca possui ${allAssets.length} assets nativos`);

const arrows = getAssetsList('arrows');
ok(arrows.length >= 3, `Filtro por categoria 'arrows' retornou ${arrows.length} itens`);

const badges = getAssetsList('badges');
ok(badges.length >= 3, `Filtro por categoria 'badges' retornou ${badges.length} itens`);

const frames = getAssetsList('frames');
ok(frames.length >= 3, `Filtro por categoria 'frames' retornou ${frames.length} itens`);

const stickers = getAssetsList('stickers');
ok(stickers.length >= 3, `Filtro por categoria 'stickers' retornou ${stickers.length} itens`);

const arrowItem = getAssetById('arrow_neon_cyan');
ok(arrowItem && arrowItem.name.includes('Seta Neon'), 'getAssetById localizou arrow_neon_cyan');

const fileResult = ensureAssetFile('arrow_neon_cyan');
ok(fileResult && fs.existsSync(fileResult.path), `ensureAssetFile gravou PNG local em: ${fileResult?.path}`);
ok(fileResult && fs.existsSync(fileResult.svgPath), `ensureAssetFile gravou SVG local em: ${fileResult?.svgPath}`);
const svgContent = fs.readFileSync(fileResult.svgPath, 'utf8');
ok(svgContent.includes('<svg') && svgContent.includes('</svg>'), 'Arquivo SVG gravado possui estrutura XML válida');
const pngHeader = fs.readFileSync(fileResult.path).subarray(0, 8).toString('hex');
ok(pngHeader === '89504e470d0a1a0a', 'Arquivo PNG gerado possui assinatura PNG legítima');

// ── 2. Gerenciador de Backups e Histórico de Versões (.lccut) ─────────────────
console.log('\n2. Testando módulo backupManager (.lccut snapshots)...');

const mockProject = {
  clips: [{ id: 1, path: 'video1.mp4', duration: 10, in: 0 }],
  texts: [{ id: 2, text: 'Olá Mundo', start: 1, duration: 3 }],
  audios: [{ id: 3, path: 'som.mp3', duration: 5, start: 0 }],
  overlays: [{ id: 4, path: fileResult.path, isImage: true, start: 0, duration: 3 }]
};

const savedBackup = backupManager.saveBackup(mockProject, 'Teste_Corte_Fase9');
ok(savedBackup.ok && fs.existsSync(savedBackup.filePath), `saveBackup gerou arquivo .lccut com sucesso (${savedBackup.filename})`);
ok(savedBackup.clipsCount === 1, 'Contagem de clipes salva corretamente no backup');

const backupsList = backupManager.listBackups();
ok(Array.isArray(backupsList) && backupsList.length >= 1, `listBackups retornou ${backupsList.length} snapshot(s)`);
ok(backupsList[0].id === savedBackup.id, 'Snapshot mais recente encabeça a lista de backups');

const restored = backupManager.restoreBackup(savedBackup.id);
ok(restored.ok && restored.project && restored.project.clips.length === 1, 'restoreBackup recuperou o projeto integralmente');

const delRes = backupManager.deleteBackup(savedBackup.id);
ok(delRes.ok && !fs.existsSync(savedBackup.filePath), 'deleteBackup removeu o snapshot com sucesso');

// ── 3. Renderização Real de Sticker/Overlay com FFmpeg ─────────────────────────
console.log('\n3. Testando renderização de sticker/overlay vetorial com FFmpeg...');

// Gerar clipe sintético base
const bgVideo = path.join(tmpDir, 'bg_test.mp4');
const genBg = spawnSync(ffmpegPath, [
  '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=24',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', bgVideo
], { encoding: 'utf8' });

ok(fs.existsSync(bgVideo) && fs.statSync(bgVideo).size > 500, 'Vídeo de fundo gerado para composição');

// Compor vídeo com sticker overlay vetorial
const outStickerVideo = path.join(tmpDir, 'out_with_sticker.mp4');
const projWithSticker = {
  clips: [{ path: bgVideo, in: 0, duration: 1 }],
  overlays: [{
    path: fileResult.path,
    isImage: true,
    start: 0,
    duration: 1,
    scale: 35,
    x: 0.5,
    y: 0.5,
    opacity: 1
  }],
  settings: { height: 240, fps: 24, aspect: '4:3' }
};

const ffmpegArgs = buildFfmpeg(projWithSticker, outStickerVideo);
const runRender = spawnSync(ffmpegPath, ffmpegArgs.args, { encoding: 'utf8' });
ok(runRender.status === 0 && fs.existsSync(outStickerVideo) && fs.statSync(outStickerVideo).size > 1000,
  `Vídeo com Sticker Overlay vetorial renderizado com sucesso (${fs.existsSync(outStickerVideo) ? fs.statSync(outStickerVideo).size : 0} bytes)`);

// ── 4. Verificação de Arquitetura, UI e APIs ──────────────────────────────────
console.log('\n4. Verificando integridade de código, IPC e UI...');

const mainCode = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
ok(mainCode.includes("ipcMain.handle('get-assets-list'"), 'Handler get-assets-list no main.js');
ok(mainCode.includes("ipcMain.handle('ensure-asset-file'"), 'Handler ensure-asset-file no main.js');
ok(mainCode.includes("ipcMain.handle('save-backup'"), 'Handler save-backup no main.js');
ok(mainCode.includes("ipcMain.handle('list-backups'"), 'Handler list-backups no main.js');
ok(mainCode.includes("ipcMain.handle('restore-backup'"), 'Handler restore-backup no main.js');
ok(mainCode.includes("ipcMain.handle('delete-backup'"), 'Handler delete-backup no main.js');
ok(mainCode.includes("ipcMain.handle('toggle-fullscreen'"), 'Handler toggle-fullscreen no main.js');

const preloadCode = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
ok(preloadCode.includes('getAssetsList:'), 'API getAssetsList no preload.js');
ok(preloadCode.includes('ensureAssetFile:'), 'API ensureAssetFile no preload.js');
ok(preloadCode.includes('saveBackup:'), 'API saveBackup no preload.js');
ok(preloadCode.includes('listBackups:'), 'API listBackups no preload.js');
ok(preloadCode.includes('restoreBackup:'), 'API restoreBackup no preload.js');
ok(preloadCode.includes('deleteBackup:'), 'API deleteBackup no preload.js');
ok(preloadCode.includes('toggleFullscreen:'), 'API toggleFullscreen no preload.js');

const htmlCode = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
ok(htmlCode.includes('id="btnHistory"'), 'Botão btnHistory no index.html');
ok(htmlCode.includes('id="btnShortcuts"'), 'Botão btnShortcuts no index.html');
ok(htmlCode.includes('id="tabAssets"'), 'Aba tabAssets no index.html');
ok(htmlCode.includes('id="assetsView"'), 'View assetsView no index.html');
ok(htmlCode.includes('id="assetsGrid"'), 'Grid assetsGrid no index.html');
ok(htmlCode.includes('id="btnCinema"'), 'Botão btnCinema no index.html');
ok(htmlCode.includes('id="cinemaControls"'), 'Barra cinemaControls no index.html');
ok(htmlCode.includes('id="historyModal"'), 'Modal historyModal no index.html');
ok(htmlCode.includes('id="shortcutsModal"'), 'Modal shortcutsModal no index.html');

const rendererCode = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
ok(rendererCode.includes('function toggleCinemaMode'), 'Função toggleCinemaMode no renderer.js');
ok(rendererCode.includes('function initCinemaMode'), 'Função initCinemaMode no renderer.js');
ok(rendererCode.includes('function initAssetsTab'), 'Função initAssetsTab no renderer.js');
ok(rendererCode.includes('function initBackups'), 'Função initBackups no renderer.js');
ok(rendererCode.includes('function initShortcuts'), 'Função initShortcuts no renderer.js');
ok(rendererCode.includes('DEFAULT_SHORTCUTS'), 'Mapa DEFAULT_SHORTCUTS no renderer.js');
ok(rendererCode.includes('cinema-mode'), 'Classe cinema-mode manipulada no renderer.js');

const cssCode = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
ok(cssCode.includes('.cinema-mode'), 'Classe .cinema-mode no styles.css');
ok(cssCode.includes('.cinema-controls'), 'Classe .cinema-controls no styles.css');
ok(cssCode.includes('.assets-grid'), 'Classe .assets-grid no styles.css');
ok(cssCode.includes('.asset-card'), 'Classe .asset-card no styles.css');
ok(cssCode.includes('.modal-overlay'), 'Classe .modal-overlay no styles.css');
ok(cssCode.includes('.history-item'), 'Classe .history-item no styles.css');
ok(cssCode.includes('.shortcut-row'), 'Classe .shortcut-row no styles.css');

// Limpeza temporária
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch (_) {}

console.log(`\n--- Resultado: ${passed} passaram, ${failed} falharam ---`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 SUCESSO: Todos os testes da Fase 9 passaram com 100% de integridade!\n');
}
