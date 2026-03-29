FROM oven/bun:1.2.5-alpine

WORKDIR /app
COPY . .

RUN bun install

WORKDIR /app/packages/currency-converter-x402
EXPOSE 3000

CMD ["bun", "run", "start"]