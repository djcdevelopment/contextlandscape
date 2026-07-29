FROM node:24-bookworm-slim AS base
WORKDIR /workspace
ENV npm_config_update_notifier=false npm_config_fund=false

FROM base AS deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/scenarios/package.json packages/scenarios/package.json
COPY packages/discord-adapter/package.json packages/discord-adapter/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/simulator/package.json apps/simulator/package.json
COPY apps/lab/package.json apps/lab/package.json
RUN npm ci

FROM deps AS source
COPY . .

FROM source AS verify
RUN npm run build
RUN npm run typecheck
RUN npm test

FROM verify AS runtime-build
RUN npm prune --omit=dev

FROM verify AS lab
ENV NODE_ENV=production
RUN chown -R node:node /workspace
USER node
CMD ["node", "apps/lab/dist/main.js"]

FROM base AS runtime
ENV NODE_ENV=production
COPY --chown=node:node --from=runtime-build /workspace/node_modules ./node_modules
COPY --chown=node:node --from=runtime-build /workspace/package.json ./package.json
COPY --chown=node:node --from=runtime-build /workspace/packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=node:node --from=runtime-build /workspace/packages/engine/package.json ./packages/engine/package.json
COPY --chown=node:node --from=runtime-build /workspace/packages/scenarios/package.json ./packages/scenarios/package.json
COPY --chown=node:node --from=runtime-build /workspace/apps/server/package.json ./apps/server/package.json
COPY --chown=node:node --from=runtime-build /workspace/apps/server/dist ./apps/server/dist
COPY --chown=node:node --from=runtime-build /workspace/apps/web/dist ./apps/web/dist
COPY --chown=node:node --from=runtime-build /workspace/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=runtime-build /workspace/packages/engine/dist ./packages/engine/dist
COPY --chown=node:node --from=runtime-build /workspace/packages/scenarios/dist ./packages/scenarios/dist
COPY --chown=node:node --from=runtime-build /workspace/data/lab ./data/lab
RUN mkdir -p /workspace/data/playtests && chown node:node /workspace/data/playtests
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD node -e "fetch('http://127.0.0.1:8080/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/main.js"]

FROM source AS dev
ENV NODE_ENV=development
EXPOSE 8080 5173
CMD ["npm", "run", "dev:server"]
