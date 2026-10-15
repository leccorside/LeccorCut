# 🧠 Contexto — Projeto LeccorCut vs CapCut (Engenharia Reversa)

> Este documento serve como **memória de contexto** para sessões de IA.
> Resumo do que foi feito, o que está em andamento e o que falta.

---

## 🎯 Objetivo do Projeto

Desenvolver o **LeccorCut** — um editor de vídeo desktop moderno, independente e open-source —
tomando o **CapCut v9.6.0.4097** como referência de funcionalidades e arquitetura,
via engenharia reversa estática com as ferramentas **REA v6.4.0** + **Ghidra 12.1.4**.

---

## 🔬 Alvo da Engenharia Reversa

| Campo | Valor |
|---|---|
| Aplicativo | CapCut PC |
| Versão | **9.6.0.4097** |
| Path | `C:\Users\Johnathan Amorim\AppData\Local\CapCut\Apps\CapCut.exe` |
| Arquitetura | PE x86_64 (Windows) |
| SHA-256 | `db0a1848273f0137d58717f6b226b570d1867536ac54f88367496a7eab00a70a` |
| Ferramenta principal | REA MCP v6.4.0 (configurado globalmente) |
| Disassembler | Ghidra 12.1.4 @ `C:\tools\ghidra_12.1.4_PUBLIC` |
| Java | JDK 21 @ `C:\Program Files\Java\jdk-21` |

> ⚠️ **Limitação conhecida:** O addon nativo Windows do REA (`rea-windows-x64.node`)
> requer compilação cross em Linux/MinGW e não está disponível pré-compilado.
> O Ghidra headless está funcional — a análise por Ghidra direto pode ser usada como alternativa.

---

## ✅ O que já foi feito (Engenharia Reversa)

### Análise Estática — Concluído

- **Identificação completa do binário**: formato PE x86_64, versão, CID, SHA-256
- **Mapeamento de toda a estrutura de instalação**: todos os diretórios e arquivos
- **Inventário de executáveis**: 14 executáveis mapeados com tamanhos e funções
- **Inventário de DLLs**: 26+ DLLs críticas mapeadas com tamanhos e funções prováveis
- **Tecnologias identificadas**:
  - Qt 6.x (janela nativa)
  - CEF / Chromium Embedded (UI web)
  - Lynx framework ByteDance (UI mobile-style)
  - Bun runtime (JS embarcado, 107MB)
  - Python 3.11 (scripts)
  - FFmpeg (avcodec-61, avfilter-10)
  - Intel OpenVINO (inferência IA)
  - BoringSSL (criptografia)
  - Cronet/QUIC (rede)
  - C2PA SDK (proveniência de conteúdo)
  - SVT-AV1 (encoder AV1)
  - Lyra (codec áudio Google)
- **Extração de strings do launcher** (`CapCut.exe` 4.97MB): imports, DLLs, erros de crypto
- **Extração de 17.457 strings do `videoeditor.dll`** (72MB): formato de projeto interno mapeado
- **Extração de 150 strings do `cccreator.dll`** (158MB): feature flags do engine de efeitos
- **Extração de endpoints de API do bundle JS** (`App-DpNZSMvJ.js`, 3.2MB):
  - `/api/agent-runtime/v1`
  - `/commerce/v1/subscription/*`
  - `/commerce/v1/benefits/*`
  - `/lv/v1/commerce/get_entrances`
- **Extração de identificadores de modelos de IA cloud** (SeedDance 1.5/2.0/2.5, MiniMax H3, Gemini, GPT-Image2)
- **Mapeamento de 45+ modelos de IA locais empacotados** (matting, face, skeleton, audio, etc.)
- **Mapeamento da arquitetura de UI multi-framework** (Qt → CEF → React/Vite + Lynx)
- **Mapeamento do sistema de watermarks** (brand, AI, invisible, C2PA)
- **Identificação do formato interno de projeto** (campos JSON de segmento/clipe via strings do videoeditor.dll)
- **Identificação do sistema Lua de migração de versão** de projetos

- **Extração de tabelas completas de imports/exports PE**:
  - `CapCut.exe`: 17 DLLs / 408 imports, 88 exports Chromium base.
  - `cccreator.dll`: 62 DLLs / 1.701 imports, 7.401 exports AmazingEngine.
  - `videoeditor.dll`: 28 DLLs / 854 imports, 8.192 exports Lyra/VESDK.
  - `lens.dll`: 19 DLLs / 370 imports, 379 exports FRAMEWORK::LENS.
  - `VECreator.dll`: 23 DLLs / 4.087 imports, 1.808 exports Davinci/EffectPlatform.
- **Análise do DeepAgents C-API (`deepagents_capi.dll`)**:
  - Go runtime + CGo trampolines, 77 exports C-API (`da_agent_*`, `da_session_*`, `da_tool_call_*`, Fornax trace).
- **Análise do Sistema de Watermark**:
  - Lua scripts (`infoSticker.lua`), atlas spritesheets 1024x1024 com 90 frames (`ani_info.json`, `heycanInfo.json`).
- **Análise de Interoperabilidade e Plugins**:
  - Plugin standard Open Effects (`smart_cut.ofx.bundle`) acelerado via OpenGL ES 2.0 / `libGLESv2.dll`.
  - Adaptadores OpenTimelineIO nativos encontrados (`otio_aaf`, `otio_fcpx_xml`, `otio_fcp`).
  - Especificação e verificação estrita de integridade via `web-manifest.json` com SHA-256 hashes.
- **Análise do Pipeline VECreator**:
  - `SceneCoreUtils::initVESDK`, `agent::AgentMaterialPipelineOrchestrator`, `EffectPlatformService` Mojo IPC, UI QML integrada (`LokiAuthorPopupWindow.qml`).
- **Arquitetura de Bootstrap e Processos (Fase 2.1)**:
  - Launcher `CapCut.exe` (4.97MB) despacha `9.6.0.4097\CapCut.exe` (90KB).
  - Processos auxiliares: `VEDetector.exe` (GPU NVIDIA/AMD), `VEHelper.exe` (telemetria), `ttdaemon.exe` (CUDA/Lens worker), `bun.exe` (backend common_agent) e watchdog nativo `agent_runtime_addon.node`.
- **Arquitetura da UI & JavaScript Bridge (Fase 2.2)**:
  - Janela Qt6 hospeda CEF (`libcef.dll`) para o Video Studio / Agent Hub e Lynx para cards móveis.
  - Bridge trifuncional: `window.cefQuery` (JSON router), `window.Capcut?.JSBridge` (`call`, `invoke`, `postMessage`) e `window.videoStudioNativeBridge`.
  - Mapeadas 14 chamadas principais de host e ciclo de vida de transações da timeline.
- **Motor de Edição e Formato Real de Draft (Fase 2.3)**:
  - `draft_content.json` real inspecionado: base temporal em microsegundos ($\mu s$), tracks tipadas referenciando 55 tabelas globais de `materials` por `material_id`.
  - Pipeline de renderização: `VESDKModule` → `SegmentPreRenderCacheManager` → `AmazingEngine` → OFX GPU Shaders → FFmpeg.
- **Subsistema de Áudio e Fala (Fase 2.5)**:
  - Motor `mammon` (`audioeffect.dll`): amostragem de waveforms (`WaveformVisualizer`), buffers circulares e cancelamento de eco.
  - Reconhecimento de fala offline Panther (`speechsdk.dll`): inferência `PthInfer` com decodificador de linguagem para legendas automáticas.
- **Formatos Binários de Redes Neurais (Fase 2.4)**:
  - Modelos ByteNN com magic header `BM\x00\x04` (`.bytenn`) e modelos de áudio SAMI com magic header `SAMI` (`.model`).

### Arquivos Gerados
- [PASSOS.md](file:///d:/0000000-PROJETOS/LeccorCut/PASSOS.md) — Roteiro com checkboxes (Fases 1 e 2 100% concluídas)
- [DOCUMENTACAO.md](file:///d:/0000000-PROJETOS/LeccorCut/DOCUMENTACAO.md) — Documentação técnica completa (Seções 1 a 17)
- [CONTEXTO.md](file:///d:/0000000-PROJETOS/LeccorCut/CONTEXTO.md) — Memória de contexto atualizada

---

## ❌ O que ainda falta (Engenharia Reversa — Fases 3, 4 e 5)

### Alta Prioridade (Fase 3 — Rede e APIs)
- [ ] Mapear fluxo de autenticação e tokens (TikTok/CapCut OAuth, Bearer tokens)
- [ ] Mapear base URLs e domínios de produção (`feed-api-sg.capcutapi.com`, `pc-mon-va.byteoversea.com`)
- [ ] Interceptar chamadas reais via proxy MITM (Fiddler/mitmproxy) durante renderização e IA cloud
- [ ] Mapear endpoints de upload de mídia e geração de efeitos generativos (SeedDance, MiniMax)

### Média Prioridade (Fase 4 — Dinâmica e Frida)
- [ ] Instrumentação via Frida para inspecionar chamadas nativas em `audioeffect.dll` e `cccreator.dll`
- [ ] Inspecionar runtime do `bun.exe` e portas IPC locais ativas durante execução

### Baixa Prioridade (Fase 5 — Re-implementação no LeccorCut)
- [ ] Implementar parser/conversor de `draft_content.json` do CapCut para a timeline do LeccorCut
- [ ] Adicionar suporte a OpenTimelineIO no LeccorCut
- [ ] Implementar visualizador de waveforms nativo inspirado no `WaveformVisualizer`

---

## ✅ O que já foi implementado no LeccorCut

O LeccorCut (`D:\0000000-PROJETOS\LeccorCut`) já implementa:

### Timeline e Edição
- ✅ Timeline multi-trilha: Vídeo Principal, Sobreposição (PiP), Áudio, Texto/Legendas
- ✅ Track headers com botões de visibilidade e mute
- ✅ Corte preciso (`S`), split na agulha
- ✅ Reorganização por drag-and-drop
- ✅ Redimensionamento/trim pelas alças laterais
- ✅ Congelar quadro (Freeze Frame, tecla `F`)
- ✅ Separar áudio do vídeo (unlink)
- ✅ Alinhamento magnético / Snap (tecla `N`)
- ✅ Marcadores na timeline (tecla `M`)
- ✅ Histórico completo: Undo/Redo até 100 estados (`Ctrl+Z`, `Ctrl+Y`)

### Sobreposição e PiP
- ✅ Múltiplos vídeos e imagens sobrepostos
- ✅ Escala (10%–100%), posicionamento, opacidade
- ✅ Rotação angular (-180° a +180°)
- ✅ Espelhamento horizontal (Flip)
- ✅ Animações de entrada e movimento (Fade In/Out, Slide, Zoom In, Float)
- ✅ Suavização Smoothstep
- ✅ Chroma Key (remoção por cor)

### Áudio
- ✅ Trilha de áudio independente com waveform
- ✅ Fade In / Fade Out
- ✅ Redução de ruído (Denoise / afftdn)
- ✅ Normalização EBU R128 (-14 LUFS)
- ✅ Controle de volume dedicado

### Texto e Legendas
- ✅ Trilha de texto/legendas arrastável no preview
- ✅ Animações (Fade, Slide Up, Pop/Zoom In)
- ✅ Estilos avançados

### IA e Transcrição
- ✅ Transcrição local com Whisper (OpenAI / Transformers.js) — 100% offline
- ✅ Legendas Karaokê (Word Highlight)
- ✅ Legendas Palavra por Palavra (Acumulativo)
- ✅ Estilo Viral / Hormozi (Single Word)
- ✅ Smart Cutout (remoção de fundo por IA — briaai/RMBG-1.4)
- ✅ Importação de `.srt`
- ✅ Estilização em massa de legendas

### Efeitos e Ajustes
- ✅ Speed Ramping com curvas (Heroico, Bala, Montagem, Flash In, Flash Out)
- ✅ Gráfico SVG de curva de velocidade em tempo real
- ✅ Transições: fade, dissolve, wipeleft, slideleft, circleopen, pixelize
- ✅ Filtros e presets de cor (sepia, vintage, warm, cool, cinematic, vivid)
- ✅ Vinheta cinematográfica
- ✅ Canvas Blur (enquadramento com desfoque de fundo para Reels/Shorts)
- ✅ Brilho, contraste, saturação, desfoque, P&B, velocidade linear
- ✅ Espelhamento H/V, rotações 90°/180°/270°, zoom digital

### Exportação e Formatos
- ✅ Quick Presets: TikTok/Reels/Shorts (9:16), YouTube (16:9), Feed (1:1), Retrato (4:5)
- ✅ Resoluções: 720p, 1080p, 1440p (2K), 2160p (4K)
- ✅ FPS: 24, 30, 60
- ✅ Renderização via FFmpeg nativo (H.264/AAC)
- ✅ Pipeline filter_complex modular (ffmpegBuilder.js)
- ✅ Projetos salváveis em `.lccut`
- ✅ Atalhos de teclado completos

---

## ❌ O que falta implementar no LeccorCut

### Funcionalidades de Edição
- [ ] Speed ramping com keyframes individuais (curvas customizadas, não apenas presets)
- [ ] Rastreamento de objetos (Object Tracking) na timeline
- [ ] Detecção automática de cenas (Shot Detection)
- [ ] Interpolação de frames (Frame Interpolation / VFI)
- [ ] Matting de vídeo em tempo real (Background Removal em vídeo)
- [ ] Efeitos de face em tempo real (beautify, stickers faciais)
- [ ] Estabilização de vídeo (Video Stabilization)
- [ ] Redimensionamento inteligente (Smart Crop / Auto Reframe)

### IA Avançada (Local)
- [ ] Separação de stems de áudio (voz + fundo musical)
- [ ] Dubbing / Clonagem de voz por IA
- [ ] Tradução automática de legendas
- [ ] Geração de música por IA (Music2Vibes / AI beats)
- [ ] Super-resolução / Upscale de vídeo

### Recursos de Mídia
- [ ] Biblioteca de templates de efeitos
- [ ] Biblioteca de stickers e assets
- [ ] Importação de projetos CapCut (`.capcut` / draft)
- [ ] Exportação para formatos adicionais (WebM, ProRes, etc.)
- [ ] Suporte a múltiplas câmeras / multicam

### UX e Interface
- [ ] Preview de alta qualidade em tempo real (GPU-accelerated)
- [ ] Painel de propriedades contextual completo
- [ ] Histórico visual de versões do projeto
- [ ] Integração com cloud storage
- [ ] Interface em tela cheia / modo cinema

---

## 🗺️ Arquitetura Atual do LeccorCut

```
LeccorCut/
├── src/
│   ├── main.js          # Processo Electron principal + IPC + IA (Whisper, RMBG)
│   ├── preload.js       # Context bridge Node ↔ Renderer
│   ├── index.html       # UI (layout dark mode)
│   ├── styles.css       # Design system HSL
│   ├── renderer.js      # Timeline, preview, estado reativo, interações
│   └── ffmpegBuilder.js # Montador modular do filter_complex FFmpeg
├── tests/
│   ├── export-smoke.js  # Teste de renderização FFmpeg
│   └── cutout-smoke.js  # Teste do pipeline Smart Cutout
└── scripts/
    └── generate-icons.js
```

### Stack Tecnológica do LeccorCut
| Camada | Tecnologia |
|---|---|
| Shell | Electron |
| UI | HTML/CSS/JS vanilla |
| Vídeo nativo | FFmpeg (CLI) |
| IA local | Transformers.js (Whisper + RMBG-1.4) |
| Empacotamento | electron-builder + NSIS |

---

## 🔑 Diferenças de Arquitetura: LeccorCut vs CapCut

| Aspecto | LeccorCut | CapCut |
|---|---|---|
| Shell | Electron (Node.js) | Qt6 + CEF + Lynx |
| UI | HTML/CSS/JS vanilla | React/Vite (web) + Qt (nativo) |
| Render engine | FFmpeg CLI | VECreator.dll (C++ nativo) |
| Efeitos tempo real | ❌ Não implementado | lens.dll (GPU AGFX) |
| IA local | Transformers.js | deepagents_capi.dll + OpenVINO |
| Modelos locais | 2 (Whisper + RMBG) | 45+ modelos |
| Cloud AI | ❌ Não | SeedDance, MiniMax, Gemini, etc. |
| Rede | ❌ Offline | Cronet (HTTP3/QUIC) |
| Watermark | Opcional/sem | 4 tipos (brand, AI, invisible, C2PA) |
| Tamanho aprox. | ~50 MB | ~1.2 GB |

---

## 📋 Próximos Passos Recomendados

1. **Imediato**: Usar Ghidra headless para extrair exports do `videoeditor.dll` e mapear o formato de draft completo
2. **Curto prazo**: Capturar tráfego de rede do CapCut com proxy MITM para documentar APIs completas
3. **Médio prazo**: Implementar detecção de cenas e object tracking no LeccorCut
4. **Longo prazo**: Migrar engine de renderização de FFmpeg CLI para pipeline nativo C++/WebGPU

---

*Atualizado em: 2026-10-15 | Versão da análise: REA v6.4.0 + Ghidra 12.1.4*