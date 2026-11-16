# ============================================================
# XAUUSD Decision Desk — image tunggal (API + client build).
# Stage build: vite build + prisma generate.
# Stage runtime: tsx menjalankan server/ + spawn mcp-bridge via `node --import tsx`.
# ============================================================
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY --from=build /app/client/dist ./client/dist
# Sumber server dijalankan apa adanya lewat tsx (tanpa build step).
COPY server ./server
COPY shared ./shared
COPY mcp-bridge ./mcp-bridge
COPY prisma ./prisma
COPY tsconfig.json prisma7.config.ts ./
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
