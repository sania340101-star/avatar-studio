## 2026-07-14: Unified Templates + Gallery batch types

- TemplateTabs component (`src/components/TemplateTabs.tsx`): shared tab switcher between /pose-matrix and /templates
- Sidebar: single "Templates" entry linking to /pose-matrix with match on both paths
- Slots TemplateForm: auto-save via debounced PATCH (600ms), no explicit save buttons
- "New Template" creates record via POST immediately, opens in edit mode (always editing existing)
- Seamless Loop UI removed from SlotCard (settings remain in Export editor only)
- Pose presets: `data/pose-presets.json`, CRUD via `/api/pose-presets`, seeded from `src/lib/pose-preset-defaults.ts`
- Gallery batch detection: `gen.params.poseMatrixName` → Pose Matrix, `gen.params.templateName` → Slots
- Pose Matrix batches show clip type breakdown (transitions/loops), pose names in expanded view

## 2026-07-02: Dual-window display + server sync for HDMI output

- `/export/[id]/display` page — fullscreen black background + mask SVG, no AppShell
- BroadcastChannel (`avatar-display-{sessionId}`) for same-browser real-time sync
- `/api/display-sync` — in-memory state store for cross-device sync (polling 300ms)
- Editor PATCHes transform/clip state to server on every change
- Display polls server as fallback when BroadcastChannel unavailable (different device)
- Window Management API to auto-open display on second monitor (HDMI)
- Keyboard controls on display: arrows (5px, +Shift 20px), +/- (scale), Escape (exit fullscreen)
- Auto-fullscreen on display page load
- "Open Display" button in MASK PREVIEW section, tracks window state

Key files:
- `src/app/export/[id]/display/page.tsx` — fullscreen display page
- `src/app/export/[id]/page.tsx` — BroadcastChannel setup, syncToServer(), Open Display button
- `src/app/api/display-sync/route.ts` — in-memory GET/PATCH with 1h auto-cleanup

Status: deployed but server sync needs debugging (BroadcastChannel works, server polling untested)

## 2026-07-02: Auto-fit pose detection for export mask (v1.10.41)

- MediaPipe PoseLandmarker (browser WASM + GPU) analyzes all clips in playlist
- Multi-frame sampling: every 0.5s per clip, deduplicates by URL
- 33 body landmarks per frame, visibility threshold 0.5
- First-frame landmarks tagged as `isAnchor` — used for horizontal centering only
- expandLandmarks: 20% above head, 15% below feet (0.97 for full-body), 30% sides — synthetic boundary points (not anchors)
- tryFit: X offset = maskCx - first-frame body center. Y offset = maskTopY + 20 - global topmost point
- Binary search 0.5-3.0 (30 iterations): finds max scale where ALL points fit inside padded mask circles
- Safety Padding: slider 0-100px, shrinks mask circle radii for autofit. maskTopY computed from padded circles
- Post-search shift: best.offsetY -= 80 to raise person above dead pixel zone between circles
- Progress callback: stage (loading/analyzing/computing), clip/frame counters, diagnostic debug string
- Dynamic import of @mediapipe/tasks-vision (no SSR)

Key files:
- `src/lib/autofit.ts` — analyzeAutofit() module: MediaPipe loading, frame sampling, pose detection, binary search
- `src/app/export/[id]/page.tsx` — Auto-fit button, progress UI, runAutofit() handler
- `package.json` — @mediapipe/tasks-vision dependency

## 2026-07-02: Upload from device + touch drag + audio export

- ExportClip: generationId/projectId now optional, added `source: 'generation' | 'upload'`
- Upload via existing /api/upload → /api/files/{filename} — FFmpeg resolveLocalPath() works unchanged
- Touch drag-n-drop: touchstart/touchmove/touchend on [data-drag-handle], visual lift (scale+shadow), translateY follow, drop indicator line
- Audio: removed hardcoded `-an`, now conditionally: `muteAudio ? -an : -map 0:a? -c:a aac -b:a 128k`
- ExportSession.muteAudio: boolean field, persisted, checkbox in RENDER section
- Sidebar spending: always rendered with placeholder "—" to prevent layout shift
- Clip tags: fileHash() extracts last 6 chars of filename, duplicate count via url equality check

Key files:
- `src/app/export/[id]/page.tsx` — addUploadedClip(), handleTouchStart/Move/End, fileHash(), mute checkbox
- `src/app/api/exports/render/route.ts` — conditional -an vs audio passthrough
- `src/components/Sidebar.tsx` — spending always rendered
- `src/lib/types.ts` — ExportClip.source, ExportSession.muteAudio

## 2026-07-01: FFmpeg export pipeline + version history

- `/api/exports/render` (route.ts): background FFmpeg processing via floating Promise
- FFmpeg filter per clip: `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${scaledW}:${scaledH},setsar=1` → overlay on black canvas at transform offset
- Concat demuxer: process clips individually → concat list → copy-mux final output
- Output: device resolution (930×2174 HH 1x3 / 880×880 Solo) @ 60fps, libx264 CRF 18
- Dockerfile: `RUN apk add --no-cache ffmpeg` in runner stage
- Generation type extended: `'image' | 'video' | 'export'` — exports saved as Generation records
- ExportVersion[] on ExportSession — each render appends new version
- MaskPreview: ref-based video switching (useRef + useEffect on src change, no React remount)
- Client-side duration: hidden video element + loadedmetadata event
- Gallery: GalleryEntry union type handles single + batch, batch delete via batchMap lookup

Key files:
- `src/app/api/exports/render/route.ts` — FFmpeg pipeline, processExport(), resolveLocalPath()
- `src/components/MaskPreview.tsx` — SVG clip-path masks, pointer drag, scale slider
- `src/app/export/[id]/page.tsx` — export editor, version history, duration probing
- `src/app/gallery/page.tsx` — batch grouping + delete, export tab filter
- `Dockerfile` — FFmpeg in runner stage

## 2026-07-01: Batch grouping + enriched generation records

- Generation type: added optional `batchId?: string` field
- BatchRunner saves batchId + enriched params (instruction, duration, aspectRatio, quality, fps, strategy, templateDefined:true) per slot
- VersionHistory: groups generations by batchId into single card with mosaic, template name, slot count, per-slot details
- Gallery (gallery/page.tsx): same grouping logic, batch checkbox selects/deselects all gens in batch
- UpdateBanner component: polls /api/version every 30s, shows floating banner on version mismatch
- MediaPreview component: universal lightbox for image/video/audio, fetch+blob download stays in-app
- Cost estimation: agent/server.js fetches fal.ai pricing, caches in pricingCache, estimates cost for per-second models

Key files:
- `src/components/VersionHistory.tsx` — HistoryEntry union type (single|batch), grouping by batchId
- `src/components/MediaPreview.tsx` — universal media lightbox
- `src/components/UpdateBanner.tsx` — version polling + update notification
- `src/app/api/version/route.ts` — returns APP_VERSION from build-time env
- `src/app/gallery/page.tsx` — GalleryEntry grouping, batch selection

## 2026-06-29: Template v2 with batch generation

- Templates redesigned: single model config → slots[] array (each slot = full generation config)
- TemplateSlot: modelId, modelLabel, typeFilter, instruction, duration, aspectRatio, quality, fps, strategy, references[]
- Templates are global (not tied to projects), slots cloneable via "+" button
- Batch generation: POST /api/jobs/batch creates N jobs (one per slot), skips prepare/review
- getBatchJobs polls all jobs by batchId, sorted by slotIndex
- BatchRunner UI on Templates page: instruction input, shared sources, progress polling (2s), per-slot results
- Budget check at batch creation time

Key files:
- `src/app/api/jobs/batch/route.ts` — batch create (POST) and poll (GET)
- `src/lib/jobs.ts` — createBatchJobs, getBatchJobs
- `src/app/templates/page.tsx` — TemplateForm (slot cards), TemplateList, BatchRunner

## 2026-06-29: SQLite billing system

- SQLite `billing.db` in Docker volume (`/app/data/billing.db`, WAL mode)
- Tables: `spending` (user_id, cost_usd, model, gen_type, created_at), `user_limits` (user_id, daily_limit_usd)
- Default daily limit: $5.00 per user
- `/api/generate` checks budget before calling agent, records cost after success
- `/api/user/spending` returns daily spend, limit, remaining, fal.ai balance
- fal.ai balance: fetched via `GET https://api.fal.ai/v1/account/billing?expand=credits`, field `credits.current_balance`, cached 60s
- falKey stored server-side in session (sessions.ts), spending endpoint reads via x-session-id header
- Sidebar UI: progress bar (green→yellow→red), fal.ai balance, username
- Dependency: `better-sqlite3` (native, needs python3+make+g++ in Docker build stage)
- `next.config.ts`: `serverExternalPackages: ['better-sqlite3']`

Key files:
- `src/lib/billing.ts` — SQLite module: record, getDailySpent, checkBudget, getFalBalance
- `src/app/api/user/spending/route.ts` — spending + fal balance endpoint
- `src/app/api/generate/route.ts` — budget check + cost recording

## 2026-06-29: Git workflow established

- Bitbucket: `kinomoltd/avatar-studio` (origin), GitHub: backup (github remote)
- Local repo synced with D30 production state
- Next step: set up git clone on D30 for pull-based deploys

## 2026-06-26: MCP architecture — Claude CLI + fal-mcp on D30

- Replaced direct fal.ai REST API with Claude CLI + fal-mcp agent architecture
- Agent wrapper: `agent/server.js` on D30 host (port 3391, systemd: avatar-agent.service)
- Flow: UI → route.ts (proxy) → agent wrapper → Claude CLI → fal-mcp → fal.ai
- Claude keys: rotated from D32 key pool via GET /api/internal/best-claude-key
- Per-request temp .mcp.json with user's fal key in auth headers (cleaned up after)
- Claude CLI flags: --print --output-format json --max-turns 15 --model haiku --allowedTools
- Single-step generation: user writes instruction, agent selects model + crafts prompt + generates
- Image and video pages merged from two-step (prepare+generate) to one-step flow
- Removed: /api/prepare-generation endpoint, review step UI, direct fal.ai queue polling
- Container .env: AGENT_URL=http://172.18.16.24:3391

Key files:
- `agent/server.js` — HTTP wrapper bridging Docker → Claude CLI on D30 host
- `agent/.env` — AF_INTERNAL_URL, INTERNAL_SERVICE_KEY, AGENT_PORT
- `src/app/api/generate/route.ts` — simple proxy to agent wrapper
- D32: `admin-panel/api/internal/auth.js` — best-claude-key endpoint

## 2026-06-26: Video agent flow + expandable version history

- Video generation page rewritten to two-step agent flow (same as image)
- Step 1: refs + model pref (auto/group/specific) + type filter + duration + instruction → "Prepare Generation"
- Step 2: agent reasoning + editable prompt/model/duration → "Generate Video"
- prepare-generation API: added VIDEO_SYSTEM_PROMPT, handles type='video' with video-specific context
- New helpers: isVideoModelGroupId(), getVideoModelIdsInGroup() in models.ts
- VersionHistory: expandable cards with full details (prompt, instruction, reasoning, params, result thumbnails)
- Explicit "Load Parameters" button replaces click-to-load behavior
- Mobile responsive: collapsible sidebar, stacked forms
- Light/dark theme: light default, toggle in Settings + sidebar

## 2026-06-26: Agent-based generation + OTP fix + editable keys

- Two-step image generation flow: Instruction → Agent (Claude Sonnet) → Review/Edit → Generate
- Agent API: `/api/prepare-generation` — receives instruction, refs, model pref, desired params
- Agent selects optimal model (auto/group/specific), generates prompt, adjusts params
- User reviews: editable prompt, model, params with adjustment highlights
- Model selection: Auto / Group (group:flux, group:nano-banana...) / Specific
- New params: IMAGE_SIZE_OPTIONS, IMAGE_RESOLUTION_OPTIONS
- New exports: isImageModelGroupId, getImageModelIdsInGroup

- OTP: when SMTP not configured, returns code in response, shown in UI
- SMTP: HYPERVSN uses M365 (smtp.office365.com), needs credentials to configure
- Settings: editable fal.ai key + Anthropic API key, sign out button
- AppUser: added anthropicKey field, extracted from JWT serviceKeys.anthropic_api_key
- Sidebar: searchable project selector with dropdown (search shown when >5 projects)

## 2026-06-25: Project-based architecture with versioning

- Next.js 16 App Router with standalone Docker output
- SSO auth via JWT from Agent Factory (token forwarded through redirect)
- fal.ai Queue API for image/video generation (38 image + 130+ video models)
- Project-based workflow: sidebar project selector, all gens saved per-project
- JSON storage: `data/projects.json` + `data/generations/{projectId}.json`
- File uploads: `data/uploads/` served via `/api/files/[...path]`
- Docker volume `app-data` mounted at `/app/data` for persistence
- Deployed on D30: `/srv/workspaces/system/avatar-studio/prod/`
- Domain: `avatar-studio.app.local` via Traefik

Key files:
- `src/lib/storage.ts` — server-side JSON CRUD with atomic writes (projects, generations, templates)
- `src/lib/ProjectContext.tsx` — React context for active project
- `src/lib/otp.ts` — Email OTP generation, verification, nodemailer SMTP
- `src/components/ImagePicker.tsx` — pick from project gallery or upload
- `src/components/VersionHistory.tsx` — generation history timeline
- `src/components/ReferenceUpload.tsx` — multi-type reference upload (image/video/audio)
- `src/lib/models.ts` — full fal.ai model catalog (38 image, 130+ video)
- `src/app/templates/page.tsx` — template CRUD + runner (TemplateForm, TemplateRunner)
- `src/app/api/prepare-generation/route.ts` — Claude Sonnet agent for prompt generation

Auth: dual mode — SSO JWT from Agent Factory OR Email OTP (fallback)
Templates: stored in data/templates.json, shared across users

## 2026-07-13: Generation pipeline stability hardening

- `fetchAgent()` — 5 min timeout + 3x retry with backoff (2/4/8s) for transient network errors
- `falRequestId` saved to job.input immediately after agent returns (enables recovery)
- `validateProxiedFile()` — rejects downloaded files < 1KB (catches corrupt downloads)
- `extractVideoUrl()` + `processVideoResult()` — shared helpers for runGenerate + recoverFromFal
- `recoverFromFal()` — polls fal.ai directly by saved requestId, fetches result when COMPLETED
- `recoverJob()` — exported, used by `/api/jobs/[id]/recover` endpoint
- `runGenerateThrottled()` — semaphore wrapper, max 3 concurrent generations for batch jobs
- Recover button in BatchRunner + PoseMatrixRunner (green, shown only when falRequestId exists)
- `recovering` job status added to JobStatus type
