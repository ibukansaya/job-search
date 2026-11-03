# System Architecture & Design

This document details the internal design, deduplication mechanics, database persistence, and external service contracts for the ID Job Scraper automation.

---

## Processing Pipeline

```
+--------------------------------------------------------------------------------------------------+
|                                        ORCHESTRATOR LOOP                                         |
|                                                                                                  |
|  1. Configuration Matrix                                                                         |
|     (positions[] x workTypes[] x active portals[])                                               |
|                                     |                                                            |
|                                     v                                                            |
|  2. Parallel / Paced Portal Scraping                                                             |
|     (REST APIs / Playwright Browser Context)                                                     |
|                                     |                                                            |
|                                     v (scanned candidates)                                       |
|  3. Deduplication Filter                                                                         |
|     Deterministic Canonical Key -> check data/jobs.db (isSeen)                                    |
|                                     |                                                            |
|                                     v (unseen new jobs only)                                     |
|  4. [Optional] 9Router AI Enrichment                                                             |
|     OpenAI SDK chat.completions.create -> Tech Stack Array + 1-Sentence Summary                  |
|                                     |                                                            |
|                                     v                                                            |
|  5. SQLite Candidate Persistence                                                                 |
|     INSERT INTO jobs (...) VALUES (..., notified_discord = 0)                                    |
|                                     |                                                            |
|                                     v                                                            |
|  6. Discord Webhook Dispatcher                                                                   |
|     Format branded embeds (chunks of 5) -> POST to webhook with 429 retry backoff                |
|                                     |                                                            |
|                                     v (successfully dispatched keys)                             |
|  7. SQLite Notification Commitment                                                               |
|     UPDATE jobs SET notified_discord = 1 WHERE key IN (...)                                      |
+--------------------------------------------------------------------------------------------------+
```

---

## 1. Deterministic Deduplication Algorithm

The scraper processes jobs across multiple portals that frequently list identical roles from the same company with minor variations in title casing, punctuation, or tracking parameters.

Implemented in `src/core/dedup.ts`, the `makeKey(company, title)` function generates a stable canonical string:

1. **Normalization & Slugification:**
   - Converts strings to lowercase.
   - Applies Unicode NFKD decomposition (`normalize("NFKD")`).
   - Strips non-alphanumeric characters, keeping hyphens.
   - Collapses consecutive whitespace and dashes into a single hyphen (`-`).
2. **Length Boundaries:**
   - `company`: capped at 40 characters.
   - `title`: capped at 60 characters.
3. **Disambiguation Hashing:**
   - If either the company or title is truncated, or resolves to an empty slug (e.g. non-Latin symbols), a deterministic 8-character SHA-1 hash is appended:
     ```ts
     const raw = `${company.trim().toLowerCase()}::${title.trim().toLowerCase()}`
     const hash = createHash("sha1").update(raw).digest("hex").slice(0, 8)
     return `${compSlug}_${titlSlug}_${hash}`
     ```
4. **Standard Output:**
   - Output format: `<company-slug>_<title-slug>` (e.g., `traveloka_software-backend-engineer-central-tech`).

---

## 2. Storage & SQLite Database

Database operations are encapsulated in `src/storage/db.ts` utilizing native `bun:sqlite` with zero external npm dependencies.

### Database Schema
```sql
CREATE TABLE IF NOT EXISTS jobs (
  key TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  portal TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  work_type TEXT,
  salary TEXT,
  url TEXT NOT NULL,
  posted_date TEXT,
  description_snippet TEXT,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notified_discord INTEGER DEFAULT 0,
  tech_stack TEXT,
  summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_notified ON jobs(notified_discord);
```

### Safety & Concurrency Guarantees
- **WAL Mode:** Automatically enabled on connection (`PRAGMA journal_mode = WAL;`) to support concurrent readers without blocking writes.
- **Two-Phase Notification:**
  - Postings are first inserted with `notified_discord = 0`.
  - Only after the Discord webhook returns an HTTP 200/204 is an atomic transaction executed to mark `notified_discord = 1`.
  - If the scraper crashes or the network drops during dispatch, unnotified candidates are preserved in SQLite.

---

## 3. Discord Dispatcher & Rate Limiting

The dispatcher in `src/services/discord.ts` manages formatting and rate-limited transport to Discord webhooks:

### Embed Design
- **Author:** Company name.
- **Title:** `[WorkType] Job Title` hyperlinked to the original posting URL.
- **Color Coding:** Each portal has a distinct brand color:
  - JobStreet: `#830051` (Berry)
  - LinkedIn: `#0A66C2` (LinkedIn Blue)
  - Kalibrr: `#1F8CEB` (Kalibrr Blue)
  - Glints: `#EF4546` (Glints Red)
  - Dealls: `#2B6CB0` (Dealls Indigo)
  - Tech in Asia: `#EE3124` (TIA Red)
  - Indeed: `#2164F4` (Indeed Blue)
  - Glassdoor: `#0CAA41` (Glassdoor Green)
- **Inline Fields:** Company, Location, Work Type, Salary, Portal, Posted Date.
- **Extended Fields:** Extracted Tech Stack tags, AI role summary, or job description snippet.

### Batching & Rate-Limit Handling
- Groups jobs by destination thread ID (`thread_id` query parameter) so a message batch never mixes threads.
- Sends batches of **5 embeds per message** (Discord maximum is 10).
- Applies `DISCORD_DELAY_MS` (default 2500ms) between consecutive webhook POST requests.
- Automatic HTTP 429 backoff: reads `retry_after` from Discord's response and sleeps for the requested duration before retrying.

### Destination Routing
- `findBestMatchingPosition` resolves each stored title against `config.positions` at dispatch time, using the configured names/aliases, `priority`, and `excludeKeywords`.
- Jobs that match no configured position stay pending (never posted to the parent channel).
- Pending rows are paged in 50-row pages so unmatched records cannot starve later matching jobs when a dispatch limit is set.

---

## 4. AI Enrichment Pipeline (9Router / OpenAI)

Implemented in `src/services/ai.ts`, enrichment runs through any OpenAI-compatible API gateway (e.g., 9Router or OpenAI direct):

### Zero-Overhead Bypass Rule
If `AI_ENRICH_ENABLED` is not set to `"true"` or `NINEROUTER_BASE_URL` is empty, the function immediately returns the input jobs synchronously. Zero external HTTP requests are made, adding 0ms latency.

### Structured Output Extraction
When enabled, requests run in bounded parallel chunks of 3 with `response_format: { type: "json_object" }`:

```json
{
  "techStack": ["Golang", "Kubernetes", "PostgreSQL", "Kafka"],
  "summary": "Develops high-throughput payment settlement microservices for financial platforms."
}
```

The resulting tech stack tags and summary are persisted into SQLite and displayed on Discord embed cards.
