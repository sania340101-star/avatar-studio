## 2026-06-29: Template v2 + Batch Generation deployed

Done:
- Template v2: slots[] architecture, TemplateForm with slot cards, clone-and-add "+"
- Batch generation: /api/jobs/batch, createBatchJobs (skips prepare/review)
- BatchRunner UI: instruction, shared sources, 2s polling, per-slot results, lightbox + download
- Gallery lightbox (in-page preview instead of new tab) + download buttons
- Sidebar: email display, always-visible version, theme toggle removed
- Server-side jobs: prepare → review → generate flow, in-memory job store
- SQLite billing: $5/day limit, budget check, cost recording, fal.ai balance
- Git pull-based deploy to D30 (path: /srv/workspaces/system/avatar-studio/prod/)

Pending (waiting for Alex to test batch generation first):
- Phase 5: Post-processing pipeline (video review, resize, reorder, export/concatenate)
- Phase 4a: Mask preview with canvas overlay
- Phase 4b: Export with FFmpeg
- Generate Video page: template selector/shortcut (currently only from Templates page)

## 2026-06-26: MCP architecture deployed and tested

Done:
- Claude CLI + fal-mcp installed on D30, verified working
- Agent wrapper (server.js) deployed as systemd service (avatar-agent.service)
- best-claude-key endpoint on D32 (AdminPanel restarted)
- Avatar Studio generate flow rewritten (single-step via agent)
- Container rebuilt on D30, E2E test passed
- Full chain: UI → route.ts → agent wrapper → D32 key pool → Claude CLI → fal-mcp → result

Pending:
- Phase 4a: Mask preview with canvas overlay
- Phase 4b: Export with FFmpeg
- Clean up old ANTHROPIC_API_KEY from container .env

## 2026-06-26: Phase 3e — Per-project cache deployed

Done:
- Server-side form cache: `data/cache/{projectId}.json`
- API: GET/PUT `/api/project-cache?projectId=X&type=image|video`
- `useProjectCache` hook: debounced auto-save (800ms), auto-load on project switch
- Generate Image: caches references, instruction, model pref, size, resolution
- Generate Video: caches instruction, model pref, type filter, duration, all refs
- Flush on project switch + page unload (keepalive fetch)
- Cache cleanup on project delete

Also pending:
- AdminPanel restart on D32 for llm-query endpoint (OAuth proxy for Prepare Generation)
- UI review + mobile polish (Phase 3e continued)

## 2026-06-25: Phase 3b + 3c + Templates complete

Done:
- Phase 3a: Foundation — pages, build, Docker deploy, full model catalog, SSO auth fix
- Phase 3b: Projects, version history, image picker, gallery, persistent storage
- Phase 3c: Email OTP authentication (nodemailer, SMTP configurable)
- Templates: create presets with model/params/prompt/device, use within projects

Pending:
- Phase 4a: Mask preview with canvas overlay (HYPERVSN device outline on result)
- Phase 4b: Export with FFmpeg (resize/crop for device)
- Pipeline: batch generation through templates (lower priority)
