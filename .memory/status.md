## 2026-06-29: Billing system deployed + Git workflow

Done:
- SQLite billing system: $5/day limit, budget check, cost recording, fal.ai balance
- Sidebar UI: daily spend bar, fal balance, username
- fal.ai balance fix: credits.current_balance (not credits.balance)
- Bitbucket repo created (kinomoltd/avatar-studio), all code pushed
- D30 source synced to local repo

Pending:
- Set up git clone on D30 (replace SCP deploy with git pull)
- D30 AppUser divergence: local types.ts has old AppUser (falKey/anthropicKey), D30 has hasFalKey
- Need to fully sync local types.ts with D30 version
- Phase 4a: Mask preview with canvas overlay
- Phase 4b: Export with FFmpeg

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
