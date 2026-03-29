FROM oven/bun:1.2.8-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN bun install

COPY src ./src
COPY scripts ./scripts
COPY README.md ./README.md
COPY SUBMISSION.md ./SUBMISSION.md

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "start"]