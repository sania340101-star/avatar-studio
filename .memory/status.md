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
