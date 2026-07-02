## 2026-07-02: Auto-fit + Export UX polish (v1.8.4 → v1.10.0)

Done:
- Upload from device: mp4/webm/mov, multi-file, drag-drop zone in browser modal (v1.8.4)
- Touch drag-n-drop: mobile playlist reorder with visual feedback — lift, follow finger, drop indicator (v1.8.5-1.8.6)
- Removed up/down arrows (drag is sufficient) (v1.8.7)
- Sidebar layout fix: spending section always rendered with placeholder, no shift on load (v1.9.0)
- Clip distinguishability: file hash tag (#abc123), duplicate count badge (×2), two-line labels, source tags (v1.9.0)
- Audio export: preserves original audio by default (removed -an), "Mute audio" checkbox toggle (v1.9.0)
- Auto-fit pose detection: MediaPipe WASM in browser, all clips analyzed, binary search max scale, 5% safety padding (v1.10.0)

Decided NOT needed:
- Per-clip transform — global transform is correct behavior, all clips should match
- Email OTP — already works via SSO D32

Pending:
- Testing auto-fit with real avatar clips — may need tuning

## 2026-07-01: Phase 4 complete — Export v1.8.3

All done (v1.6.0 → v1.8.3):
- Steps 4.1+4.2: ExportSession/ExportClip types, storage CRUD, playlist builder, video browser
- Step 4.3: MaskPreview component (SVG clip-path, drag reposition, scale slider, device masks)
- Step 4.5: FFmpeg export (scale→crop→overlay filter chain, concat demuxer, 60fps, libx264 CRF 18)
- FFmpeg in Docker runner stage (apk add ffmpeg)
- Ref-based video switching (no React remount flash)
- Sequential player with clip lock/loop
- Export versioning: each Export creates new ExportVersion, version history with thumbnails
- Client-side duration probing, per-clip + total duration display
- Gallery: Exports tab, batch delete, status badge → version count
- Mobile fixes: Reset button overflow, scale controls spacing

## 2026-07-01: Gallery collapsed/expanded redesign + lightbox UX (v1.5.7)

Done:
- Gallery cards now collapsed by default (like VersionHistory): thumbnail, badges, prompt preview, expand arrow
- Expanded view: full prompt, instruction, agent reasoning, params, results with lightbox + download
- Batch cards: 2x2 mosaic thumbnail, left accent border, per-slot cards on expand
- Checkboxes work independently from expand/collapse (stopPropagation)
- Project name badge: blue with folder icon, always visible (not just "All Projects" filter)
- Lightbox buttons unified across all components (Gallery, VersionHistory, BatchRunner):
  gap-6, 44x44px rounded-full tap targets for mobile
- VersionHistory lightbox: added missing download button
- Batch slot cards enriched: instruction, aspectRatio, quality, fps, strategy params

## 2026-07-01: Batch grouping, gallery grouping, enriched params (v1.5.5-1.5.6)

Done:
- Version notification system: UpdateBanner polls /api/version every 30s, shows "Update available" on mismatch
- Cost estimation for template batch generation (fal.ai pricing API with caching in agent)
- Per-slot cost display in BatchRunner slot summary + total estimate
- MediaPreview component: universal lightbox for image/video/audio with in-app fetch+blob download
- Preview/lightbox for all reference types (ReferenceUpload, ImagePicker, image page inline refs)
- Video references as visual thumbnails with play icon (not text rows)
- Batch grouping in Version History: generations with same batchId shown as single card
  - Collapsed: 2x2 mosaic, template name, slot count, total cost
  - Expanded: per-slot cards with model, cost, video preview, instruction, params (duration, aspectRatio, quality, fps)
- Batch grouping in Gallery: same batchId logic, "template" badge, slot cards, total cost, batch checkbox
- Enriched batch save: instruction, duration, aspectRatio, quality, fps, strategy saved in params
- batchId field added to Generation type

Pending:
- Phase 3c: Email OTP — SMTP not configured on D30
- Phase 4a: Mask preview with canvas overlay
- Phase 4b: Export with FFmpeg
- Phase 5: Post-processing pipeline (video review, resize, reorder, export/concatenate)

## 2026-06-30: UX Polish + fal.ai CDN upload fix

Done:
- Strategy selector for image generation (Economy/Balance/Quality) — same 3-button grid as video
- fal.ai CDN upload: server.js uploads local files (references, sourceVideo, sourceImage, audioUrl, endImage) to fal CDN before passing to Claude
- Version History always visible in video generation (was hidden when template selected)
- Image form modelPref restored from project cache (was missing)
- Agent process restarted on D30 with updated server.js
- Obsidian plan updated with Phase 3 sub-phase breakdown

Pending:
- Phase 3c: Email OTP — SMTP not configured on D30
- Phase 4a: Mask preview with canvas overlay
- Phase 4b: Export with FFmpeg
- Test fal.ai CDN upload with real template + video references

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
