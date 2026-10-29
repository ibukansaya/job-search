import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, unlinkSync, writeFileSync } from "node:fs"
import { DEFAULT_CONFIG, loadConfig } from "../../src/core/config"

const TEMP_CONFIG_PATH = "data/test_unit_config.json"

function cleanupTempConfig(): void {
  if (existsSync(TEMP_CONFIG_PATH)) {
    try {
      unlinkSync(TEMP_CONFIG_PATH)
    } catch {}
  }
}

describe("config unit tests", () => {
  afterEach(() => {
    cleanupTempConfig()
  })

  test("returns DEFAULT_CONFIG when file does not exist", () => {
    const config = loadConfig("data/non_existent_config.json")

    expect(config).toEqual(DEFAULT_CONFIG)
    expect(config.positions).toEqual(DEFAULT_CONFIG.positions)
    expect(config.workTypes).toEqual(DEFAULT_CONFIG.workTypes)
    expect(config.portals).toEqual(DEFAULT_CONFIG.portals)
    expect(config.maxAgeDays).toBe(DEFAULT_CONFIG.maxAgeDays)
    expect(config.rateLimitDelayMs).toBe(DEFAULT_CONFIG.rateLimitDelayMs)
  })

  test("overrides defaults when valid config file is provided", () => {
    const customConfig = {
      positions: ["DevOps Engineer", "Site Reliability Engineer"],
      workTypes: ["remote_id"],
      portals: {
        kalibrr: false,
        glints: false
      },
      maxAgeDays: 7,
      rateLimitDelayMs: 1200
    }

    writeFileSync(TEMP_CONFIG_PATH, JSON.stringify(customConfig), "utf-8")

    const loaded = loadConfig(TEMP_CONFIG_PATH)

    expect(loaded.positions).toEqual(["DevOps Engineer", "Site Reliability Engineer"])
    expect(loaded.workTypes).toEqual(["remote_id"])
    expect(loaded.maxAgeDays).toBe(7)
    expect(loaded.rateLimitDelayMs).toBe(1200)
    expect(loaded.portals.kalibrr).toBe(false)
    expect(loaded.portals.glints).toBe(false)
    expect(loaded.portals.jobstreet).toBe(true)
    expect(loaded.portals.linkedin).toBe(true)
  })

  test("falls back to DEFAULT_CONFIG on malformed JSON", () => {
    writeFileSync(TEMP_CONFIG_PATH, "{ invalid json content: true", "utf-8")

    const loaded = loadConfig(TEMP_CONFIG_PATH)

    expect(loaded).toEqual(DEFAULT_CONFIG)
  })
})
