# 📚 Documentação Técnica — Engenharia Reversa CapCut v9.6.0.4097

> Gerado via análise estática com REA v6.4.0 + extração manual de strings e recursos.

---

## 1. Identificação do Binário

| Campo | Valor |
|---|---|
| Produto | CapCut PC (`capcutpc_0`) |
| Versão completa | 9.6.0.4097 |
| Build type | `release` |
| Arquitetura | PE x86_64 (Windows) |
| SHA-256 launcher | `db0a1848273f0137d58717f6b226b570d1867536ac54f88367496a7eab00a70a` |
| Launcher real | `JianyingLauncher.exe` (nome interno) |

---

## 2. Estrutura de Instalação

```
C:\Users\...\AppData\Local\CapCut\Apps\
├── CapCut.exe               # Launcher bootstrap (4.97 MB)
├── uninst.exe               # Desinstalador (4.1 MB)
├── Configure.ini            # Config básica
├── ProductInfo.xml          # Metadados da versão e CID
└── 9.6.0.4097\              # Versão atual
    ├── [Executáveis]
    ├── [DLLs core]
    ├── cef\                 # Chromium Embedded Framework assets
    ├── data\                # ICU data (icudtl.dat 10MB)
    ├── plugins\             # Qt plugins (imageformats, platforms, qml)
    ├── Qt\, Qt5Compat\, QtQml\, QtQuick\
    ├── Resources\           # Assets, modelos IA, UI web
    ├── Service\             # Serviços auxiliares
    ├── Tools\               # Ferramentas auxiliares
    ├── VEAngle\             # ANGLE (OpenGL→D3D translator)
    ├── vm_sdk\              # VM SDK
    ├── x64\, x86\           # Bibliotecas nativas
    └── _internal\           # Dependências internas
```

---

## 3. Executáveis Principais

| Executável | Tamanho | Função |
|---|---|---|
| `bun.exe` | 107 MB | Runtime JavaScript embarcado (Bun runtime) |
| `CapCut.exe` (launcher) | 4.97 MB | Bootstrap — inicia a app principal |
| `VEDetector.exe` | 4.4 MB | Detector de ambiente/hardware |
| `VEHelper.exe` | 3.6 MB | Helper para operações nativas |
| `draft-converter.exe` | 4.6 MB | Conversor de projetos (drafts) |
| `feedbacktool.exe` | 5.0 MB | Ferramenta de feedback/report |
| `VECreator (como DLL)` | 271 MB | Engine principal de criação de vídeo |
| `parfait_crash_handler.exe` | 1.3 MB | Handler de crashes (Parfait framework) |
| `VECrashHandler.exe` | 2.1 MB | Handler de crashes do VE |
| `CapCutService.exe` | 1.5 MB | Serviço em background |
| `ttdaemon.exe` | 411 KB | Daemon de serviços TikTok |
| `push_detect.exe` | 74 KB | Telemetria/push notifications |
| `taskcontainer.exe` | 44 KB | Container de processos filhos |
| `minidump_stackwalk.exe` | 650 KB | Análise de crash dumps (formato Breakpad) |

---

## 4. DLLs Críticas (Core Engine)

| DLL | Tamanho | Função Provável |
|---|---|---|
| `VECreator.dll` | 271 MB | **Engine principal** de vídeo/composição |
| `libcef.dll` | 218 MB | **Chromium Embedded Framework** — UI web |
| `cccreator.dll` | 159 MB | Creator core (composição e efeitos) |
| `lens.dll` | 89 MB | **Engine de filtros e efeitos** em tempo real |
| `videoeditor.dll` | 73 MB | **Editor core** — timeline e clipes |
| `deepagents_capi.dll` | 42 MB | **C API para modelos de IA** (inference bridge) |
| `lynx.dll` | 25 MB | **Lynx UI framework** (UI mobile-style da ByteDance) |
| `pc_push.dll` | 24 MB | Sistema de push notifications |
| `dxcompiler.dll` | 22 MB | Compilador HLSL DirectX |
| `opengl32sw.dll` | 21 MB | Software OpenGL (fallback) |
| `avcodec-61.dll` | 20 MB | **FFmpeg avcodec** — codecs de vídeo/áudio |
| `openvino.dll` | 14 MB | **Intel OpenVINO** — inferência de IA em CPU/GPU |
| `audioeffect.dll` | 14 MB | Processamento de efeitos de áudio |
| `metasecml.dll` | 13 MB | Framework ML (possivelmente MetaSec ML) |
| `lyra_cli_client.dll` | 11 MB | **Codec Lyra** (Google) — compressão de áudio por IA |
| `sscronet.dll` | 9 MB | **Cronet** (Chrome networking) — HTTP/QUIC |
| `res_pool.dll` | 9 MB | Pool de recursos |
| `ever_cloud_sdk.dll` | 9 MB | SDK de cloud da ByteDance |
| `speechsdk.dll` | 8 MB | **SDK de reconhecimento de voz** |
| `tt_c2pa_sdk.dll` | 8 MB | **C2PA** — Content Provenance and Authenticity |
| `SvtAv1Enc.dll` | 7 MB | Encoder **AV1** (SVT-AV1) |
| `avfilter-10.dll` | 6 MB | FFmpeg avfilter — pipeline de filtros |
| `python311.dll` | 6 MB | **Python 3.11** runtime embarcado |
| `Qt6Core.dll` | 5.5 MB | Qt6 Core framework |
| `Qt6Gui.dll` | 7.2 MB | Qt6 GUI framework |
| `Qt6Widgets.dll` | 6.0 MB | Qt6 Widgets |

### 4.1 Tabela Completa de Imports e Exports dos Binários Core (PE Analysis)

| Binário / DLL | Imports (DLLs / Funções) | Principais Dependências | Exports | Principais Símbolos Exportados |
|---|---|---|---|---|
| `CapCut.exe` | 17 DLLs / 408 funcs | `KERNEL32` (252), `ADVAPI32` (55), `USER32` (33), `SHLWAPI` (19) | 88 funcs | Chromium base (`base::MemoryAllocatorDumpGuid`, `base::ReadOnlySharedMemoryRegion`) |
| `cccreator.dll` | 62 DLLs / 1.701 funcs | `MSVCP140` (253), `KERNEL32` (181), `audioeffect.dll` (151), `avutil-59.dll` (120), `jazz.dll` (116), `sscronet.dll` (105) | 7.401 funcs | `AmazingEngine` (`Segment`, `StickerCommonSegment`, `SwingSurfaceTrackingController`) |
| `videoeditor.dll` | 28 DLLs / 854 funcs | `MSVCP140` (214), `cccreator.dll` (196), `KERNEL32` (83), `clipflow_sdk.dll` (77), `avutil-59` (28) | 8.192 funcs | `lyra::AlgorithmAsyncUtils`, `lvve::SegmentPreRenderCacheManager`, `lyra::wrapper::VESDKModule` |
| `lens.dll` | 19 DLLs / 370 funcs | `MSVCP140` (104), CRT Math (61), `KERNEL32` (53), `fastcv.dll` (21) | 379 funcs | `FRAMEWORK::LENS` (`ICvAcceleratedOperatorInterface`, `ILensAlgorithmInterface`) |
| `VECreator.dll` | 23 DLLs / 4.087 funcs | `Qt6Core` (1.901), `Qt6Gui` (789), `FusionUI` (342), `Qt6Quick` (266), `Qt6Widgets` (223), `lynx.dll` (43), `nuro.dll` (57) | 1.808 funcs | `effectplatform::davinci` (`ResourceFetchCallback`, `loki`, `heycan`, `EffectLinkage`) |
| `smart_cut.ofx` | 14 DLLs / 198 funcs | `libGLESv2.dll` (34), `cccreator.dll` (36), `MSVCP140` (39), `KERNEL32` (31) | 2 funcs | Open Effects Standard (`OfxGetNumberOfPlugins`, `OfxGetPlugin`) |

### 4.2 Arquitetura do DeepAgents (`deepagents_capi.dll`)

`deepagents_capi.dll` (42 MB) é a ponte de inferência e orquestração de agentes de IA, compilada via **Go + CGo** (`_cgo_dummy_export`). Expõe **77 funções C-API**:

- **Gerenciamento de Agentes**: `da_agent_create`, `da_agent_create_with_callbacks`, `da_agent_destroy`, `da_agent_start`, `da_agent_run_async`, `da_agent_execute_subagent`, `da_agent_get_conversation_execution_graph`.
- **Sessões e Contexto**: `da_session_create`, `da_session_get_model_context_view`, `da_session_get_transcript_view`, `da_session_set_thinking_override`, `da_session_rewrite_history`.
- **Streaming de Respostas**: `da_agent_stream_start`, `da_agent_stream_run`, `da_agent_stream_next`, `da_stream_read`, `da_stream_close`.
- **Tool Calling (Execução de Ferramentas)**: `da_tool_call_emit_event`, `da_tool_call_reply_impl`, `da_tool_call_get_thread_id`, `da_tool_spec_array_alloc`, `da_tool_spec_array_free`.
- **Telemetria e Observabilidade**: `da_fornax_trace_send_reply_impl`, `da_session_get_fornax_runtime_view` (integração direta com telemetria Fornax da ByteDance).

---

## 5. Formato do Projeto (Draft) — Estrutura Interna

Obtido via análise de strings do `videoeditor.dll` (17.457 strings relevantes extraídas).

### 5.1 Campos-chave de um Segmento/Clipe

```json
{
  "item": {
    "version": "",
    "fps": 30,
    "has_audio": true,
    "speed": 1.0,
    "render_index": 0,
    "render_type": "",
    "fade": {},
    "fade_in_duration": 0,
    "fade_out_duration": 0,
    "fade_type": "",
    "filter": {},
    "effect": {},
    "effect_abs_path": "",
    "effect_name": "",
    "effect_params": {},
    "effect_mask": {},
    "enable_mask": false,
    "adjust_mask": {},
    "enable_adjust_mask": false,
    "mask": {},
    "curve_speed": {},
    "audio_adjust_params": {},
    "audio_channel_mapping": {},
    "audio_meta": {},
    "audio_track_index": 0,
    "video_animations": [],
    "video_effects": [],
    "video_meta": {},
    "video_meta_path": "",
    "common_keyframes": [],
    "trackers": [],
    "tracker_type": "",
    "tracker_data_id": "",
    "tracking_time_range": {},
    "smart_crop_param": {},
    "fill_render_style": "",
    "background_effects": [],
    "is_ai_generate_content": false,
    "is_ai_clone_tone": false,
    "is_ai_translate_applied": false,
    "caption_template_info": {},
    "subtitle_keywords": [],
    "subtitle_template_original_fontsize": 0,
    "text_to_audio_ids": [],
    "tone_effect_id": "",
    "manual_deformation_paths": [],
    "figure_effect": {},
    "lyric_canvas_blend": {}
  }
}
```

### 5.2 Campos de Compatibilidade Identificados

O `videoeditor.dll` embarca um sistema de **migração de versão** baseado em Lua com verificações de:
- `color wheels keyframes`
- `video animations` 
- `transition` (via `enable_transition_ii`)
- `stickers keyframes`
- `texts keyframes`
- `audio track indexs in segments`
- `combination segment`
- `render_index_track_mode_on`
- `vocal beautifys in segments`
- `ai_portrait` (remoção de fundo por portrait)
- `ai_translate_applied` (tradução automática por IA)

### 5.3 Esquema Real do `draft_content.json` (Engenharia Reversa Empírica)

Inspecionado diretamente a partir de projetos reais salvos em `User Data/Projects/com.lveditor.draft/`:

* **Unidade de Tempo Base**: **Microsegundos ($\mu s$)** ($1\text{ s} = 1.000.000\text{ }\mu s$).
* **Estrutura Raiz**:
  ```json
  {
    "id": "uuid-do-projeto",
    "version": 2,
    "new_version": "96.0.0",
    "duration": 209600000,
    "fps": 30.0,
    "canvas_config": {
      "ratio": "original",
      "width": 1080,
      "height": 1920,
      "background": null
    },
    "tracks": [ ... ],
    "materials": { ... },
    "keyframes": { ... }
  }
  ```
* **Tracks & Segments (Arquitetura Relacional)**:
  As tracks contêm segmentos com intervalos de tempo (`source_timerange` e `target_timerange`) que apontam para um `material_id`:
  ```json
  {
    "id": "seg_001",
    "material_id": "mat_video_001",
    "render_index": 0,
    "source_timerange": { "start": 0, "duration": 7400000 },
    "target_timerange": { "start": 0, "duration": 7400000 },
    "speed": 1.0,
    "volume": 1.0,
    "clip": { "scale": { "x": 1.0, "y": 1.0 }, "transform": { "x": 0.0, "y": 0.0 } },
    "keyframe_refs": [ "kf_01", "kf_02" ]
  }
  ```
* **Repositório Global de Materiais (`materials`)**:
  Separado em **55 tabelas especializadas**:
  - Mídia: `videos`, `audios`, `images`, `tail_leaders`, `canvases`.
  - Edição: `speeds`, `transitions`, `material_animations`, `sound_channel_mappings`.
  - Efeitos & Cor: `hsl`, `color_curves`, `primary_color_wheels`, `green_screens`, `chromas`.
  - IA & Áudio Avançado: `vocal_separations`, `vocal_beautifys`, `smart_relights`, `smart_crops`, `ai_translates`.

---

## 6. Engine de Efeitos — Flags de A/B Testing do `cccreator.dll`

O engine de efeitos (`cccreator.dll`) usa um sistema de feature flags extensivo:

### Renderização e GPU
- `enable_agfx_rendering_lib` — Renderer AGFX (Amazing GFX)
- `enable_break_old_feature_in_renderCore` — Quebrar compatibilidade com renders antigos
- `enable_render_reduce_blit` — Otimização de blit
- `enable_segment_xshader_reuse` — Reuso de shaders entre segmentos
- `enable_shader_compiling_key_sorted` — Ordenação de chaves de shader
- `enable_share_context_for_parallel_thread` — Contexto OpenGL compartilhado
- `effectab_enable_ae_renderer_metal` — Renderer Metal (Apple)
- `effectab_hybird_render_pipeline` — Pipeline híbrido de renderização

### Modelos de IA no Engine de Efeitos
- `enable_face_async_model_load` — Carregamento assíncrono de modelos de face
- `enable_face_extra_model_lazy_load` — Lazy loading de modelos extras
- `enable_model_loading_optimization` — Otimização geral de carregamento
- `enable_tt_matting_model_mapping` — Mapeamento de modelos de matting
- `enable_tt_face_extra_model_mapping` — Mapeamento de modelos extras de face
- `enable_amgFaceMakeup_segmentation` — Segmentação facial para maquiagem
- `auto_detection_human_model_name` — Detecção automática de modelo humano
- `auto_detection_object_model_name` — Detecção automática de objeto
- `bach_modelzoo_model_whitelist` — Whitelist de modelos BACH ModelZoo

### JavaScript e Scripts
- `enable_effect_javascript_runtime_mode` — Modo de runtime JS nos efeitos
- `enable_js_multi_context` — Múltiplos contextos JS simultâneos
- `enable_file_access_tracker_lua` — Tracker de acesso a arquivos via Lua
- `effectab_script_async_load_image` — Carregamento assíncrono de imagens em scripts

---

## 7. Modelos de Inteligência Artificial

### 7.1 Modelos Locais (Empacotados, ~Resources/models/)

| Modelo | Arquivo | Função |
|---|---|---|
| Matting v1 (GRU) | `mattingmodel/tt_matting_video_gru_v1.*.model` | Remoção de fundo em vídeo |
| Matting (saliency) | `mattingmodel/saliency_matting_v1.0.model` | Remoção por saliência |
| Interactive Matting | `tt_interactive_matting/tt_interactiv*.model` | Matting interativo |
| Face Verify | `faceverifymodel/tt_faceverify_v7.0.model` | Verificação facial |
| Face Beautify | `facebeautifymodel/` | Embelezamento facial |
| Face Fitting | `facefitting/` | Ajuste facial 3D |
| Face 3D Fitting | `tt_facefitting_3d/` | Fitting 3D avançado |
| Face Gan (gender) | `tt_gendergan/tt_gendergan_v4.2.model` | Transformação de gênero |
| FaceGan (female) | `bingo_facegan_model/female_gan_v3.*.model` | GAN feminino |
| Eye Fitting | `tt_eyefitting/` | Ajuste de olhos |
| Avatar 3D | `avatar3d/tt_avatar3d_v4.0.model` | Avatar 3D |
| Avatar Drive | `avatar_drive/` | Driving de avatar |
| MobileVOS | `tt_mobilevos/mobilevos_packed_v1.1.model` | Video Object Segmentation mobile |
| Salient Human | `tt_salient_human/` | Detecção de pessoa saliente |
| Saliency Seg | `saliency_seg_model/bingo_saliency_seg*.model` | Segmentação por saliência |
| Human Parsing | `humanparsingmodel/` | Parsing de partes do corpo |
| Head Seg | `headsegmodel/` | Segmentação de cabeça |
| Hair Parser | `hairparser/` | Segmentação de cabelo |
| Skin Seg | `skin_seg/` | Segmentação de pele |
| Skeleton | `skeleton_model/` | Estimação de esqueleto |
| Hand Model | `handmodel/` | Detecção de mão |
| Object Tracking | `object_tracking/` | Rastreamento de objeto |
| Single Object Track | `single_object_tracking_v1.0.model` | Rastreamento de objeto único |
| VFI (interpolação) | `interpolation/lens_vfi_v1.0.model` | Frame interpolation |
| UMVFI | `umvfi/` | Frame interpolation avançado |
| Depth Model | `depthmodel/` | Estimação de profundidade |
| iDream | `idream/` | Geração por IA (local) |
| Scene Normal | `alg_scene_normal/`, `scene_normal_model/` | Mapa de normais de cena |
| Shot Detect | `jy_compressShotDetectBackbone/Predhead*.bytenn` | Detecção de cortes/cenas |
| Freid | `freidmodel/tt_freid_v2.0.model` | Detecção de frames redundantes |
| Manga | `mangamodel/` | Estilo mangá |
| Oil Paint | `oilpaintbrush/` | Estilo pintura a óleo |
| Deflicker | `deflicker/` | Remoção de flickering |
| Noise Reduction | `noise_reduction/` | Redução de ruído |
| Custom Region | `custom_region_v1.0.model` | Região personalizada |
| Pet Face | `petfacemodel/` | Detecção de face de pet |
| Face Cluster | `faceclustingmodel/` | Clustering de faces |
| NodeHub Image | `nh_nodehub_image/` | Hub de nós para imagem |
| Invisible Watermark | `invisible_watermark/` | Marca d'água invisível |
| Yunfuhua (upscale) | `jypc_yunfuhua_gpucpu_v1.0.model` | Super-resolução (upscale) |
| CC Auto Beauty | `cc_auto_beauty_simo_script_v1.0.model` | Embelezamento automático |
| Skinified | `skinunified_v1.0_size1.bytenn` | Unificação de tons de pele |
| FS New Base | `tt_fsnew_base_v2.0_size0.model` | Base de filtros FS |
| Squat Skeleton | `tt_skeletonsquat_v9.1.model` | Skeleton para exercícios |
| ASR (Whisper-like) | `media_search/asr/ptl.dat` | Reconhecimento automático de fala |
| Sentence Score | `audiomodel/sentence_score_v1.0/v1.1.model` | Pontuação de frases |
| Music2Vibes | `audiomodel/music2vibes/music2vibes_v*.model` | Análise de ritmo musical |
| AED Pets | `audiomodel/aed_pets_v3.0.model` | Detecção de eventos de áudio (pets) |

### 7.2 Modelos Cloud (Geradores, via API)

| Modelo | Identificador | Tipo | Qualidade |
|---|---|---|---|
| SeedDance 1.5 | `ai_hub_video_seedance15_720` | Geração vídeo T2V | 720p |
| SeedDance 2.0 I2V | `ai_hub_video_seedance20_i2v_*` | Geração vídeo I2V | 480p/720p/1080p/4K |
| SeedDance 2.0 R2V | `ai_hub_video_seedance20_r2v_*` | Geração vídeo R2V | 480p–4K |
| SeedDance 2.0 Fast | `ai_hub_video_seedance20fast_*` | Geração rápida | 480p/720p |
| SeedDance 2.0 Mini | `ai_hub_video_seedance20mini_*` | Geração leve | 480p/720p |
| SeedDance 2.5 | `ai_hub_video_seedance25_*` | Geração I2V/R2V | 480p–1080p |
| MiniMax H3 | `ai_hub_video_minimaxh3_*` | Geração vídeo | 768p/2K |
| Gemini Omni Flash | `ai_hub_video_geminiomniflash_720` | Google Gemini | 720p |
| DreamActor | `ai_hub_video_dreamactor_*` | Avatar animado | 480p/720p |
| SeedDream 4.3 | `ai_hub_pic_seedream43_*` | Geração imagem | 2K/4K |
| SeedDream 4.5 | `ai_hub_pic_seedream45_*` | Geração imagem | 2K/4K |
| SeedDream 5 | `ai_hub_pic_seedream5_*` | Geração imagem | 2K/4K |
| SeedDream 5 Pro | `ai_hub_pic_seedream5pro_*` | Geração imagem Pro | 1K/2K |
| NanoBanana | `ai_hub_pic_nanobanana_*` | Geração imagem | 1K–4K |
| NanoBanana 2 | `ai_hub_pic_banana2_*` | Geração imagem v2 | 2K/4K |
| GPT-Image2 | `ai_hub_pic_gptimage2_medium_*` | OpenAI GPT-Image | 1K/2K |

---

## 8. Arquitetura de UI (Multi-Framework)

```
Janela Principal (Qt6)
│
├── Qt Widgets/QML — Janela, menus nativos, drag-and-drop do OS
│
└── CEF (Chromium Embedded 5.x) — Conteúdo web
    │
    ├── /video-studio/ — Editor principal (React + Vite)
    │   ├── App-DpNZSMvJ.js (3.2 MB) — Lógica completa do editor
    │   ├── index-DJ4o9hAr.js (241 KB) — Entry point
    │   └── services-Bqx5Pz17.js (51 KB) — Serviços de API
    │
    ├── /commonagent/ — Agente de IA (React + Vite)
    │   ├── assets/index-*.js — Bundle principal
    │   ├── assets/render-worker-*.js — Workers de renderização
    │   └── assets/services-*.js — Serviços cloud
    │
    └── Lynx Pages (UI mobile-style ByteDance)
        ├── image_lynx_videocutpc_subscription — Planos
        ├── image_lynx_videocutpc_credits_center — Créditos
        ├── image_lynx_videocutpc_subscription_export — Exportar
        └── image_lynx_videocutpc_message_center — Mensagens
```

---

## 9. Endpoints de API Identificados

### 9.1 Agente de IA
| Endpoint | Função |
|---|---|
| `GET /api/agent-runtime/v1` | Status do runtime do agente |
| `POST /api/agent-runtime/v1/debug/ailab-test-login` | Debug/login do AI Lab |
| `POST /api/common-agent/opened-project:restore` | Restaurar projeto aberto |

### 9.2 Comércio e Assinaturas
| Endpoint | Função |
|---|---|
| `/commerce/v1/subscription/price_list` | Lista de preços |
| `/commerce/v1/subscription/cc_price_list` | Preços CapCut |
| `/commerce/v1/subscription/user_info` | Info do usuário assinante |
| `/commerce/v1/subscription/make_unauto_order` | Pedido sem auto-renovação |
| `/commerce/v1/subscription/sign_and_pay` | Assinar e pagar |
| `/commerce/v1/benefits/user_credit` | Créditos do usuário |
| `/commerce/v1/benefits/user_credit_history` | Histórico de créditos |
| `/commerce/v1/benefits/credit_receive` | Receber créditos |
| `/commerce/v1/benefits/team_credit_allocate` | Alocação de créditos em equipe |
| `/commerce/v1/purchase/price_list` | Lista de preços de compra |
| `/commerce/v1/invoice/*` | Gerenciamento de faturas |
| `/commerce/v1/appeal/submit` | Enviar apelação |
| `/commerce/v1/student/verify/status` | Verificação de estudante |
| `/lv/v1/commerce/get_entrances` | Pontos de entrada comerciais |

---

## 10. Proteções e Segurança

### 10.1 Anti-Debug
- `IsDebuggerPresent` — detectado nas strings do launcher
- `AES_KEY_SETUP_FAILED`, `BAD_KEY_LENGTH`, `INVALID_TOKEN` — BoringSSL (OpenSSL fork Google)
- Certificado de assinatura PE via Digicert e Sectigo

### 10.2 Mecanismo Interno de Watermarks (Lua + Atlas Engine)

A engine de watermark é orientada a entidades e sprites no motor `AmazingEngine`, controlada por scripts Lua e metadados JSON:
- **Estrutura dos Pacotes** (`Resources/watermark/`):
  - `brand_left`, `brand_right`, `ai_left`, `ai_right`: Watermarks dinâmicos animados.
  - `brand_static`, `ai_left_static`, `big_brand`, `normal_brand`: Watermarks estáticos.
- **Orquestração via Lua** (`infoSticker.lua`):
  ```lua
  InfoSticker = { 
      materials = { 
          { id = 0, type = materialType.autoAtlas, data = "ani_info.json", source = "SequenceMap.png" }
      },
      entity
  }
  function InfoSticker:new()
      local viewer = director:getViewer()
      local scale = viewer:getWidth() / 720.0 * 1.0
      o.entity = scene:createEntity("infoSticker" .. math.random())
      o.entity:getTransform():setScale(scale)
      o.entity:addSpriteComponent():getSprite()
      ...
  end
  ```
- **Atlas de Animação** (`ani_info.json` & `heycanInfo.json`):
  - Spritesheet `SequenceMap.png` (1024x1024 px) contendo 90 frames (`ccbl_00000.png` a `ccbl_00089.png`).
  - Cada frame armazena coordenadas de corte (`frame: x, y, w, h`), tamanho original (`200x60`) e flags (`trimmed: true`).
  - O runtime interpola a 30/60 fps dinamicamente na camada superior de composição.
- **C2PA Metadata**: Vinculado via `tt_c2pa_sdk.dll` para injetar credenciais criptográficas de autenticidade no container MP4/MOV exportado.

### 10.3 Criptografia
- **BoringSSL** embarcado (fork do OpenSSL pelo Google)
- Suporte a RSA, EC, DSA, PKCS12, TLS 1.3
- Comunicação de rede via **Cronet** (sscronet.dll) com QUIC/HTTP3

---

## 11. Dependências Nativas de Terceiros Identificadas

| Biblioteca | Evidência | Função |
|---|---|---|
| FFmpeg (avcodec-61) | DLL | Codec de vídeo/áudio |
| FFmpeg (avfilter-10) | DLL | Pipeline de filtros |
| BoringSSL | Strings de erro | Criptografia TLS |
| Chromium/CEF | libcef.dll | UI web |
| Qt 6.x | Qt6Core/Gui/Widgets | Janela nativa |
| Lynx (ByteDance) | lynx.dll | UI mobile |
| Intel OpenVINO | openvino.dll | Inferência IA em CPU/GPU |
| Python 3.11 | python311.dll | Scripts Python |
| Bun runtime | bun.exe (107MB) | JavaScript runtime |
| ANGLE (OpenGL→D3D) | VEAngle/ | Compatibilidade OpenGL |
| SVT-AV1 | SvtAv1Enc.dll | Encoder AV1 |
| Lyra codec | lyra_cli_client.dll | Codec áudio IA Google |
| C2PA SDK | tt_c2pa_sdk.dll | Autenticidade de conteúdo |
| DirectX Shader Compiler | dxcompiler.dll | Compilação HLSL |
| Breakpad | minidump_stackwalk | Crash reporting |
| Parfait | parfait_crash_handler | Crash framework |
| ICU | icudtl.dat (10MB) | Unicode/internacionalização |

---

## 12. Plugins, Interoperabilidade e Web Manifests

### 12.1 Plugin Open Effects (`smart_cut.ofx.bundle`)
- **Padrão OFX Nativo**: Implementa `OfxGetNumberOfPlugins` e `OfxGetPlugin`.
- **Aceleração**: Vinculado a `libGLESv2.dll` e `cccreator.dll`.
- **Objetivo**: Plugin de segmentação/corte inteligente que opera como filtro de GPU acelerado via OpenGL ES 2.0 / ANGLE.

### 12.2 Conversão e Importação de Drafts (OpenTimelineIO)
No diretório `Tools/draft-converter/_internal/opentimelineio/`, foram identificados adaptadores padrão:
- `otio_aaf_adapter`: Suporte a Avid AAF.
- `otio_fcpx_xml_adapter`: Suporte a Final Cut Pro X XML.
- `otio_fcp_adapter`: Suporte a Apple Final Cut Pro 7 XML.
- **Relevância para o LeccorCut**: Essa mesma biblioteca (OpenTimelineIO) pode ser adotada diretamente para importar e exportar timelines entre CapCut, DaVinci Resolve, Premiere e LeccorCut.

### 12.3 Especificação do `web-manifest.json`
Localizado em `Resources/common_agent/app/web-manifest.json`:
- **Schema**: `common-agent.web-manifest.v1`
- **Contrato de Host**: `requires: { productHostApi: { minVersion: "1", maxVersion: "1" } }`
- **Entradas (Entries)**: `commonagent` (`commonagent/index.html`) e `videoStudio` (`video-studio/index.html`).
- **Integridade**: Dicionário `hashes` mapeia o SHA-256 de cada script, imagem e worker para verificação estrita antes da execução pelo CEF.

---

## 13. Pipeline de Renderização e Orquestração (`VECreator.dll`)

- **VESDK Core**: Inicializado via `SceneCoreUtils::initVESDK`. Controla transações de draft (`draftTransaction`, `draftCommit`) e despacho de eventos do player (`vesdk_player_events`).
- **Orquestrador de Materiais IA**: `agent::AgentMaterialPipelineOrchestrator` — coordena transcodificação de mídia (`preemptTranscodeAndUpload`, `processTranscodeTask`), upload assíncrono e agendamento de artefatos gerados por IA.
- **IPC Mojo para Efeitos**: `mojom::EffectPlatformService` — interface IPC entre o processo da UI e o serviço de efeitos Davinci/Loki (`EffectPlatformServiceImpl`).
- **UI QML Integrada**: Janelas de autor de efeitos como `LokiAuthorPopupWindow.qml` integradas diretamente sobre a viewport de edição.

---

## 14. Processo de Inicialização e Bootstrap Multiprocesso

O ciclo de vida da aplicação divide responsabilidades em vários processos especializados:

1. **Launcher Principal (`Apps\CapCut.exe` — 4.97 MB)**:
   - Lê `ProductInfo.xml` e `Configure.ini`.
   - Verifica atualizações diferenciais pendentes via `CapCut-DiffUpgrade.exe`, `hpatchz.exe` e `courgette64.exe`.
   - Spawna o executável da versão atual: `Apps\9.6.0.4097\CapCut.exe` (90 KB).

2. **Core Bootstrap (`Apps\9.6.0.4097\CapCut.exe`)**:
   - Inicializa `VESafeGuard.dll` (`safe_guard_first_load`) para proteção contra falhas prematuras.
   - Carrega `VEConfig.dll` e inicializa o runtime Qt6.
   - Spawna os processos auxiliares nativos:
     - `VEDetector.exe`: Força seleção de GPU dedicada (NVIDIA Optimus / AMD PowerXpress) e gerencia download de drivers incompatíveis.
     - `VEHelper.exe`: Coleta telemetria e diagnósticos de execução para `https://pc-mon-va.byteoversea.com`.
     - `ttdaemon.exe`: Processo isolado que inicializa CUDA (`cuInit`, `cuLaunchKernel`) e expõe a engine de efeitos `FRAMEWORK::LENS` sem sobrecarregar a UI principal.
     - `bun.exe` (107 MB): Runtime JS de alta performance em background que hospeda o `common_agent`.

3. **Bridge Node.js / Bun (`agent_runtime_addon.node` — 521 KB)**:
   - Módulo N-API nativo (`napi_register_module_v1`).
   - Monitora o processo pai via `startParentProcessWatchdog(parentPid)`.
   - Roteia exceções e handoff de crash para `Bun__handoffCrashHandlerToExternalReporter`.

---

## 15. Arquitetura da UI e JavaScript Bridge (Multi-Framework)

### 15.1 Coexistência na Janela
* **Janela Base:** Qt6 (`QMainWindow` / `QQuickView`).
* **Viewport e Timeline:** Renderizados via Qt Quick / Direct3D / ANGLE com aceleração de hardware direta.
* **Painéis Web (Sidebar, Video Studio, Agent Hub):** Instâncias de Chromium Embedded Framework (`libcef.dll`) acopladas como HWNDs filhos dentro dos layouts do Qt.
* **Componentes Móveis:** Lynx UI (`lynx.dll`) para cards dinâmicos e telas de assinatura.

### 15.2 Comunicação e Bridge JS nativo
Três canais de comunicação coexistem:
1. `window.cefQuery({ request: JSON.stringify({ callType, data }) })`: Roteador assíncrono nativo do CEF.
2. `window.Capcut?.JSBridge`: Objetos de invocação direta com métodos `.call()`, `.invoke()`, `.postMessage()`.
3. `window.videoStudioNativeBridge?.postMessage({ version: 1, type, payload })`: Mensageria orientada a eventos para o Video Studio.

**Chamadas de Bridge Mapeadas:**
- `ackAgentHubHostModeLayout`, `getAgentHubCreationConfig`
- `getUserSubscriptionInfo`, `getVipInfo`, `showVipPaywallModal`
- `openAgentHubDeepLink`, `requestAgentHubWorkspaceActionFromAssets`
- `setAgentHubSidebarWidth`, `finishAgentHubMediaDrag`, `showToast`
- Eventos transacionais de timeline: `beforeCreate`, `beforeTransaction`, `transaction`, `selectionUpdate`, `update`, `create`, `destroy`.

---

## 16. Subsistema de Áudio e Voz

* **Engine de Áudio `mammon` (`audioeffect.dll` — 2.102 exports)**:
  - `WaveformVisualizer@mammon`: Geração e amostragem de dados de onda senoidal para a timeline (`getPoints`, `getPointsInterleaved`).
  - Buffers de Baixa Latência: `CycleFifoBufferX`, `DynamicDelayAdjustX`.
  - Tratamento Acústico: Cancelamento de eco `AEC` / `AecMicSelection`, redução de ruído `realtime_denoises`.
* **Reconhecimento de Voz Panther (`speechsdk.dll` — 778 exports)**:
  - Motor `lab::speech::client::Engine` e inferência de fala `PthInfer@panther` com decodificador `PthLMDecoderOptions`.
  - Permite geração de transcrições e legendas automáticas offline diretamente no binário nativo.
* **Codec Lyra (`lyra_cli_client.dll` — 53 exports)**:
  - Codec neural do Google de ultra-baixa taxa de bits para transmissão em tempo real de áudio de voz.

---

## 17. Formatos Binários dos Modelos de IA (`ByteNN` e `SAMI`)

A análise de assinatura binária (magic headers) revelou dois padrões primários:
1. **Modelos `.bytenn` (ByteDance Neural Network)**:
   - Header: `42 4d 00 04` (`BM\x00\x04`).
   - Usado para redes neurais de segmentação rápida, matting e detecção de corte de cenas (`nn_denoise.bytenn`, `jy_compressShotDetectBackbone.bytenn`, `win_lens_wm_embed_model.bytenn`).
2. **Modelos `.model` de Áudio (SAMI Framework)**:
   - Header: `53 41 4d 49` (`SAMI` = *Speech, Audio, and Music Intelligence*).
   - Usado para modelos como `aec44k_resnet_echo_cancellation_v1.2.model`.
3. **Modelos de Visão Computacional**:
   - Compilados para OpenVINO (`openvino.dll`) e AmazingEngine com cabeçalhos de matrizes pré-compiladas para NPU/GPU.

---

*Gerado em: 2026-10-15 | Fonte: engenharia reversa estática e arquitetural completa (Fases 1 e 2) do CapCut v9.6.0.4097*
