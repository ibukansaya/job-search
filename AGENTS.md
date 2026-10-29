# AGENTS.md

Instructions, invariants, and guidelines for AI coding agents and contributors working in this repository.

---

## 1. Core Architectural Invariants

1. **TypeScript Strictness (No `any`):**
   - Never use `: any` or `as any`.
   - Use `unknown` with `err instanceof Error ? err.message : String(err)` in `catch` blocks.
   - Use domain interfaces defined in `src/core/types.ts`.
2. **Native Runtimes Over Dependencies:**
   - Use Bun built-in APIs: `bun:sqlite` for database, native `fetch` for HTTP, `Bun.sleep` for delays.
   - Do not add external HTTP libraries (e.g. `axios`, `got`) or ORMs (e.g. `prisma`, `typeorm`).
3. **Zero-Browser Fast Path:**
   - Prefer direct public REST or guest API endpoints over headless browsers.
   - Only use Playwright Chromium (`getBrowserContext()` from `src/services/browser.ts`) when Cloudflare WAF, Turnstile, or Next.js SSR hydration prevents direct HTTP access.
4. **Browser Resource Management:**
   - When using Playwright in a portal scraper:
     - Always allocate a new page: `const page = await context.newPage()`.
     - Always close the page in a `finally` block: `await page.close().catch(() => {})`.
     - Never launch a separate browser instance per query; reuse the singleton context from `src/services/browser.ts`.
5. **Deterministic Deduplication:**
   - All portal postings must be keyed via `makeKey(job.company, job.title)` from `src/core/dedup.ts`.
   - Never use raw portal IDs alone as primary keys across portals (different portals use colliding integer or UUID formats).

---

## 2. Directory Organization

```
job-search/
├── src/
│   ├── core/
│   │   ├── types.ts          # Unified entities, enums, and portal contracts
│   │   ├── config.ts         # Config schema, defaults, and file loader
│   │   └── dedup.ts          # Deterministic slug + SHA1 hashing logic
│   ├── storage/
│   │   └── db.ts             # Bun SQLite manager, table schemas, stats CLI
│   ├── services/
│   │   ├── ai.ts             # 9Router OpenAI SDK enrichment
│   │   ├── discord.ts        # Discord embed builder & rate-limited sender
│   │   └── browser.ts        # Lazy Playwright Chromium context manager
│   ├── portals/
│   │   ├── index.ts          # Portal scraper registry
│   │   ├── jobstreet.ts      # SEEK v5 REST client
│   │   ├── linkedin.ts       # LinkedIn guest HTML parser
│   │   ├── kalibrr.ts        # Kalibrr REST client
│   │   ├── glints.ts         # Glints REST + Playwright fallback
│   │   ├── dealls.ts         # Sejutacita public REST client
│   │   ├── techinasia.ts     # Tech in Asia v2.0 REST client
│   │   ├── indeed.ts         # Indeed ID Playwright DOM scraper
│   │   └── glassdoor.ts      # Glassdoor ID Playwright DOM scraper
│   ├── orchestrator.ts       # Matrix scan runner & notification pipeline
│   └── index.ts              # CLI & background daemon entrypoint
├── tests/
│   ├── unit/                 # Pure unit tests (db, dedup, discord, config)
│   └── integration/          # Integration tests (orchestrator, portals)
├── docs/                     # Technical domain documentation
├── README.md                 # General project documentation
└── AGENTS.md                 # Agent instructions and invariants
```

---

## 3. How to Add a New Portal Scraper

Follow this exact 7-step checklist when adding a new portal:

1. **Implement Scraper (`src/portals/<name>.ts`):**
   - Create class `<Name>Scraper` implementing `PortalScraper`.
   - Implement `search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]>`.
   - Add a self-test block: `if (import.meta.main) { ... }`.
2. **Update Portal Union (`src/core/types.ts`):**
   - Add portal identifier to `PortalName`:
     ```ts
     export type PortalName = "..." | "<name>"
     ```
3. **Add Discord Brand Color (`src/services/discord.ts`):**
   - Register brand hex color in `PORTAL_COLORS`:
     ```ts
     const PORTAL_COLORS: Record<PortalName, number> = {
       ...
       <name>: 0xHEXCOLOR
     }
     ```
4. **Register in Portal Registry (`src/portals/index.ts`):**
   - Export `<Name>Scraper`.
   - Add `<name>: new <Name>Scraper()` to `getScrapers()`.
5. **Update Default Configuration (`src/core/config.ts` & `config.json`):**
   - Add `<name>: true` to `DEFAULT_CONFIG.portals` in `src/core/config.ts`.
   - Add `"<name>": true` to `config.json`.
6. **Update Integration Tests (`tests/integration/portals.test.ts`):**
   - Add `<name>` to `expectedPortals` array in `tests/integration/portals.test.ts`.
7. **Verify Everything:**
   ```bash
   just test
   bun run src/portals/<name>.ts
   ```

---

## 4. Verification & Testing Rules

- **Do not mock trivial things:** Unit tests in `tests/unit/` must exercise real hashing (`dedup.test.ts`), real in-memory SQLite transactions (`db.test.ts`), and config loading (`config.test.ts`).
- **Separation of Tests:**
  - Unit tests live exclusively in `tests/unit/`.
  - Integration tests live exclusively in `tests/integration/`.
  - No `*.test.ts` files should reside directly inside `src/`.
- **Pre-flight Commands Before Handing Off:**
  ```bash
  just test              # Must pass 100% (unit + integration)
  just db-stats          # Must return valid metrics without SQL errors
  ```
