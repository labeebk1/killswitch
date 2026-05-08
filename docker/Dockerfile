# Killswitch CLI container — container-by-default execution environment
#
# The CLI re-execs itself into this image when Docker is available.
# Security model:
#   - No host network egress beyond WS to killswitch server + Claude OAuth
#   - Workspace mounted RW at /workspace
#   - :3000 and :3001 exposed to host loopback only
#   - No root process; drops to uid=1001 (killswitch)
#
# Build:
#   docker build -t ghcr.io/labeebk1/killswitch-cli:<tag> -f docker/Dockerfile .
#
# The CLI pins to a specific image digest (not just a tag) so re-exec is
# reproducible. The pinned digest is updated by the publish pipeline on release.

FROM node:22-bookworm-slim AS base

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      git \
      curl \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -g 1001 killswitch && \
    useradd -u 1001 -g killswitch -m -s /bin/bash killswitch

WORKDIR /app

# ----- deps layer -----
FROM base AS deps

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ----- final layer -----
FROM base AS final

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Workspace mount point — the CLI mounts the competitor's workspace here
RUN mkdir -p /workspace && chown killswitch:killswitch /workspace

# Claude auth cache — persisted as a named volume so OAuth tokens survive
# container re-exec across reconnects within a match
RUN mkdir -p /home/killswitch/.claude && \
    chown -R killswitch:killswitch /home/killswitch/.claude

USER killswitch

# Ports exposed to host loopback (--publish 127.0.0.1:3000:3000 etc.)
EXPOSE 3000 3001

# HOME must be set for Claude SDK to find its auth cache
ENV HOME=/home/killswitch
ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/cli/index.js"]
