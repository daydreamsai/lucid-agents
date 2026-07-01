FROM oven/bun:1.2

WORKDIR /app
COPY . .

WORKDIR /app/apps/news-headlines-agent
RUN bun install

EXPOSE 3000
CMD ["bun", "run", "start"]