FROM oven/bun:1.2

WORKDIR /app

COPY package.json tsconfig.json ./
RUN bun install

COPY src ./src
COPY .env.example ./.env.example

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["bun", "run", "start"]