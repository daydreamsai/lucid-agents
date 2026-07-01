FROM oven/bun:1.2.4

WORKDIR /app
COPY . .

RUN bun install

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "start"]