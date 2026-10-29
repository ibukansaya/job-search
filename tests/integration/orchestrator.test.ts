import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { unlinkSync } from "node:fs"
import { loadConfig } from "../../src/core/config"
import { runScraper } from "../../src/orchestrator"
import { JobDatabase } from "../../src/storage/db"

const TEST_DB = "data/test_integration_orchestrator.db"

describe("orchestrator integration", () => {
  beforeEach(() => {
    try {
      unlinkSync(TEST_DB)
    } catch {}
  })

  afterAll(() => {
    try {
      unlinkSync(TEST_DB)
    } catch {}
  })

  test("runScraper is exported and callable", () => {
    expect(typeof runScraper).toBe("function")
  })

  test("loadConfig with non-existent path returns valid defaults", () => {
    const config = loadConfig("non_existent_config_path.json")
    expect(config).toBeDefined()
    expect(config.positions.length).toBeGreaterThan(0)
    expect(config.workTypes.length).toBeGreaterThan(0)
    expect(config.portals.jobstreet).toBe(true)
    expect(config.portals.linkedin).toBe(true)
    expect(config.portals.glints).toBe(true)
    expect(config.portals.kalibrr).toBe(true)
    expect(config.maxAgeDays).toBe(3)
    expect(config.rateLimitDelayMs).toBe(800)
  })

  test("initializing database with clean state", () => {
    const db = new JobDatabase(TEST_DB)
    const stats = db.getStats()
    expect(stats.total).toBe(0)
    expect(stats.notified).toBe(0)
    db.close()
  })
})
