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
- `src/lib/models.ts` — full fal.ai model catalog (38 image, 130+ video)
- `src/app/templates/page.tsx` — template CRUD + runner (TemplateForm, TemplateRunner)

Auth: dual mode — SSO JWT from Agent Factory OR Email OTP (fallback)
Templates: stored in data/templates.json, shared across users
