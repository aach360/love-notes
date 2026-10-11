FROM oven/bun:1.4.3
WORKDIR /app/agent
COPY agent/package.json agent/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY agent/*.ts ./
COPY src/shared/types.ts /app/src/shared/types.ts
ENV PHOTON_STATE_DIR=/data/photon
VOLUME ["/data/photon"]
CMD ["bun", "run", "index.ts"]
