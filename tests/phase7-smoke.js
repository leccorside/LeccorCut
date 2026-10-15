/**
 * Fase 7 — IA Avancada Local: Smoke Tests
 */
const fs = require("fs");
const path = require("path");
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  OK " + name); passed++; }
  catch(e) { console.error("  FAIL " + name + ": " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

const root = path.join(__dirname, "..");
const mainJs = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
const preloadJs = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");
const rendererJs = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

console.log("\n=== Fase 7 - IA Avancada Local: Smoke Tests ===");

// 7.1a stems
test("handler stem-separate no main.js", () => assert(mainJs.includes("ipcMain.handle('stem-separate'"), "ausente"));
test("filtro vocal M/S implementado", () => assert(mainJs.includes("pan=stereo|c0=0.5*c0-0.5*c1"), "ausente"));
test("filtro instrumental implementado", () => assert(mainJs.includes("pan=stereo|c0=0.5*c0+0.5*c1"), "ausente"));
test("API stemSeparate no preload", () => assert(preloadJs.includes("stemSeparate:"), "ausente"));
test("listener onStemProgress no preload", () => assert(preloadJs.includes("onStemProgress:"), "ausente"));
test("botao btnStemSep no HTML", () => assert(indexHtml.includes('id="btnStemSep"'), "ausente"));
test("initStemSeparation no renderer", () => assert(rendererJs.includes("function initStemSeparation()"), "ausente"));

// 7.1b beat detect
test("handler beat-detect no main.js", () => assert(mainJs.includes("ipcMain.handle('beat-detect'"), "ausente"));
test("silencedetect implementado", () => assert(mainJs.includes("silencedetect=noise="), "ausente"));
test("estimatedBpm retornado", () => assert(mainJs.includes("estimatedBpm"), "ausente"));
test("API beatDetect no preload", () => assert(preloadJs.includes("beatDetect:"), "ausente"));
test("botao btnBeatMarks no HTML", () => assert(indexHtml.includes('id="btnBeatMarks"'), "ausente"));
test("marcadores de batida no renderer", () => assert(rendererJs.includes("label: '🥁'") || rendererJs.includes("label: '\u{1F941}'"), "ausente"));
test("initBeatDetect no renderer", () => assert(rendererJs.includes("function initBeatDetect()"), "ausente"));

// 7.1c TTS
test("handler tts-speak no main.js", () => assert(mainJs.includes("ipcMain.handle('tts-speak'"), "ausente"));
test("modelo speecht5_tts referenciado", () => assert(mainJs.includes("Xenova/speecht5_tts"), "ausente"));
test("WAV header PCM construido", () => assert(mainJs.includes("RIFF") && mainJs.includes("WAVE"), "ausente"));
test("fallback TTS com sine/vibrato", () => assert(mainJs.includes("vibrato=f=5"), "ausente"));
test("API ttsSpeak no preload", () => assert(preloadJs.includes("ttsSpeak:"), "ausente"));
test("textarea ttsText no HTML", () => assert(indexHtml.includes('id="ttsText"'), "ausente"));
test("initTts no renderer", () => assert(rendererJs.includes("function initTts()"), "ausente"));

// 7.2a traducao
test("handler translate-subtitles no main.js", () => assert(mainJs.includes("ipcMain.handle('translate-subtitles'"), "ausente"));
test("modelo opus-mt referenciado", () => assert(mainJs.includes("Xenova/opus-mt-"), "ausente"));
test("cache de tradutores implementado", () => assert(mainJs.includes("translatorCache"), "ausente"));
test("API translateSubtitles no preload", () => assert(preloadJs.includes("translateSubtitles:"), "ausente"));
test("botao btnTranslate no HTML", () => assert(indexHtml.includes('id="btnTranslate"'), "ausente"));
test("botao btnTranslateSubs no HTML", () => assert(indexHtml.includes('id="btnTranslateSubs"'), "ausente"));
test("atualizacao inline de textos no renderer", () => assert(rendererJs.includes("textItem.text = translated.text"), "ausente"));
test("initTranslation no renderer", () => assert(rendererJs.includes("function initTranslation()"), "ausente"));

// 7.2b super-res
test("handler super-resolve no main.js", () => assert(mainJs.includes("ipcMain.handle('super-resolve'"), "ausente"));
test("pipeline hqdn3d+lanczos+unsharp+eq", () => {
  assert(mainJs.includes("hqdn3d=3:3:6:6"), "denoising ausente");
  assert(mainJs.includes("flags=lanczos"), "lanczos ausente");
  assert(mainJs.includes("unsharp=5:5:1.5"), "unsharp ausente");
});
test("substituicao do clipe na timeline", () => assert(rendererJs.includes("targetClip.path = res.path"), "ausente"));
test("API superResolve no preload", () => assert(preloadJs.includes("superResolve:"), "ausente"));
test("select srScale no HTML", () => assert(indexHtml.includes('id="srScale"'), "ausente"));
test("barra de progresso srProgress no HTML", () => assert(indexHtml.includes('id="srProgress"'), "ausente"));
test("initSuperResolution no renderer", () => assert(rendererJs.includes("function initSuperResolution()"), "ausente"));

// CSS e aba IA
test("classe .ai-section no CSS", () => assert(stylesCss.includes(".ai-section"), "ausente"));
test("classe .ai-progress-bar no CSS", () => assert(stylesCss.includes(".ai-progress-bar"), "ausente"));
test("classe .beat-btn no CSS", () => assert(stylesCss.includes(".beat-btn"), "ausente"));
test("aba #tabAi no HTML", () => assert(indexHtml.includes('id="tabAi"'), "ausente"));
test("view #aiView no HTML", () => assert(indexHtml.includes('id="aiView"'), "ausente"));
test("initAiTab no renderer", () => assert(rendererJs.includes("function initAiTab()"), "ausente"));

console.log("\n--- Resultado: " + passed + " passaram, " + failed + " falharam ---");
if (failed > 0) { console.error("FALHA: " + failed + " testes da Fase 7 falharam"); process.exit(1); }
else console.log("SUCESSO: Todos os testes da Fase 7 passaram!");
