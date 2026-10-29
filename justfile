# ID Job Scraper & Discord Automation

default:
    @just --list

# Run a one-time job scrape using local Bun
scrape:
    bun run src/index.ts

# Test Discord webhook connectivity with a sample embed card
test-discord:
    bun run src/index.ts --test-discord

# Manually dispatch pending unnotified jobs from SQLite to Discord (default: 50)
dispatch-pending count="50":
    bun run src/index.ts --dispatch-pending {{count}}

# Re-send N newest jobs from SQLite to Discord (default: 5)
resend count="5":
    bun run src/index.ts --resend {{count}}

# Run scraper in watch/dev mode
dev:
    bun --watch run src/index.ts

# Run automated tests
test:
    bun test

# Run TypeScript typecheck / lint
lint:
    bunx tsc --noEmit

# Run unit tests only
test-unit:
    bun test tests/unit

# Run integration tests only
test-integration:
    bun test tests/integration

# Install Playwright Chromium browser
install-browsers:
    bunx playwright install chromium

# Build Docker image
docker-build:
    docker compose build

# Start Docker container in background (daemon mode)
docker-up:
    docker compose up -d

# Stop running Docker container
docker-down:
    docker compose down

# Run one-off scrape container
docker-run:
    docker compose run --rm scraper bun run src/index.ts

# Tail container logs
docker-logs:
    docker compose logs -f

# Query SQLite database stats
db-stats:
    bun run src/storage/db.ts --stats

# List pending unnotified jobs
db-pending:
    bun run src/storage/db.ts --pending

# Purge jobs from SQLite that don't match config.json positions
db-purge:
    bun run src/storage/db.ts --purge

# Clean database (testing only)
clean-db:
    rm -f data/jobs.db
