FROM node:22-alpine

WORKDIR /app

# Dependências primeiro: essa camada só é refeita quando o package.json muda.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# A cópia local das tabelas vive aqui; monte um volume para ela sobreviver ao
# recriar o container.
ENV CACHE_DIR=/app/.cache
RUN mkdir -p /app/.cache && chown -R node:node /app/.cache

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
