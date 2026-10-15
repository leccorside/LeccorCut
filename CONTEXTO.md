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

## ✅ O que já foi implementado no LeccorCut

O LeccorCut (`D:\0000000-PROJETOS\LeccorCut`) já implementa:

### Timeline e Edição
- ✅ Timeline multi-trilha: Vídeo Principal, Sobreposição (PiP), Áudio, Texto/Legendas
- ✅ Track headers com botões de visibilidade e mute
- ✅ Corte preciso (`S`), split na agulha
- ✅ Detecção automática de cenas (Shot Detection, botão `🎬 Detectar Cenas`) com inserção de marcadores
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
- ✅ Matting de Vídeo Contínuo (Remoção de fundo e extração de canal alfa temporal WebM VP9 yuva420p com despill e colorkey)
- ✅ Detecção Automática de Cenas (equivalente ao `jy_compressShotDetect` via FFmpeg `gt(scene,0.35)`)
- ✅ Importação de `.srt`
- ✅ Estilização em massa de legendas

### Efeitos e Ajustes
- ✅ Speed Ramping com curvas (Heroico, Bala, Montagem, Flash In, Flash Out)
- ✅ Câmera lenta suave com Interpolação de Quadros (Optical Flow via FFmpeg `minterpolate`)
- ✅ Gráfico SVG de curva de velocidade em tempo real
- ✅ Transições: fade, dissolve, wipeleft, slideleft, circleopen, pixelize
- ✅ Filtros e presets de cor (sepia, vintage, warm, cool, cinematic, vivid)
- ✅ Vinheta cinematográfica
- ✅ Canvas Blur (enquadramento com desfoque de fundo para Reels/Shorts)
- ✅ Estabilização de Vídeo offline (2 passos com `vidstabdetect` e `vidstabtransform` para redução de trepidação)
- ✅ Brilho, contraste, saturação, desfoque, P&B, velocidade linear
- ✅ Espelhamento H/V, rotações 90°/180°/270°, zoom digital

### Exportação e Formatos
- ✅ Importação e Exportação bidirecional com CapCut (`draft_content.json` com escala temporal em microsegundos)
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
- [ ] Efeitos de face em tempo real (beautify, stickers faciais)
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

1. **Imediato**: Fase 4. Capturar tráfego com MITM (fecha a Fase 3) e instrumentar com Frida
2. **Curto prazo**: Implementar no LeccorCut o importador de `draft_content.json` (Fase 5.3), que já tem base suficiente das Fases 2.3 e 5
3. **Médio prazo**: Implementar detecção de cenas e object tracking no LeccorCut
4. **Longo prazo**: Migrar engine de renderização de FFmpeg CLI para pipeline nativo C++/WebGPU

---

*Atualizado em: 2026-10-15 | Versão da análise: REA v6.4.0 + Ghidra 12.1.4*