## Avatar Studio Deploy Workflow

### Architecture
- **Frontend**: Next.js in Docker container on D30 (`/srv/workspaces/system/avatar-studio/prod/`)
- **Agent**: Node.js service on D30 host (`/srv/workspaces/system/avatar-studio/prod/agent/`)
- **Systemd**: `avatar-agent.service` runs agent/server.js
- **Git remote**: GitHub (`origin`) — `sania340101-star/avatar-studio`
- **Domain**: `avatar-studio.app.local` via Traefik

### Deploy Sequence

```bash
# 1. Commit and push (local)
rtk git -C D:/project/avatar-studio add <files>
rtk git -C D:/project/avatar-studio commit -m "<message>"
rtk git -C D:/project/avatar-studio push github master

# 2. Pull on D30
ssh -o ConnectTimeout=10 user@172.18.16.24 "cd /srv/workspaces/system/avatar-studio/prod && git pull origin master 2>&1"

# 3. Check agent status BEFORE restart
ssh -o ConnectTimeout=10 user@172.18.16.24 "curl -s http://172.18.16.24:3391/status"
# Returns: {"ok":true,"version":"X.Y.Z","activeRequests":N,"uptime":...}
# If activeRequests > 0 → agent is processing! ASK user before restart.

# 4. Rebuild Docker (frontend changes)
ssh -o ConnectTimeout=10 user@172.18.16.24 "cd /srv/workspaces/system/avatar-studio/prod && sudo docker compose up -d --build 2>&1"

# 5. Safe restart agent (only if agent code changed)
ssh -o ConnectTimeout=10 user@172.18.16.24 "sudo systemctl restart avatar-agent"

# 6. Verify
ssh -o ConnectTimeout=10 user@172.18.16.24 "curl -s http://172.18.16.24:3391/health"
ssh -o ConnectTimeout=10 user@172.18.16.24 "sudo docker ps | grep avatar"
```

### Key Rules
- SSH user: `user@172.18.16.24` (NOT ai.agent, NOT bvk)
- Git user on D30: set via `-c user.name='Avatar Studio' -c user.email='avatar-studio@hypervsn.com'`
- Agent .env at `prod/agent/.env` (gitignored) — contains INTERNAL_SERVICE_KEY
- Main .env at `prod/.env` (gitignored) — contains all app secrets
- ALWAYS check `/status` activeRequests before restarting agent
- Docker rebuild only needed for frontend changes (src/, Dockerfile)
- Agent restart only needed for agent/server.js changes
