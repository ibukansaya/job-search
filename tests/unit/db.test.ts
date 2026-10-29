import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, unlinkSync } from "node:fs"
import type { Job } from "../../src/core/types"
import { JobDatabase } from "../../src/storage/db"

const TEST_DB = "data/test_unit_db.db"

function cleanupTestFiles(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${TEST_DB}${suffix}`
    if (existsSync(file)) {
      try {
        unlinkSync(file)
      } catch {}
    }
  }
}

describe("JobDatabase unit tests", () => {
  let db: JobDatabase

  beforeEach(() => {
    if (db) {
      try {
        db.close()
      } catch {}
    }
    cleanupTestFiles()
    db = new JobDatabase(TEST_DB)
  })

  afterAll(() => {
    if (db) {
      try {
        db.close()
      } catch {}
    }
    cleanupTestFiles()
  })

  const sampleJob: Job = {
    id: "job-101",
    title: "Fullstack Engineer",
    company: "Tech Corp",
    location: "Jakarta, Indonesia",
    workType: "Remote",
    salary: "IDR 20,000,000",
    url: "https://example.com/job-101",
    postedDate: "2026-10-29",
    portal: "jobstreet",
    descriptionSnippet: "TypeScript and React role",
    aiAnalysis: {
      techStack: ["TypeScript", "React", "Node.js"],
      summary: "Fullstack developer position with TypeScript stack."
    }
  }

  test("saveCandidate inserts new candidate and rejects duplicate key", () => {
    const key = "tech-corp_fullstack-engineer"

    expect(db.isSeen(key)).toBe(false)
    const firstInsert = db.saveCandidate(sampleJob, key)
    expect(firstInsert).toBe(true)
    expect(db.isSeen(key)).toBe(true)

    const secondInsert = db.saveCandidate(sampleJob, key)
    expect(secondInsert).toBe(false)
  })

  test("markNotified updates notified flag and getStats reflects state", () => {
    const key1 = "tech-corp_fullstack-engineer-1"
    const key2 = "tech-corp_fullstack-engineer-2"

    const initialStats = db.getStats()
    expect(initialStats.total).toBe(0)
    expect(initialStats.notified).toBe(0)

    db.saveCandidate({ ...sampleJob, id: "job-1" }, key1)
    db.saveCandidate({ ...sampleJob, id: "job-2" }, key2)

    const savedStats = db.getStats()
    expect(savedStats.total).toBe(2)
    expect(savedStats.notified).toBe(0)

    db.markNotified([key1])

    const afterOneNotified = db.getStats()
    expect(afterOneNotified.total).toBe(2)
    expect(afterOneNotified.notified).toBe(1)

    db.markNotified([key2])

    const afterAllNotified = db.getStats()
    expect(afterAllNotified.total).toBe(2)
    expect(afterAllNotified.notified).toBe(2)
  })

  test("markNotified handles empty list without error", () => {
    expect(() => db.markNotified([])).not.toThrow()
  })

  test("getPendingJobs returns only unnotified jobs with complete entity", () => {
    const key1 = "tech-corp_fullstack-engineer"
    const key2 = "tech-corp_backend-engineer"
    db.saveCandidate(sampleJob, key1)
    db.saveCandidate({ ...sampleJob, id: "job-102", title: "Backend Engineer" }, key2)

    const initialPending = db.getPendingJobs()
    expect(initialPending.length).toBe(2)
    expect(initialPending[0].key).toBe(key1)
    expect(initialPending[0].job.title).toBe("Fullstack Engineer")

    db.markNotified([key1])

    const remainingPending = db.getPendingJobs()
    expect(remainingPending.length).toBe(1)
    expect(remainingPending[0].key).toBe(key2)
    expect(remainingPending[0].job.title).toBe("Backend Engineer")
  })
})
