# Deployment image: the 宁翼智能助手 app (server + built web) with the
# Hermes Agent CLI available so Agent mode works. If Hermes is omitted at
# runtime, Agent mode degrades gracefully to Chat mode.
#
# NOTE: confirm the Hermes install command against current docs
# (https://hermes-agent.nousresearch.com/docs).

FROM nikolaik/python-nodejs:python3.11-nodejs20

ARG HERMES_VERSION=v0.15.1
ENV HERMES_HOME=/root/.hermes \
    PIP_NO_CACHE_DIR=1 \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep \
    && rm -rf /var/lib/apt/lists/*

# ── Install Hermes Agent (pinned) ───────────────
RUN git clone --depth 1 --branch "${HERMES_VERSION}" \
      https://github.com/NousResearch/hermes-agent.git /opt/hermes-agent \
    && cd /opt/hermes-agent \
    && pip install -e .

WORKDIR /app

# ── Install deps (cached layer) ─────────────────
COPY server/package*.json ./server/
COPY web/package*.json ./web/
RUN npm --prefix server ci && npm --prefix web ci

# ── Build both ──────────────────────────────────
COPY . /app
RUN npm --prefix server run build \
    && npm --prefix web run build

# Server listens on 8787; built web is in web/dist (serve via reverse proxy
# or a static host). Provide DEEPSEEK_API_KEY + JWT_SECRET at runtime.
EXPOSE 8787

# Health: server reports hermes ok/offline at /api/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:8787/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

WORKDIR /app/server
ENTRYPOINT ["node", "dist/index.js"]
