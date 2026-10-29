FROM oven/bun:alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY package.json bun.lock* tsconfig.json ./
RUN bun install --frozen-lockfile || bun install
COPY . .
VOLUME ["/app/data"]
CMD ["bun", "start"]
