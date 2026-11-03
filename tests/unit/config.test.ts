import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, unlinkSync, writeFileSync } from "node:fs"
import { DEFAULT_CONFIG, loadConfig, validatePositionThreads } from "../../src/core/config"
import type { PositionConfig } from "../../src/core/types"

const TEMP_CONFIG_PATH = "data/test_unit_config.json"

function cleanupTempConfig(): void {
  if (existsSync(TEMP_CONFIG_PATH)) {
    try {
      unlinkSync(TEMP_CONFIG_PATH)
    } catch {}
  }
}

function writeConfig(value: unknown): void {
  writeFileSync(TEMP_CONFIG_PATH, JSON.stringify(value), "utf-8")
}

describe("config unit tests", () => {
  afterEach(() => {
    cleanupTempConfig()
  })

  test("returns DEFAULT_CONFIG when file does not exist", () => {
    const config = loadConfig("data/non_existent_config.json")

    expect(config).toEqual(DEFAULT_CONFIG)
    expect(config.excludeKeywords).toEqual([])
    expect(config.positions.every((p) => typeof p.name === "string")).toBe(true)
  })

  test("overrides defaults when valid config file is provided", () => {
    writeConfig({
      positions: [
        {
          name: "Data Engineer",
          aliases: ["Analytics Engineer"],
          priority: 2,
          discord: { threadId: "  1111111111  " }
        },
        { name: "Platform Engineer", discord: { threadId: "2222222222" } }
      ],
      excludeKeywords: ["sales", "recruiter"],
      workTypes: ["remote_id"],
      portals: { kalibrr: false, glints: false },
      maxAgeDays: 7,
      rateLimitDelayMs: 1200
    })

    const loaded = loadConfig(TEMP_CONFIG_PATH)

    expect(loaded.positions).toEqual([
      { name: "Data Engineer", aliases: ["Analytics Engineer"], priority: 2, discord: { threadId: "1111111111" } },
      { name: "Platform Engineer", discord: { threadId: "2222222222" } }
    ])
    expect(loaded.excludeKeywords).toEqual(["sales", "recruiter"])
    expect(loaded.workTypes).toEqual(["remote_id"])
    expect(loaded.maxAgeDays).toBe(7)
    expect(loaded.rateLimitDelayMs).toBe(1200)
    expect(loaded.portals.kalibrr).toBe(false)
    expect(loaded.portals.glints).toBe(false)
    expect(loaded.portals.jobstreet).toBe(true)
    expect(loaded.portals.linkedin).toBe(true)
  })

  test("rejects the legacy string-array positions format with an actionable error", () => {
    writeConfig({ positions: ["DevOps Engineer", "Site Reliability Engineer"] })

    expect(() => loadConfig(TEMP_CONFIG_PATH)).toThrow(/Legacy positions format/)
    expect(() => loadConfig(TEMP_CONFIG_PATH)).toThrow(/config\.example\.json/)
  })

  test("rejects invalid position shapes instead of silently using defaults", () => {
    const invalidShapes: unknown[] = [
      { positions: [] },
      { positions: [{ name: "Backend Engineer" }] },
      { positions: [{ name: "  ", discord: { threadId: "1" } }] },
      { positions: [{ name: "Backend Engineer", discord: { threadId: 42 } }] },
      { positions: [{ name: "Backend Engineer", discord: { threadId: "1" }, aliases: "Backend Developer" }] },
      { positions: [{ name: "Backend Engineer", discord: { threadId: "1" }, aliases: ["  "] }] },
      { positions: [{ name: "Backend Engineer", discord: { threadId: "1" }, priority: "high" }] },
      { positions: [{ name: "Backend Engineer", discord: { threadId: "1" } }], excludeKeywords: "sales" },
      { positions: [{ name: "Backend Engineer", discord: { threadId: "1" } }], excludeKeywords: [""] }
    ]

    for (const invalid of invalidShapes) {
      writeConfig(invalid)
      expect(() => loadConfig(TEMP_CONFIG_PATH)).toThrow(/\[config\]/)
    }
  })

  test("falls back to DEFAULT_CONFIG on malformed JSON", () => {
    writeFileSync(TEMP_CONFIG_PATH, "{ invalid json content: true", "utf-8")

    const loaded = loadConfig(TEMP_CONFIG_PATH)

    expect(loaded).toEqual(DEFAULT_CONFIG)
  })

  test("validatePositionThreads accepts numeric IDs and rejects placeholders", () => {
    const valid: PositionConfig[] = [{ name: "Backend Engineer", discord: { threadId: "123456789012345678" } }]
    expect(() => validatePositionThreads(valid)).not.toThrow()

    expect(() =>
      validatePositionThreads([{ name: "Backend Engineer", discord: { threadId: "REPLACE_WITH_THREAD_ID" } }])
    ).toThrow(/Backend Engineer/)

    expect(() => validatePositionThreads([{ name: "Backend Engineer", discord: { threadId: "" } }])).toThrow(
      /Backend Engineer/
    )
    expect(() => validatePositionThreads([])).toThrow(/No positions configured/)
  })

  test("example config loads but its placeholders fail dispatch validation", () => {
    const example = loadConfig("config.example.json")

    expect(example.positions.length).toBeGreaterThan(0)
    expect(example.positions[0].discord.threadId).toBe("REPLACE_WITH_THREAD_ID")
    expect(() => validatePositionThreads(example.positions)).toThrow(/replace placeholder/i)
  })
})
