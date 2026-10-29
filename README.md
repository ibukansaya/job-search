# ID Job Scraper & Discord Alert Automation

Automated multi-portal tech job scraper built in TypeScript on **Bun** targeting the Indonesian job market and global remote engineering positions. Postings are deduplicated in a local SQLite database and dispatched directly to a Discord webhook as rich embed cards.

---

## Supported Portals (8 Active)

| Portal | Engine | Coverage | Details |
|---|---|---|---|
| **JobStreet** | Direct REST | Indonesia | SEEK v5 REST API (`ID-Main`), ListedDate sorting |
| **LinkedIn** | Guest HTTP | Indonesia + Worldwide | Guest job search API with HTML regex parser |
| **Kalibrr** | Direct REST | Indonesia | Public search API with disclosed salary ranges |
| **Glints** | REST + Playwright | Indonesia | Cloudflare WAF bypass via headless Chromium Next.js hydration |
| **Dealls** | Direct REST | Indonesia | Sejutacita public REST API (`/v1/explore-job/job`) |
| **Tech in Asia** | Direct REST | Indonesia + Regional | Public REST API v2.0 (`/api/2.0/job-postings`) |
| **Indeed Indonesia** | Playwright | Indonesia | Headless DOM scraper with `fromage` normalization |
| **Glassdoor Indonesia** | Playwright | Indonesia | Headless DOM scraper with employer profile & salary estimates |

---

## Features

- **Zero-Browser Fast Path:** 5 of 8 portals (JobStreet, LinkedIn, Kalibrr, Dealls, Tech in Asia) use native `fetch()` without headless browser overhead.
- **Headless Chromium Fallback:** Glints, Indeed, and Glassdoor transparently leverage bundled Playwright Chromium to bypass Cloudflare bot challenges.
- **Deterministic Deduplication:** Canonical key generator (`<company-slug>_<title-slug>_<hash>`) prevents cross-run duplicate alerts even across title variations.
- **Persistent SQLite:** Single-file database (`data/jobs.db`) with Write-Ahead Logging (WAL) and indexed notification state flags.
- **Rate-Limited Discord Dispatcher:** Batches embeds (5 per message), respects Discord 429 `retry_after` headers, and formats branded portal cards.
- **Optional 9Router AI Enrichment:** Extracts tech stack arrays and generates 1-paragraph role summaries using any OpenAI-compatible LLM gateway.

---

## Architecture Overview

```
                                  +-------------------+
                                  |    config.json    |
                                  +---------+---------+
                                            |
                                            v
                                  +-------------------+
                                  |  src/index.ts     | (CLI / Daemon)
                                  +---------+---------+
                                            |
                                            v
+-----------------------------------------------------------------------------------------+
|                                  src/orchestrator.ts                                    |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   | Portal Matrix: JobStreet | LinkedIn | Kalibrr | Glints | Dealls | TIA | Indeed | GD|   |
|   +---------------------------------------+-----------------------------------------+   |
|                                           |                                             |
|                                           v                                             |
|   +---------------------------------------------------------------------------------+   |
|   | Canonical Key Generator (src/core/dedup.ts) + Duplicate Filter (data/jobs.db)   |   |
|   +---------------------------------------+-----------------------------------------+   |
|                                           |                                             |
|                                           v (new postings only)                         |
|   +---------------------------------------------------------------------------------+   |
|   | [Optional] 9Router AI Tech Stack & Summary Extraction (src/services/ai.ts)       |   |
|   +---------------------------------------+-----------------------------------------+   |
|                                           |                                             |
|                                           v                                             |
|   +---------------------------------------------------------------------------------+   |
|   | Discord Webhook Dispatcher (src/services/discord.ts)                            |   |
|   +---------------------------------------+-----------------------------------------+   |
|                                           |                                             |
|                                           v                                             |
|   +---------------------------------------------------------------------------------+   |
|   | SQLite Transaction: Mark notified_discord = 1 (src/storage/db.ts)               |   |
|   +---------------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------------+
```

---

## Quickstart

### 1. Prerequisites
- [Bun](https://bun.sh) `>= 1.1`
- [Just](https://github.com/casey/just) task runner (optional, recommended)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/ersaasyhar/job-search.git
cd job-search

# Install dependencies
bun install

# Install Playwright Chromium browser binary
just install-browsers
# or: bunx playwright install chromium
```

### 3. Environment & Search Configuration
Copy configuration templates:
```bash
cp .env.example .env
cp config.example.json config.json
```

Edit `.env`:
```env
# Discord Webhook URL (Required for alerts)
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR/WEBHOOK/URL"

# 9Router / OpenAI Gateway (Optional: set AI_ENRICH_ENABLED=true)
NINEROUTER_BASE_URL="http://127.0.0.1:20128/v1"
NINEROUTER_API_KEY="sk-dummy"
NINEROUTER_MODEL="openai/gpt-4o-mini"
AI_ENRICH_ENABLED="false"

# Daemon scrape interval in hours
SCRAPE_INTERVAL_HOURS="4"
```

### 4. Run a Scrape
```bash
# Using Just task runner
just scrape

# Or directly with Bun
bun run src/index.ts
```

If `DISCORD_WEBHOOK_URL` is empty, jobs are safely dry-run and printed to stdout.

---

## Configuration (`config.json`)

Customize the search matrix in `config.json`:

```json
{
  "positions": [
    "Software Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Fullstack Developer"
  ],
  "workTypes": [
    "remote_id",
    "remote_worldwide",
    "hybrid",
    "onsite"
  ],
  "portals": {
    "jobstreet": true,
    "linkedin": true,
    "glints": true,
    "kalibrr": true,
    "dealls": true,
    "techinasia": true,
    "indeed": true,
    "glassdoor": true
  },
  "maxAgeDays": 3,
  "rateLimitDelayMs": 800
}
```

- `positions`: Array of target job role keywords.
- `workTypes`: Array of `"remote_id"` (Remote Indonesia), `"remote_worldwide"`, `"hybrid"`, `"onsite"`.
- `portals`: Toggle individual portals on or off.
- `maxAgeDays`: Maximum posting age in days (filters out stale listings).
- `rateLimitDelayMs`: Delay between consecutive portal queries to prevent rate-limiting.

---

## CLI & Task Commands

All automated tasks are managed through `justfile`:

```bash
just scrape             # Run one-off scrape cycle across active portals
just dev                # Run scraper in watch mode (re-runs on file edit)
just test               # Run entire test suite (unit + integration)
just test-unit          # Run unit tests only (tests/unit/)
just test-integration   # Run integration tests only (tests/integration/)
just db-stats           # Show database metrics (total, notified, pending)
just clean-db           # Delete data/jobs.db (testing only)
just install-browsers   # Download Chromium binary for Playwright
just docker-build       # Build Alpine Docker image
just docker-up          # Start Docker daemon in background
just docker-down        # Stop Docker daemon container
just docker-logs        # Follow container logs
```

---

## Docker Deployment

The application includes an optimized `Dockerfile` based on `oven/bun:alpine` with pre-installed Chromium and required system fonts:

```bash
# Build and run background daemon via Docker Compose
docker compose up -d

# Tail logs
docker compose logs -f

# Run one-off scrape container
docker compose run --rm scraper bun run src/index.ts
```

Database state persists across container restarts via the `./data:/app/data` volume mount.

---

## CI Workflow (GitHub Actions)

Automated CI workflow located at `.github/workflows/ci.yml`:
- Triggers on push and pull request to `main`.
- Sets up Bun runtime via `oven-sh/setup-bun@v2`.
- Runs strict TypeScript typecheck / linting (`bun run lint`).
- Runs automated test suite (`bun test`).

## Documentation

- [Portal Implementation Guide](docs/portals.md) — Exhaustive technical analysis of all 8 scrapers, endpoints, authentication, and bypass mechanics.
- [System Architecture](docs/architecture.md) — Pipeline dataflow, deduplication hashing algorithm, SQLite schema, and Discord embed formatting.
- [Deployment & Operations](docs/deployment.md) — Local daemon mode, Docker Compose, Alpine Chromium configuration, and CI/CD.
- [Agent Guidelines](AGENTS.md) — Invariants, conventions, and instructions for AI agents modifying this codebase.
