FROM oven/bun:1.2.8

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "--cwd", "packages/geoip-x402-agent", "start"]