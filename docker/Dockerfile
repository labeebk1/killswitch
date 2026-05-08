# Killswitch CLI container — container-by-default execution environment
#
# The CLI re-execs itself into this image when Docker is available.
# Security model:
#   - No host network egress beyond WS to killswitch server + Claude OAuth
#   - Workspace mounted RW at /workspace
#   - :3000 and :3001 exposed to host loopback only
#   - Non-root: uid=1001 (killswitch)
#
# The CLI pins to a specific image digest (not just a tag) via docker/PINNED_IMAGE.
# The publish-docker workflow updates that file on each release.

FROM node:22-bookworm-slim AS base

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      git \
      curl \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

RUN groupadd -g 1001 killswitch && \
    useradd -u 1001 -g killswitch -m -s /bin/bash killswitch

WORKDIR /app

# ----- deps layer -----
FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/cli/package.json ./packages/cli/

RUN pnpm install --frozen-lockfile --prod

# ----- build layer -----
FROM deps AS build

RUN pnpm install --frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/
COPY packages/cli/ ./packages/cli/

RUN pnpm -r build

# ----- final layer -----
FROM base AS final

COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/cli/dist ./packages/cli/dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/cli/package.json ./packages/cli/

# Workspace mount point
RUN mkdir -p /workspace && chown killswitch:killswitch /workspace

# Claude auth cache — persisted via named volume so OAuth tokens survive reconnects
RUN mkdir -p /home/killswitch/.claude && \
    chown -R killswitch:killswitch /home/killswitch/.claude

USER killswitch

EXPOSE 3000 3001

ENV HOME=/home/killswitch
ENV NODE_ENV=production

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
