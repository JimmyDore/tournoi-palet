# Image unique de tournoi-palet.jimmydore.fr : le serveur Fastify sert le build
# Vite (dist/), l'API et le WebSocket /ws. Le serveur TypeScript est exécuté
# tel quel par Node (type stripping), sans étape de compilation.

# --- Build ---------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# --- Runtime -------------------------------------------------------------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 DATA_DIR=/data
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
# scripts/backup.mjs <dest> : snapshot SQLite lancé par deploy/backup.sh via `docker exec`.
COPY --from=build /app/scripts ./scripts
# /data est normalement monté (/root/tournoi-palet-data, uid 1000) ; le créer ici
# permet aussi de lancer l'image seule en local.
RUN mkdir -p /data && chown node:node /data
EXPOSE 8787
# Utilisateur `node` (uid 1000) : /root/tournoi-palet-data lui appartient sur l'hôte.
USER node
# wget vient de busybox. 127.0.0.1 plutôt que localhost, qui peut viser ::1.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8787/health"]
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server/index.ts"]
