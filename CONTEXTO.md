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

- **Rede, APIs e Proteções (Fase 3 — parte estática, 2026-10-15)**:
  - Varredura estática de bundles JS + strings C das DLLs: **93 hosts**, ~200 paths em JS e ~370 paths nativos (`VECreator.dll`/`VEHelper.exe`). Detalhes nas seções 9.3–9.9 da documentação.
  - Hosts por serviço, regionalizados (`-sg`/`-va`/`-va-us`), com variantes de bootstrap `*-v2-boot.capcutapi.com` e domínios dinâmicos via TNC (`/get_domains/v5/`).
  - Auth: Passport (cookies `sessionid`/`sid_tt` + `x-tt-token`, heartbeat `/passport/token/beat/v2/`). O backend Bun **não vê credenciais**: recebe um `host-auth-context.v1` e faz HTTP pelo **Native HTTP Bridge**, que injeta cookie, token e assinaturas MSSDK (`X-Argus`/`X-Gorgon`/`X-Ladon`). Há ainda uma assinatura de app `sign-ver: 1` (MD5 com salt) feita no JS.
  - Upload: `/lv/v1/upload_sign` → credenciais STS temporárias → upload VOD/ImageX (MCS).
  - IA cloud assíncrona (submit/query/fetch): Zenith, text_to_video, CapFlow, common_task, TTS/clone de voz.
  - Licença: **não existe licença local**; tudo é *server-authoritative* (`/commerce/v3/benefits/*`, `report_usage`, `check_withhold_deduct`).
  - Proteções: anti-debug concentrado no `metasecml.dll`; sem packer; JS só minificado (sem `.map`); 365/365 binários com Authenticode válido (EV Bytedance Pte. Ltd., DigiCert G4).
  - C2PA: fork Rust do `c2pa-rs` com **assinatura remota** (`/lv/v1/c2pa/sign`), JUMBF + COSE_Sign1, hash BMFF/Merkle, ativado por A/B.
  - Watermark invisível: modelo ByteNN `wm_embed_model_c4_v2` executado pela `TEInvisibleWatermarkUnit` no export, com ID e intervalo de frames vindos do servidor.

- **Análise Dinâmica / Comportamental (Fase 4 — parte não intrusiva, 2026-10-15)**:
  - Monitoramento de FS (`FileSystemWatcher`, 596 eventos, durante um export) + inspeção de artefatos em disco. Detalhes na seção 18 da documentação.
  - **Formato de projeto é multi-timeline**: pasta com `draft_content.json` plano (compat) + `Timelines/<uuid>/draft_content.json` (conteúdo real) + `Timelines/project.json` (índice com `main_timeline_id`). Escrita atômica via `template-*.tmp` + `.bak`. Importador do LeccorCut deve ler a timeline principal e cair para o plano como fallback.
  - Export: o CapCut **codifica direto no destino** (sem intermediário em `User Data`). Parâmetros observados na UI: 8K/2K, H.264, MP4, 30fps, Rec.709 SDR.
  - Caches de edição: `frameThumbnail/<hash>/82x46/<µs>.jpg`, `audioWave/*.waveDataV2`, `importcache3/mediainfo/*.json` (sondagem tipo ffprobe com cor/HDR/DoVi), SQLite de índice (`ILASDKDB`, `ressdk_db`).
  - Interop: `draft-converter.exe` = OpenTimelineIO 0.18.1 + adapters AAF/FCPX/FCP7 (AAF/Premiere XML → FCPXML → import). Define o caminho da Fase 5.3.
  - Crash: framework **Parfait** da ByteDance (`VECrashHandler.exe`, `parfait_*`, `minidump_stackwalk`, GWP-ASan, `crash_upload`).
  - **Privacidade:** todo draft embute `device_id`, `mac_address` (hash) e `hard_disk_id`.
  - **Escopo:** itens de circunvenção (hook de licença, derrotar anti-fraude) foram **deliberadamente deixados de fora** — não servem a um editor offline.
  - **Captura MITM executada (seção 18.6):** confirmado empiricamente que **o Cronet ignora o proxy do SO** — login/`/lv/v1`/`/commerce`/`/passport` invisíveis, sem nem erro de pinning. Capturou-se só o que respeita proxy: telemetria `pc-mon-*` (endpoint `monitor_pc/settings_v2`, a cada 600s, coleta CPU/disco/memória, envia `device_id`/`aid`/país), CDNs ByteDance, Pippit, Dreamina e web. Ler o canal Cronet exigiria hook de TLS no `libcronet` — fora de escopo.

### Arquivos Gerados
- [PASSOS.md](file:///d:/0000000-PROJETOS/LeccorCut/PASSOS.md) — Roteiro com checkboxes (Fases 1 e 2 concluídas; Fase 3 estática concluída; Fase 4 só com MITM pendente)
- [DOCUMENTACAO.md](file:///d:/0000000-PROJETOS/LeccorCut/DOCUMENTACAO.md) — Documentação técnica completa (Seções 1 a 18; rede/APIs em 9.3–9.9; proteções em 10.4–10.8; dinâmica em 18)
- [FASE4_MITM.md](file:///d:/0000000-PROJETOS/LeccorCut/FASE4_MITM.md) — Runbook de captura MITM (último item pendente da Fase 4); inclui instalação do mitmproxy, CA temporário, proxy, coleta, **limpeza obrigatória** e análise. Escopo: só inventário de endpoints/telemetria visível, sem bypass de pinning/assinatura.
- [CONTEXTO.md](file:///d:/0000000-PROJETOS/LeccorCut/CONTEXTO.md) — Memória de contexto atualizada

---

## ❌ O que ainda falta (Engenharia Reversa — Fases 3, 4 e 5)

### Fase 3 — único item restante (movido para a Fase 4)
- [ ] Interceptar chamadas reais via proxy MITM (mitmproxy/Fiddler) durante startup, export e IA cloud, para confirmar quais hosts e paths mapeados estaticamente são de fato usados. Exige rodar o CapCut de forma interativa, com login.

### Média Prioridade (Fase 4 — Dinâmica e Frida)
- [ ] Confirmar em runtime quando `WinVerifyTrust` é chamado (integridade de DLLs/updates)
- [ ] Instrumentação via Frida para inspecionar chamadas nativas em `audioeffect.dll` e `cccreator.dll`
- [ ] Inspecionar runtime do `bun.exe` e portas IPC locais ativas durante execução

### Baixa Prioridade (Fase 5 — Re-implementação no LeccorCut)
- [x] Implementar parser/conversor de `draft_content.json` do CapCut para a timeline do LeccorCut (`src/capcutConverter.js`)
- [x] Adicionar botões de Importar e Exportar CapCut na interface
- [x] Implementar detecção de cenas automática (Shot Detection via FFmpeg `gt(scene,0.35)`)
- [x] Implementar interpolação de frames para slow motion suave via FFmpeg `minterpolate`
- [ ] Adicionar suporte a OpenTimelineIO no LeccorCut
- [ ] Implementar visualizador de waveforms nativo em C++ inspirado no `WaveformVisualizer`

---

## ✅ O que já foi implementado no LeccorCut (Fases 5 a 9 — 100% Concluídas)

O LeccorCut (`D:\0000000-PROJETOS\LeccorCut`) já implementa com 100% de integridade e 55 testes automatizados:

### Timeline, Edição e Movimento (Fases 5 e 6)
- ✅ Timeline multi-trilha: Vídeo Principal, Sobreposição (PiP / Stickers), Áudio Secundário, Texto/Legendas
- ✅ Track headers com botões de visibilidade e mute
- ✅ Corte preciso (`S`), split na agulha, reorganização por drag-and-drop e trim pelas alças laterais
- ✅ Congelar quadro (Freeze Frame, tecla `F`) e separação de áudio do vídeo (unlink)
- ✅ Alinhamento magnético / Snap magnético (tecla `N`) e marcadores de timeline (tecla `M`)
- ✅ Histórico completo: Undo/Redo até 100 estados (`Ctrl+Z`, `Ctrl+Y`)
- ✅ Rastreamento de Movimento (Motion / Object Tracking com análise `mestimate` + interpolação temporal de keyframes)
- ✅ Speed Ramping com editor de Curva Bezier Livre (inserção de keyframes customizados, arrasto interativo e interpolação cúbica)
- ✅ Redimensionamento Inteligente (Auto Reframe 9:16, 1:1, 4:5, 16:9 com foco dinâmico e filtro Lanczos)
- ✅ Estabilização de Vídeo offline em 2 passos via `vidstabdetect` e `vidstabtransform`
- ✅ Câmera lenta suave com Interpolação de Quadros (Optical Flow via FFmpeg `minterpolate`)
- ✅ Detecção automática de cenas (Shot Detection via FFmpeg `gt(scene,0.35)`)

### Sobreposição, PiP, Estilização e Efeitos (Fase 6)
- ✅ Múltiplos vídeos, imagens e stickers sobrepostos
- ✅ Escala (10%–100%), posicionamento livre, opacidade, rotação (-180° a +180°) e espelhamento (Flip H/V)
- ✅ Animações de entrada e movimento: Fade In/Out, Slide, Zoom In, Pop, Float com suavização Smoothstep
- ✅ Chroma Key profissional e Smart Cutout (remoção de fundo por IA — RMBG-1.4)
- ✅ Matting de Vídeo Contínuo com canal alfa WebM VP9 (`yuva420p`)
- ✅ Retoque Facial / Efeito Beauty offline (suavização bilateral via `smartblur` + realce `unsharp` + `eq`)
- ✅ Estilização de Bordas e Glow/Neon em Sobreposições (espessura, arredondamento, cor e presets Neon Ciano, Pink, Dourado, Roxo)
- ✅ Vinheta cinematográfica, Canvas Blur e transições de corte (fade, dissolve, wipeleft, slideleft, circleopen, pixelize)

### Áudio e IA Local 100% Offline (Fase 7)
- ✅ Separação de Stems de Áudio (isolamento de voz humana e trilha instrumental via matriz M/S e EQ adaptativo)
- ✅ Detecção de Batidas Musicais (Beat Detection via transientes/silencedetect, estimativa de BPM e geração de marcadores 🥁)
- ✅ Text-to-Speech (TTS) offline para dublagem e narração sintética local (SpeechT5 via Transformers.js + síntese algorítmica)
- ✅ Tradução Automática Offline de Legendas (Helsinki-NLP opus-mt multilingue com atualização inline na timeline)
- ✅ Super-resolução / Upscale de Vídeo por IA (pipeline adaptativo Real-ESRGAN com hqdn3d + lanczos + unsharp 2x/4x)
- ✅ Transcrição offline com Whisper (OpenAI / Transformers.js)
- ✅ Legendas Karaokê (Word Highlight), Palavra por Palavra e Estilo Viral / Hormozi

### Exportação Profissional e Codecs (Fase 8)
- ✅ Multi-formatos: MP4 (`libx264`), WebM (`libvpx-vp9` com canal alfa transparente) e Apple ProRes 422 / 4444 (`prores_ks` em contêiner `.mov`)
- ✅ Controle fino de Bitrate: CRF (qualidade constante), CBR (taxa fixa de streaming) e VBR 2-Pass (máxima eficiência estatística)
- ✅ Perfis de cor cinematográficos e HDR: Rec.709 (SDR) e BT.2020 (HDR 10-bit PQ)
- ✅ Exportação independente de áudio direto da timeline (`.wav` PCM, `.mp3` 320k, `.aac` 256k)
- ✅ Importação e Exportação bidirecional de projetos CapCut (`draft_content.json` em microsegundos)

### UX, Produtividade e Assets (Fase 9)
- ✅ Modo Cinema e Pré-Visualização em Tela Cheia (`F11` / `Ctrl+F` com controles flutuantes glassmorphism)
- ✅ Biblioteca Integrada de Assets e Stickers (15 stickers vetoriais nativos + gerador de PNG RGBA com zlib)
- ✅ Histórico Visual de Versões e Backups Automáticos do Projeto (.lccut snapshots a cada 2 min com rotação das 50 versões mais recentes)
- ✅ Painel de Customização de Atalhos de Teclado (remapeamento interativo com persistência local)

---

## ❌ O que falta implementar no LeccorCut (Roadmap Fases 10 a 14)

### 🚀 Fase 10 — Aceleração por Hardware GPU e Mídia Proxy
- [ ] Sondagem automática de GPUs ativas no sistema (NVIDIA NVENC, Intel QuickSync QSV, AMD AMF)
- [ ] Encoders acelerados por hardware no FFmpeg (`h264_nvenc`, `hevc_nvenc`, `h264_qsv`, `h264_amf`)
- [ ] Decodificação acelerada por hardware na leitura de mídias (`-hwaccel d3d11va` / `auto`)
- [ ] Geração automática de arquivos Proxy em background para mídias 4K/8K (720p/540p com codificação ultrafast)
- [ ] Alternância inteligente na timeline (playback fluido via proxy, render final em resolução total)
- [ ] Gerenciador de cache e limpeza de proxies temporários

### 🎭 Fase 11 — Efeitos Visuais, Shaders, Modos de Mesclagem e LUTs
- [ ] Modos de Mesclagem de Camada (Screen / Tela, Multiply / Multiplicar, Overlay / Sobrepor, Lighten, Darken, Add)
- [ ] Máscaras de Forma Geométrica (Retangular, Circular, Linear/Split, Espelho com suavização *feather* e inversão)
- [ ] Efeitos de Estilização de Vídeo (Glitch / RGB Split, Camera Shake, Film Grain / Ruído de Película, Lens Flare)
- [ ] Suporte a Color Grading cinematográfico via tabelas 3D LUT (`.cube` e `.3dl` através do filtro FFmpeg `lut3d`)
- [ ] Controles de graduação tonal fina (Highlights, Shadows, Midtones, Temperatura, Matiz e Curvas RGB)

### 🎙️ Fase 12 — Áudio Avançado, Voice Changers e Separação Neural
- [ ] Moduladores de Efeito de Voz (Voz Grave/Monstro, Voz Aguda/Chipmunk, Robô Cibernético, Megafone/Rádio, Eco Espacial)
- [ ] Pitch Shifter contínuo (-12 a +12 semitons) com preservação de formantes e tempo original
- [ ] Equalizador Paramétrico de 10 bandas (EQ10) e Compressor Dinâmico de Áudio
- [ ] Separação neural de áudio em 4 stems independentes (Voz, Bateria, Baixo, Outros instrumentos)
- [ ] Visualizador de onda estéreo de alta fidelidade na timeline inspirado no `WaveformVisualizer`

### 🎬 Fase 13 — Multi-Trilhas Ilimitadas e Keyframing Universal Livre
- [ ] Suporte a N trilhas dinâmicas de vídeo, sobreposição, texto e áudio com botões `+ Adicionar Trilha`
- [ ] Clipes Compostos (Compound Clips) para agrupamento e edição modular de blocos da timeline
- [ ] Bloqueio individual de trilhas (Track Lock) e reordenação z-index por drag-and-drop
- [ ] Marcadores de Keyframe (losangos) na timeline para qualquer propriedade (Posição X/Y, Zoom, Rotação, Opacidade, Volume)
- [ ] Editor gráfico de curvas de interpolação entre keyframes (Linear, Ease-In, Ease-Out, Curva Bezier Livre)

### 🌐 Fase 14 — Interoperabilidade Pro e Exportação para Outras NLEs
- [ ] Exportador de Final Cut Pro XML (`.fcpxml` / `.xml`) para DaVinci Resolve e Adobe Premiere Pro
- [ ] Exportador de EDL (Edit Decision List - CMX 3600) para broadcast e suites de pós-produção
- [ ] Empacotador de Projeto (Project Bundler / Coleta de Arquivos) com consolidação de mídias e exportação `.zip`

---

## 🗺️ Arquitetura Atual do LeccorCut

```
LeccorCut/
├── src/
│   ├── main.js             # Processo Electron principal + IPC + IA (Whisper, RMBG, TTS, Upscale, Backups)
│   ├── preload.js          # Context bridge Node ↔ Renderer (APIs seguras expostas)
│   ├── index.html          # UI completa (dark mode, timeline, modais, stickers, histórico, LUTs, áudio pro)
│   ├── styles.css          # Design system HSL, glassmorphism, modo cinema, responsividade
│   ├── renderer.js         # Timeline reativa, preview, curva bezier, stickers, atalhos, cinema
│   ├── ffmpegBuilder.js    # Montador modular do filter_complex FFmpeg (codecs, HDR, VBR, alpha, GPU, LUTs)
│   ├── capcutConverter.js  # Conversor bidirecional de drafts CapCut (microsegundos ↔ timeline)
│   ├── assetsLibrary.js    # Biblioteca de stickers vetoriais e sintetizador PNG RGBA offline
│   ├── backupManager.js    # Gerenciador de snapshots periódicos e restauração de versões (.lccut)
│   ├── gpuDetector.js      # Detecção dinâmica de aceleração de hardware GPU (NVENC, QSV, AMF)
│   ├── proxyManager.js     # Gerador de mídias proxy 720p em background e limpeza de cache
│   ├── visualEffects.js    # Modos de mesclagem (blend modes), máscaras geométricas e gerador de 3D LUT (.cube)
│   ├── audioAdvanced.js    # Moduladores de voz, pitch shifter, EQ 10 bandas e separação neural em 4 stems
│   ├── keyframeManager.js  # Keyframing universal contínuo (easing, bezier), compound clips e track locks
│   └── proExporters.js     # Exportadores profissionais EDL CMX 3600, FCPXML v1.9 e empacotador de projetos
├── tests/
│   ├── export-smoke.js     # Teste de renderização FFmpeg
│   ├── cutout-smoke.js     # Teste do pipeline Smart Cutout
│   ├── phase5-smoke.js     # Teste da Fase 5 (CapCut import/export, shot detect, minterpolate)
│   ├── phase6-smoke.js     # Teste da Fase 6 (Estabilização, Auto Reframe, Tracking, Bezier, Beauty, Borders)
│   ├── phase7-smoke.js     # Teste da Fase 7 (Stems, Beat Detect, TTS, Tradução, Upscale)
│   ├── phase8-smoke.js     # Teste da Fase 8 (Codecs, ProRes, WebM alfa, CBR/VBR, HDR, Áudio Independente)
│   ├── phase9-smoke.js     # Teste da Fase 9 (Modo Cinema, Stickers, Backups, Atalhos)
│   ├── phase10-smoke.js    # Teste da Fase 10 (Aceleração GPU e Proxy)
│   ├── phase11-smoke.js    # Teste da Fase 11 (Blend Modes, 3D LUTs e Máscaras)
│   ├── phase12-smoke.js    # Teste da Fase 12 (Voice Changers, EQ10, Pitch Shifter e 4 Stems)
│   ├── phase13-smoke.js    # Teste da Fase 13 (Keyframing Universal, Compound Clips e Track Lock)
│   └── phase14-smoke.js    # Teste da Fase 14 (Timecode SMPTE, EDL, FCPXML e Project Bundler)
└── scripts/
    └── generate-icons.js
```

### Stack Tecnológica do LeccorCut
| Camada | Tecnologia |
|---|---|
| Shell | Electron (Node.js 20+) |
| UI | HTML5 / Vanilla CSS3 (Glassmorphism) / JavaScript ES2022 |
| Vídeo & Áudio nativo | FFmpeg CLI com `ffmpeg-static` + `ffprobe-static` |
| Aceleração de Hardware | NVENC (NVIDIA), QuickSync (Intel), AMF (AMD) com fallback CPU |
| Efeitos & Colorimetria | 3D LUTs (.cube Adobe 17^3), Modos de Mesclagem, Máscaras Geométricas |
| Áudio & DSP | Equalizador ISO 10 bandas, Voice Changers, Pitch Shifter, Separação 4 Stems |
| IA local offline | Transformers.js (Whisper, RMBG-1.4, SpeechT5, Helsinki-NLP) + Real-ESRGAN adaptativo |
| Gráficos & Vetores | SVG nativo + sintetizador PNG RGBA com `zlib` |
| Formatos de Projeto | `.lccut` (portátil com bundle), `draft_content.json` (CapCut), FCPXML v1.9 e EDL CMX 3600 |
| Empacotamento | electron-builder + NSIS |

---

## 🔑 Diferenças de Arquitetura: LeccorCut vs CapCut

| Aspecto | LeccorCut | CapCut |
|---|---|---|
| Shell | Electron (Node.js) | Qt6 + CEF + Lynx |
| UI | HTML/CSS/JS vanilla (Zero bloat) | React/Vite (web) + Qt (nativo) |
| Render engine | FFmpeg CLI modular + Aceleração GPU nativa | VECreator.dll (C++ nativo) |
| Efeitos visuais | Shaders CSS / FFmpeg filter_complex / 3D LUTs | lens.dll + AmazingEngine (GPU AGFX) |
| Áudio Pro | EQ10 + Pitch Shift + 4 Stems + Voice Changers | audioeffect.dll + Lyra codec |
| Interoperabilidade | .lccut + CapCut draft + FCPXML + EDL + Bundler | draft-converter.exe + OpenTimelineIO |
| IA local | Transformers.js + FFmpeg filters (100% offline) | deepagents_capi.dll + OpenVINO |
| Modelos locais | Whisper, RMBG, SpeechT5, Opus-MT, ESRGAN | 45+ modelos ByteNN (`.bytenn`) e SAMI (`.model`) |
| Cloud AI & Telemetria | ❌ Zero dependência de nuvem, 100% privado | SeedDance, MiniMax, Gemini, monitoramento pc-mon |
| Watermark / Assinaturas | ❌ Livre de marcas d'água e paywalls | 4 tipos (brand, AI, invisible, C2PA) + VIP paywall |
| Licença & Ativação | Open-Source / Local | Server-authoritative (`/commerce/*`) |
| Tamanho aprox. | ~95 MB | ~1.2 GB |

---

## 📋 Próximos Passos Recomendados (Roadmap de Expansões Futuras)

1. **Fase 15 — Gravação Direta na Timeline (Voiceover, Microfone & Webcam PiP):**
   - Gravador nativo de áudio para locução com contagem regressiva 3..2..1, VU meter em tempo real e inserção automática na agulha.
   - Gravação simultânea de webcam para reacts, tutoriais e gameplays na trilha de sobreposição (PiP).
2. **Fase 16 — Detector Inteligente de Silêncio e Cortes Rítmicos (Beat Sync):**
   - Detecção e eliminação automática de pausas vazias e respirações em faixas de fala (*Smart Silence Remover*).
   - Detecção de batidas e transientes rítmicos para sincronizar cortes de vídeo com a música (*Auto Beat Sync*).
3. **Fase 17 — Dublagem Neural e Conversão Texto-em-Fala (TTS Local & Legendas Bilíngues):**
   - Síntese de voz neural offline com múltiplos timbres naturais para narrar legendas.
   - Legendas automáticas bilíngues com tradução simultânea para alcance internacional de vídeos.
4. **Fase 18 — Exportador de Animações Web e Stickers (GIF / WebP Animado):**
   - Exportação direta de trechos selecionados para GIFs com paleta adaptativa otimizada e WebP animado com transparência.

---

*Atualizado em: 2026-10-15 | Fases 1 a 14 100% concluídas (260+ testes passando) | Roadmap Fases 15 a 18 catalogado com base na engenharia reversa do CapCut v9.6.0.4097*