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
