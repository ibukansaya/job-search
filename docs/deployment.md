# Deployment & Operations Guide

This guide covers production deployment options, daemon operation, Docker containerization, and scheduled CI/CD workflows.

---

## 1. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_WEBHOOK_URL` | Optional | `""` | Discord channel webhook URL. If unset or invalid, jobs are safely printed to stdout (dry run). |
| `DISCORD_DELAY_MS` | Optional | `2500` | Delay between consecutive Discord embed batch dispatches in milliseconds. |
| `TZ` | Optional | `Asia/Jakarta` | Timezone for the container and daemon scheduling (e.g. `Asia/Jakarta`, `UTC`). |
| `SCHEDULE_DAILY_AT` | Optional | `08:00` | Fixed daily time (HH:MM) to trigger scrape cycles in daemon mode. |
| `SCRAPE_INTERVAL_HOURS` | Optional | `24` | Interval in hours between scrape cycles (used if `SCHEDULE_DAILY_AT` is unset). |
| `RUN_ON_BOOT` | Optional | `true` | When true, triggers an immediate scrape cycle when container boots before waiting for schedule. |
| `AI_ENRICH_ENABLED` | Optional | `false` | Set to `"true"` to enable 9Router/OpenAI tech stack extraction and 1-paragraph summary. |
| `NINEROUTER_BASE_URL` | Optional | `""` | Base URL of 9Router or OpenAI-compatible gateway (e.g. `http://127.0.0.1:20128/v1`). |
| `NINEROUTER_API_KEY` | Optional | `dummy` | API key for 9Router or OpenAI. |
| `NINEROUTER_MODEL` | Optional | `openai/gpt-4o-mini` | Model identifier to request from the gateway. |
| `CHROMIUM_PATH` | Optional | Auto-detected | Custom path to Chromium binary (used in Alpine Docker containers). |
---

## 2. Running Locally (Daemon Mode)

To run the scraper continuously as a local background daemon:

```bash
# Using Bun directly
bun run src/index.ts --daemon

# Using watch mode for development (restarts on file change)
just dev
```

In daemon mode:
1. Runs an initial scrape cycle immediately upon startup.
2. Gracefully handles `SIGINT` and `SIGTERM` signals, closing the SQLite database and Playwright browser instances before exiting.
3. Sleeps for `SCRAPE_INTERVAL_HOURS` before triggering the next cycle.

---

## 3. Docker Container Deployment

The project provides an optimized multi-stage `Dockerfile` based on `oven/bun:alpine`. Because Alpine Linux does not support Playwright's precompiled Ubuntu binaries, Chromium and its system dependencies are installed directly via Alpine's package manager:

```dockerfile
FROM oven/bun:alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY package.json bun.lock* tsconfig.json ./
RUN bun install --frozen-lockfile || bun install
COPY . .
VOLUME ["/app/data"]
CMD ["bun", "start"]
```
### Preparing Configuration
```bash
cp .env.example .env
cp config.example.json config.json
```

### Starting the Daemon Container
# Build the image
just docker-build
# or: docker compose build

# Start daemon in background
just docker-up
# or: docker compose up -d

# Inspect running logs
just docker-logs
# or: docker compose logs -f

# Stop the container
just docker-down
# or: docker compose down
```

### Volume Persistence
The `./data` folder is mounted as a volume into `/app/data`:
- Postings recorded in `data/jobs.db` survive container restarts, rebuilds, and updates.
- SQLite WAL mode operates reliably over standard volume mounts.

---

## 4. Continuous Integration (GitHub Actions)

Automated CI is configured at `.github/workflows/ci.yml`.

### Triggers
- Every push to `main`.
- Every pull request targeting `main`.
- Manual trigger via `workflow_dispatch`.

### Validation Steps
1. **Setup Bun:** Uses `oven-sh/setup-bun@v2`.
2. **Install:** `bun install --frozen-lockfile`.
3. **Lint & Typecheck:** `bun run lint` (`bunx tsc --noEmit`).
4. **Test Suite:** `bun test` (all unit and integration tests).

Scraping cron and Discord dispatches are handled strictly by your Docker VM daemon, not GitHub Actions.
---

## 5. Monitoring & Database Maintenance

Inspect database metrics at any time:

```bash
# View summary statistics
just db-stats

# Output example:
# Database: data/jobs.db
# Total jobs: 69
# Notified: 69
# Pending: 0
```

To clean the database for local development or test reset:
```bash
just clean-db
```
