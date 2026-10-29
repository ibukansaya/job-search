import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { loadConfig } from "../core/config"
import { isJobTitleRelevant } from "../core/filter"
import type { Job, NormalizedWorkType, PortalName } from "../core/types"

export class JobDatabase {
  private db: Database

  constructor(dbPath: string = "data/jobs.db") {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(dbPath)
    this.db.run("PRAGMA journal_mode = WAL;")
    this.init()
  }

  private init() {
    this.db.run(`
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
    `)
  }

  isSeen(key: string): boolean {
    const row = this.db.query("SELECT 1 FROM jobs WHERE key = ? LIMIT 1").get(key)
    return Boolean(row)
  }

  saveCandidate(job: Job, key: string): boolean {
    if (this.isSeen(key)) {
      return false
    }

    const techStackJson = job.aiAnalysis?.techStack ? JSON.stringify(job.aiAnalysis.techStack) : null
    const summary = job.aiAnalysis?.summary || null

    this.db.run(
      `INSERT INTO jobs (
        key, id, portal, title, company, location, work_type, salary,
        url, posted_date, description_snippet, notified_discord, tech_stack, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        key,
        job.id,
        job.portal,
        job.title,
        job.company,
        job.location,
        job.workType,
        job.salary || null,
        job.url,
        job.postedDate,
        job.descriptionSnippet || null,
        techStackJson,
        summary
      ]
    )
    return true
  }

  markNotified(keys: string[]): void {
    if (keys.length === 0) return
    const stmt = this.db.prepare("UPDATE jobs SET notified_discord = 1 WHERE key = ?")
    const tx = this.db.transaction((targetKeys: string[]) => {
      for (const k of targetKeys) {
        stmt.run(k)
      }
    })
    tx(keys)
  }

  getPendingJobs(limit = 50): Array<{ job: Job; key: string }> {
    const rows = this.db
      .query(
        `SELECT key, id, portal, title, company, location, work_type, salary,
                url, posted_date, description_snippet, tech_stack, summary
         FROM jobs
         WHERE notified_discord = 0
         ORDER BY first_seen_at ASC
         LIMIT ?`
      )
      .all(limit) as Array<{
      key: string
      id: string
      portal: string
      title: string
      company: string
      location: string | null
      work_type: string | null
      salary: string | null
      url: string
      posted_date: string
      description_snippet: string | null
      tech_stack: string | null
      summary: string | null
    }>

    return rows.map((r) => {
      let techStack: string[] | undefined
      if (r.tech_stack) {
        try {
          techStack = JSON.parse(r.tech_stack)
        } catch {}
      }

      return {
        key: r.key,
        job: {
          id: r.id,
          title: r.title,
          company: r.company,
          location: r.location || "Indonesia",
          workType: (r.work_type as NormalizedWorkType) || "Unknown",
          salary: r.salary || undefined,
          url: r.url,
          postedDate: r.posted_date,
          portal: r.portal as PortalName,
          descriptionSnippet: r.description_snippet || undefined,
          aiAnalysis:
            techStack || r.summary
              ? {
                  techStack: techStack || [],
                  summary: r.summary || ""
                }
              : undefined
        }
      }
    })
  }
  resetRecentNotified(limit = 5): number {
    const rows = this.db
      .query("SELECT key FROM jobs ORDER BY first_seen_at DESC LIMIT ?")
      .all(limit) as Array<{ key: string }>
    if (rows.length === 0) return 0
    const keys = rows.map((r) => r.key)
    const stmt = this.db.prepare("UPDATE jobs SET notified_discord = 0 WHERE key = ?")
    const tx = this.db.transaction((targetKeys: string[]) => {
      for (const k of targetKeys) stmt.run(k)
    })
    tx(keys)
    return keys.length
  }

  purgeIrrelevantJobs(allowedPositions: string[]): number {
    const rows = this.db.query("SELECT key, title FROM jobs").all() as Array<{
      key: string
      title: string
    }>
    const toDelete = rows
      .filter((r) => !isJobTitleRelevant(r.title, allowedPositions))
      .map((r) => r.key)

    if (toDelete.length === 0) return 0
    const stmt = this.db.prepare("DELETE FROM jobs WHERE key = ?")
    const tx = this.db.transaction((keys: string[]) => {
      for (const k of keys) stmt.run(k)
    })
    tx(toDelete)
    return toDelete.length
  }

  getStats(): { total: number; notified: number } {
    const totalRow = this.db.query("SELECT COUNT(*) as c FROM jobs").get() as { c: number }
    const notifiedRow = this.db.query("SELECT COUNT(*) as c FROM jobs WHERE notified_discord = 1").get() as { c: number }
    return {
      total: totalRow?.c ?? 0,
      notified: notifiedRow?.c ?? 0
    }
  }

  close(): void {
    this.db.close()
  }
}

// CLI usage: bun run src/storage/db.ts --stats [path]
if (import.meta.main) {
  const args = process.argv.slice(2)
  const dbPath = args[1] || "data/jobs.db"
  const db = new JobDatabase(dbPath)
  if (args.includes("--purge")) {
    const config = loadConfig("config.json")
    const count = db.purgeIrrelevantJobs(config.positions)
    console.log(`[db] Purged ${count} irrelevant jobs from ${dbPath} based on config.json`)
  } else if (args.includes("--pending")) {
    const pending = db.getPendingJobs(50)
    console.log(`Pending Unnotified Jobs (${pending.length}):`)
    for (const p of pending) {
      console.log(`- [${p.job.portal.toUpperCase()}] ${p.job.title} @ ${p.job.company} (${p.key})`)
    }
  } else if (args.includes("--stats") || args.length === 0) {
    const stats = db.getStats()
    console.log(`Database: ${dbPath}`)
    console.log(`Total jobs: ${stats.total}`)
    console.log(`Notified: ${stats.notified}`)
    console.log(`Pending: ${stats.total - stats.notified}`)
  }
  db.close()
}
