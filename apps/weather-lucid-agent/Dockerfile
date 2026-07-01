FROM oven/bun:1.2.4

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "src/index.ts"]