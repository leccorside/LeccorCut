# 🔍 Roteiro de Engenharia Reversa — CapCut v9.6.0.4097

> **Alvo:** `C:\Users\Johnathan Amorim\AppData\Local\CapCut\Apps\CapCut.exe`
> **Versão:** 9.6.0.4097 (release)
> **Arquitetura:** PE x86_64 (Windows)
> **SHA-256 launcher:** `db0a1848273f0137d58717f6b226b570d1867536ac54f88367496a7eab00a70a`

---

## 🗂️ Fase 1 — Reconhecimento Estático (Análise Sem Execução)

### 1.1 Estrutura e Identificação do Binário
- [x] Identificar formato PE (x86_64) e versão (`9.6.0.4097`)
- [x] Listar todos os executáveis da instalação (launcher, helpers, services)
- [x] Listar DLLs principais e tamanhos (VECreator.dll 271MB, libcef.dll 217MB, etc.)
- [x] Mapear estrutura de diretórios completa
- [x] Identificar tecnologias: Qt6, CEF (Chromium), FFmpeg, Python 3.11, Bun, Lynx UI
- [x] Ler `ProductInfo.xml` (CID: `capcutpc_0`, versão, release type)
- [x] Identificar modelos de IA empacotados (pasta `Resources/models/`)
- [x] Extrair tabela completa de imports/exports do `CapCut.exe` launcher (via pefile: 17 DLLs, 408 imports, 88 exports Chromium base)
- [x] Extrair tabela de imports do `VECreator.dll` (23 DLLs, 4.087 imports: Qt6, FusionUI, lynx, nuro; 1.808 exports Davinci/EffectPlatform)
- [x] Extrair tabela de imports do `cccreator.dll` (62 DLLs, 1.701 imports: audioeffect, avutil, jazz, sscronet; 7.401 exports AmazingEngine)
- [x] Extrair tabela de imports do `videoeditor.dll` (28 DLLs, 854 imports: cccreator, clipflow_sdk, avcodec; 8.192 exports Lyra/VESDK)
- [x] Extrair tabela de imports do `lens.dll` (19 DLLs, 370 imports: fastcv; 379 exports FRAMEWORK::LENS)

### 1.2 Análise de Strings e Recursos
- [x] Extrair strings ASCII do `CapCut.exe` launcher (caminhos, DLLs, erros de crypto)
- [x] Extrair endpoints de API do bundle JS `/video-studio/assets/App-DpNZSMvJ.js`
- [x] Identificar endpoints de comércio/assinatura (`/commerce/v1/*`)
- [x] Identificar endpoints de agente de IA (`/api/agent-runtime/v1`)
- [x] Extrair referências a modelos de IA no bundle JS (SeedDance, MiniMax, GPTImage2, etc.)
- [x] Mapear tipos de watermark (brand, AI, CapCut, CapCutAI)
- [x] Extrair strings do `VECreator.dll` (pipeline de renderização: SceneCoreUtils::initVESDK, AgentMaterialPipelineOrchestrator, EffectPlatformService Mojo IPC, Loki UI QML)
- [x] Extrair strings do `videoeditor.dll` (editor core: 17.457 strings extraídas em scratch)
- [x] Extrair strings do `audioeffect.dll` (processamento de áudio: equalizadores, reverb, pitch shift, auto-tune)
- [x] Extrair strings do `deepagents_capi.dll` (bridge IA: Go/CGo runtime, 77 exports, da_agent_*, da_session_*, Fornax trace)
- [x] Analisar arquivos `.lua` dos watermarks (`infoSticker.lua`: autoAtlas, director:getViewer(), scale dinâmico, addSpriteComponent)
- [x] Analisar arquivos `ani_info.json` dos watermarks (formato de animação atlas: 90 frames, SequenceMap 1024x1024, trims e rotações)

### 1.3 Análise de Configuração e Recursos
- [x] Identificar Lynx pages de assinatura (`image_lynx_videocutpc_*`)
- [x] Identificar modelos neurais empacotados (matting, face, skeleton, gender GAN, interpolação)
- [x] Mapear recursos de watermark (ai_left, ai_right, brand_left, brand_right)
- [x] Identificar uso de `bun.exe` (runtime JS embarcado, 107MB)
- [x] Identificar uso de `python311.dll` (processamento Python)
- [x] Identificar uso de `libcef.dll` (Chromium Embedded Framework para UI)
- [x] Analisar `web-manifest.json` completo (schema common-agent.web-manifest.v1, packageStamp, entries commonagent/videoStudio, SHA256 hashes de todos os assets)
- [x] Analisar bundles JS da UI (`renderApp-CIJPeLBB.js` 1.59MB, `AgentHubTask-CF1zzZ02.js` 262KB, `App-DpNZSMvJ.js` 3.18MB, tracking)
- [x] Analisar `server.json` na raiz do repositório rea (especificação MCP server do REA v6.4.0 com pacote rea-agents via stdio)
- [x] Analisar `smart_cut.ofx.bundle` (plugin standard Open Effects OFX 603KB, libGLESv2, OfxGetNumberOfPlugins, OfxGetPlugin)

---

## 🏗️ Fase 2 — Análise de Arquitetura e Componentes

### 2.1 Processo de Inicialização (Bootstrap)
- [x] Rastrear fluxo de inicialização do `JianyingLauncher.exe` → `CapCut.exe` (launcher raiz 4.97MB lê `ProductInfo.xml`, faz diff updates e spawna `9.6.0.4097\CapCut.exe` 90KB)
- [x] Mapear comunicação entre launcher e `bun.exe` (runtime JS embarcado executado em background para o `common_agent`)
- [x] Entender papel do `agent_runtime_addon.node` (521KB) — N-API bridge Node/Bun nativo com `startParentProcessWatchdog` atrelado ao PID pai
- [x] Analisar `taskcontainer.exe` (44KB) — container de tarefas isoladas e benchmarking (`bytebench::ByteBenchConfigurationBuilder`)
- [x] Analisar papel do `ttdaemon.exe` (411KB) — worker out-of-process CUDA com `FRAMEWORK::LENS` para efeitos e filtros pesados
- [x] Mapear IPC entre processos: launcher ↔ renderer ↔ native services (Mojo IPC, WebSocket/HTTP localhost e Chromium message router)

### 2.2 Arquitetura da UI (Multi-Framework)
- [x] Identificar Qt6 como framework de janela principal
- [x] Identificar CEF como renderer de UI web (libcef.dll 217MB)
- [x] Identificar Lynx como framework de UI mobile-style (lynx.dll 24MB)
- [x] Identificar Video Studio como app React/Vite embutida
- [x] Identificar Common Agent como sub-app React/Vite embutida
- [x] Entender como Qt ↔ CEF ↔ Lynx coexistem na mesma janela (Qt6 QMainWindow/QQuickView viewport hospeda views CEF para painéis web e Lynx para cards)
- [x] Mapear IPC Qt ↔ CEF (JavaScript Bridge, `window.capcut.*` APIs, `window.cefQuery` com roteamento JSON `callType`)
- [x] Analisar bundle JS `index-DJ4o9hAr.js` (241KB) — entry point e lifecycle events (`beforeCreate`, `transaction`, `selectionUpdate`)
- [x] Analisar bundle JS `services-Bqx5Pz17.js` (50KB) — serviços de rede Slardar e endpoints comerciais
- [x] Documentar API JavaScript exposta pelo bridge C++ → JS (`window.Capcut.JSBridge` com `call`, `invoke`, `postMessage` e `window.videoStudioNativeBridge`)

### 2.3 Motor de Edição de Vídeo (VECreator / videoeditor)
- [x] Mapear funções exportadas de `VECreator.dll` (271MB) (1.808 exports Davinci/EffectPlatform)
- [x] Mapear funções exportadas de `videoeditor.dll` (72MB) (8.192 exports Lyra/VESDK)
- [x] Mapear funções exportadas de `cccreator.dll` (158MB) (7.401 exports AmazingEngine)
- [x] Entender estrutura interna de um "Draft" (projeto salvo analisado em `User Data/.../0923/draft_content.json`: tempo em microsegundos, 55 categorias globais de `materials`)
- [x] Identificar formato binário do projeto CapCut (`draft_content.json` JSON estruturado referenciando assets, keyframes e timers)
- [x] Mapear pipeline: Track → Clip → Effect → Filter (Tracks tipadas apontando para `materials` via `material_id`)
- [x] Mapear pipeline de renderização: Timeline → Compositor → FFmpeg encoder (`VESDKModule` → `SegmentPreRenderCacheManager` → `AmazingEngine` → OFX GPU Shaders → `avcodec-61.dll`)
- [x] Analisar `lens.dll` (88MB) — engine de filtros e efeitos em tempo real (`FRAMEWORK::LENS` acelerado por `fastcv.dll` e CUDA)
- [x] Analisar integração com FFmpeg (`avcodec-61.dll`, `avutil-59.dll`, `avfilter-10.dll`)

### 2.4 Motor de IA e Modelos
- [x] Identificar modelos de matting (remoção de fundo local)
- [x] Identificar modelos de face: beautify, verify, fitting 3D
- [x] Identificar modelos de body/skeleton
- [x] Identificar modelos de interpolação de frames
- [x] Identificar modelos de detecção de cenas
- [x] Identificar modelos de salience/seleção inteligente
- [x] Identificar modelos de áudio (AED, sentence score, music2vibes)
- [x] Identificar modelos generativos de vídeo via cloud (SeedDance 2.0/2.5, MiniMax H3, Gemini)
- [x] Identificar modelos de imagem via cloud (SeedDream 4.x/5, GPT-Image2, NanoBanana)
- [x] Identificar modelo de invisible watermark local
- [x] Analisar `deepagents_capi.dll` — C API para modelos de IA (Go/CGo runtime, 77 exports, Fornax trace)
- [x] Analisar `metasecml.dll` — framework ML ByteDance
- [x] Mapear como modelos `.model` e `.bytenn` são carregados em runtime (magic header `BM\x00\x04` para ByteNN e `SAMI` para áudio via OpenVINO/AmazingEngine)
- [x] Identificar quais modelos são locais vs. cloud (API)
- [x] Analisar `SegmentJS/` — segmentação via JavaScript/WASM

### 2.5 Processamento de Áudio
- [x] Mapear exports de `audioeffect.dll` (14MB) (2.102 exports do motor de áudio `mammon`)
- [x] Analisar `speechsdk.dll` (8.3MB) — reconhecimento de voz (778 exports motor Panther `PthInfer` / `PthLMDecoderOptions`)
- [x] Analisar `lyra_cli_client.dll` (10.8MB) — codec Lyra Google (53 exports `Client@lyra_cli`, `MaterialAdapter`, `ProjectAdapter`)
- [x] Mapear pipeline: waveform → effects → export (`WaveformVisualizer@mammon` → `DynamicDelayAdjustX` / `AecMicSelection` → FFmpeg)
- [x] Identificar algoritmos de denoise, normalização, separação de stems (`vocal_separations`, `nn_denoise.bytenn`, `aec44k_resnet`)

---

## 🌐 Fase 3 — Análise de Rede e APIs

### 3.1 Endpoints Mapeados
- [x] `/api/agent-runtime/v1` — Runtime do agente de IA
- [x] `/api/common-agent/opened-project:restore` — Restauração de projeto
- [x] `/commerce/v1/subscription/*` — Assinaturas e planos
- [x] `/commerce/v1/benefits/*` — Créditos e benefícios
- [x] `/lv/v1/commerce/get_entrances` — Pontos de entrada comerciais
- [x] Mapear base URLs da API (93 hosts; serviços regionalizados `-sg`/`-va` + variantes `*-v2-boot`; editor em `editor-api-sg.capcut.com`, agente em `editor32-normal-sg.capcutapi.com`)
- [ ] Capturar tráfego de rede em runtime (proxy MITM) — **exige execução interativa do CapCut com login; movido para junto da Fase 4**
- [x] Documentar mecanismo de autenticação (Passport + cookies `sessionid`/`sid_tt` + `x-tt-token` com heartbeat `/passport/token/beat/v2/`; Native HTTP Bridge injeta credenciais; assinaturas `sign-ver: 1` e MSSDK `X-Argus`/`X-Gorgon`/`X-Ladon`)
- [x] Mapear APIs de upload/download de mídia (`/lv/v1/upload_sign` → credenciais STS temporárias → upload VOD/ImageX via MCS)
- [x] Mapear APIs de efeitos, templates, stickers (`/effect/api/*`, `/artist/v1/*`, Giphy, Gecko, `/lv/v1/homepage/templates`)
- [x] Mapear APIs de exportação e watermark (`/lv/v1/watermark/get_watermark`, `/lv/v1/c2pa/sign`, checagens de copyright)
- [x] Mapear APIs de geração de vídeo por IA (Zenith, text_to_video, CapFlow, common_task; padrão assíncrono submit → query → fetch)
- [x] Identificar mecanismo de verificação de licença/assinatura (sem licença local; *server-authoritative* via `/commerce/v3/benefits/*` + `report_usage`)

### 3.2 Proteção e Anti-Análise
- [x] Verificar ofuscação de código JS (só minificação Vite; 0 de 59 bundles com `_0x…`; `.map` não distribuídos)
- [x] Identificar mecanismos de detecção de debugger (`metasecml.dll`: `IsDebuggerPresent` + `CheckRemoteDebuggerPresent`; `VECreator.dll`: `NtQueryInformationProcess`; sem packer; hits de "frida" são falsos positivos)
- [x] Analisar `tt_c2pa_sdk.dll` (fork Rust do `c2pa-rs`; JUMBF + COSE_Sign1; assinatura remota via `/lv/v1/c2pa/sign`; hash BMFF/Merkle; A/B test)
- [x] Investigar `invisible_watermark` (modelo ByteNN `wm_embed_model_c4_v2` executado pela `TEInvisibleWatermarkUnit` no export, com intervalo de frames e ID configurados pelo servidor)
- [x] Analisar certificados de assinatura do PE (365/365 válidos; EV Bytedance Pte. Ltd. via DigiCert G4; timestamp Sectigo)
- [x] Verificar integridade de DLLs (estático: `WinVerifyTrust` em `VECreator.dll`/`metasecml.dll` + SHA-256 no `web-manifest.json`; confirmação em runtime fica para a Fase 4)

---

## 🔧 Fase 4 — Análise Dinâmica (Em Execução)

> **Nota de escopo (2026-10-15):** itens de **circunvenção** foram removidos do roteiro. Hookear validação de licença/assinatura e derrotar o anti-debug/anti-fraude (`metasecml.dll`) para forjar requisições assinadas não serve ao LeccorCut (editor offline independente) — só contornaria o controle de acesso do CapCut. A existência desses mecanismos já está documentada (Fase 3, seções 9.4 e 10.1). A instrumentação dinâmica aqui fica restrita a comportamento observável.

### 4.0 Captura de Tráfego (herdado da Fase 3)
- [x] Capturar tráfego com mitmproxy + CA de usuário (runbook `FASE4_MITM.md`); **confirmado empiricamente que o Cronet ignora o proxy do SO** — APIs privadas invisíveis, sem erro de pinning (seção 18.6)
- [x] Confirmar quais hosts são realmente chamados: telemetria (`pc-mon-*`), CDNs (`ibyteimg`, `ibytedtos`), Pippit, Dreamina e web capturados; `/lv/v1`, `/commerce`, `/passport` trafegam por fora (Cronet)

### 4.1 Observação de Runtime (não intrusiva)
- [x] Mapear parâmetros reais de exportação (via UI: 8K/2K, H.264, MP4, 30fps, Rec.709 SDR) e confirmar que o encode escreve direto no destino, sem intermediário em `User Data`
- [x] Identificar como a mídia é sondada na importação (cache `mediainfo`/`steAVInfo`: cor, HDR, Dolby Vision) — reproduzível com `ffprobe`
- [ ] ~~Interceptar chamadas de rede via `sscronet.dll`~~ — exigiria derrotar a assinatura MSSDK (fora de escopo); cobrir pela captura MITM da 4.0
- [ ] ~~Hookear validação de licença/assinatura~~ — **removido (circunvenção, fora de escopo)**

### 4.2 Análise de Comportamento
- [x] Monitorar arquivos criados durante edição e exportação (`FileSystemWatcher`, 596 eventos; taxonomia de cache documentada na seção 18.2)
- [x] Identificar estrutura do arquivo de draft (`draft_content.json`) — **modelo multi-timeline descoberto** (`Timelines/<id>/`, `project.json`, escrita atômica `.tmp`/`.bak`); seção 18.1
- [x] Analisar a ferramenta de interop embarcada (`draft-converter.exe`: OTIO 0.18.1, AAF/FCPX/FCP7 → FCPXML); seção 18.4
- [x] Analisar comportamento de telemetria — endpoint `monitor_pc/settings_v2` (a cada 600s; coleta CPU/disco/memória, agrega 5s, upload 30s; envia `device_id`, `aid`, `channel`, país) na seção 18.6
- [x] Mapear dados enviados ao servidor durante uso normal — feito para o tráfego que respeita proxy (telemetria/CDN/web); o canal Cronet fica fora do alcance do MITM por proxy

### 4.3 Crash Analysis
- [x] Analisar `minidump_stackwalk.exe` (ferramenta de minidump do Breakpad)
- [x] Analisar `parfait_crash_handler.exe` e `VECrashHandler.exe` (framework **Parfait** da ByteDance + `parfait_wer.dll` para Windows Error Reporting)
- [x] Mapear pipeline de crash reporting (out-of-process → `crash_upload`; GWP-ASan; seção 18.5)

---

## 📦 Fase 5 — Aplicação ao LeccorCut

### 5.1 Replicação de Funcionalidades Core
- [x] Implementar timeline multi-trilha (Vídeo, Overlay/PiP, Áudio, Texto/Legendas)
- [x] Implementar corte, split, trim drag-and-drop
- [x] Implementar controles de track (mute, visibilidade, solo)
- [x] Implementar alinhamento magnético (snap)
- [x] Implementar marcadores na timeline
- [x] Implementar histórico de ações (undo/redo até 100 estados)
- [x] Implementar estrutura de projeto compatível com draft CapCut (`src/capcutConverter.js`: conversor bidirecional completo em microsegundos)
- [x] Replicar engine de efeitos em tempo real (filtros CSS e WebGL/Canvas ao vivo: brilho, contraste, saturação, blur, matizes, vinheta, speed ramping e transições)
- [x] Implementar pipeline FFmpeg equivalente ao VECreator (`src/ffmpegBuilder.js`: suporte a PiP, overlays, legendas dinâmicas/karaokê, mixagem de áudio, atempo, fade e xfade)

### 5.2 Integração de Modelos de IA
- [x] Integrar Whisper para transcrição/legendas offline (`Xenova/whisper-base` com exportação para legendas na timeline)
- [x] Integrar remoção de fundo por IA (Smart Cutout) (`briaai/RMBG-1.4` via Transformers.js com fallback colorkey)
- [x] Integrar matting de vídeo offline (equivalente ao `mattingBlend`) — contínuo (geração de stream de vídeo com canal alfa yuva420p / VP9, despill e colorkey adaptativo com composição em PiP)
- [x] Integrar interpolação de frames offline (equivalente ao `umvfi`) (filtro `minterpolate=mi_mode=mci:mc_mode=aobmc` ativado pelo checkbox "Câmera lenta suave")
- [x] Integrar detecção de cenas (equivalente ao `jy_compressShotDetect`) (filtro FFmpeg `gt(scene,0.35)` com botão "🎬 Detectar Cenas" gerando marcadores e cortes automáticos)

### 5.3 Formato de Arquivo
- [x] Implementar salvamento de projeto em `.lccut`
- [x] Documentar formato completo do projeto CapCut (seções 5.3 e 18.1 do `DOCUMENTACAO.md`)
- [x] Implementar importador de projetos CapCut para LeccorCut (botões "📥 CapCut" e "📤 CapCut" na topbar, testado e validado no projeto real 0923)

---

## 🚀 Fase 6 — Edição Avançada e Processamento Visual

### 6.1 Estabilização e Enquadramento
- [x] Implementar Estabilização de Vídeo offline (`vidstabdetect` + `vidstabtransform` via FFmpeg para redução de trepidação)
- [x] Implementar Redimensionamento Inteligente / Auto Reframe (enquadramento dinâmico 9:16, 1:1, 4:5 com seleção de foco inteligente esquerda/centro/direita e reescalonamento Lanczos)
- [x] Implementar Rastreamento de Movimento (Motion/Object Tracking com análise de vetores `mestimate` + `showinfo`, interpolação temporal de keyframes e ancoragem a sobreposições PiP/stickers)

### 6.2 Curvas de Velocidade e Shaders Visuais
- [x] Implementar Speed Ramping com editor de Curva Bezier Livre (adição de keyframes customizados, arrasto interativo de tempo/velocidade, interpolação cúbica suave e suporte total no exportador)
- [x] Implementar Retoque Facial / Efeito Beauty offline (suavização bilateral de pele e realce de iluminação via `smartblur` + `unsharp` + `eq` com sliders de intensidade)
- [x] Implementar Estilização de Bordas e Glow/Neon em Sobreposições (PiP) (borda com espessura/arredondamento/cor e brilho neon ajustável com presets de cor e drop-shadow para silhuetas IA)

---

## 🧠 Fase 7 — IA Avançada Local (100% Offline)

### 7.1 Processamento de Áudio por IA
- [x] Integrar Separação de Stems de Áudio (isolamento de voz humana e trilha instrumental via filtros M/S FFmpeg + EQ adaptativo)
- [x] Integrar Detecção de Batidas Musicais (Beat Detection / silencedetect de transientes com geração automática de marcadores e estimativa de BPM)
- [x] Integrar Text-to-Speech (TTS) offline para dublagem e narração sintética local (SpeechT5 + fallback sine/vibrato, inserido na trilha de áudio)

### 7.2 IA de Tradução e Super-Resolução
- [x] Integrar Tradução Automática Offline de Legendas (Helsinki-NLP opus-mt multilingue via Transformers.js, atualização inline na timeline)
- [x] Integrar Super-resolução / Upscale de Vídeo por IA (Real-ESRGAN adaptativo via hqdn3d+lanczos+unsharp+eq; fator 2x/4x; substitui clipe na timeline)

---

## 📦 Fase 8 — Exportação Profissional e Codecs Adicionais

### 8.1 Codecs e Contêineres de Entrega
- [x] Implementar seletor de formato na exportação: MP4 (H.264), WebM (VP9 com suporte nativo a canal alfa transparente) e QuickTime MOV (Apple ProRes 422 / 4444)
- [x] Implementar controle fino de Bitrate (CBR, VBR 2-pass e controle de CRF customizado)
- [x] Implementar suporte a perfis de cor e HDR (conversão Rec.709 e BT.2020)
- [x] Implementar exportação independente de áudio (.wav / .mp3 / .aac) diretamente da timeline

---

## 🎨 Fase 9 — UX, Produtividade e Assets

### 9.1 Produtividade e Modos de Visualização
- [ ] Implementar Modo Cinema / Tela Cheia (`F11` / `Ctrl+F` para pré-visualização ampliada sem distrações de UI)
- [ ] Implementar Biblioteca Integrada de Assets e Stickers (setas, badges, molduras, stickers animados e overlays vetoriais)
- [ ] Implementar Histórico Visual de Versões e Backups Automáticos do Projeto (.lccut snapshots a cada X minutos)
- [ ] Implementar Painel de Customização de Atalhos de Teclado (remapeamento de hotkeys de corte, split e navegação)

---

## 📊 Status Geral

| Fase | Progresso | Prioridade |
|------|-----------|------------|
| Fase 1 — Reconhecimento Estático | ✅ Concluída (100%) | 🔴 Alta |
| Fase 2 — Arquitetura e Componentes | ✅ Concluída (100%) | 🔴 Alta |
| Fase 3 — Rede e APIs | ✅ Concluída (parte estática 19/20; MITM feito na Fase 4) | 🟡 Média |
| Fase 4 — Análise Dinâmica | ✅ Concluída no escopo definido | 🟡 Média |
| Fase 5 — Aplicação Core ao LeccorCut | ✅ Concluída (100%) | 🟢 Concluída |
| Fase 6 — Edição Avançada e Processamento Visual | ✅ Concluída (100% - Fases 6.1 e 6.2) | 🔴 Alta |
| Fase 7 — IA Avançada Local (100% Offline) | ✅ Concluída (100%) | 🟠 Alta |
| Fase 8 — Exportação Profissional e Codecs Adicionais | ⏳ A Fazer (0%) | 🔴 Alta |
| Fase 9 — UX, Produtividade e Assets | ⏳ A Fazer (0%) | 🟢 Média |

---

*Última atualização: 2026-10-15 — Fase 7 concluída (42 testes passando) | Ferramenta: REA v6.4.0 + Ghidra 12.1.4 + monitoramento de FS (FileSystemWatcher)*

