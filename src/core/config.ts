import { existsSync, readFileSync } from "node:fs"
import type { Config } from "./types"

export const DEFAULT_CONFIG: Config = {
  positions: ["Software Engineer", "Frontend Developer", "Backend Developer", "Fullstack Developer"],
  workTypes: ["remote_id", "remote_worldwide", "hybrid", "onsite"],
  portals: {
    jobstreet: true,
    linkedin: true,
    glints: true,
    kalibrr: true,
    dealls: true,
    techinasia: true,
    indeed: true,
    glassdoor: true
  },
  maxAgeDays: 3,
  rateLimitDelayMs: 800
}

export function loadConfig(configPath = "config.json"): Config {
  let targetPath = configPath
  if (!existsSync(targetPath)) {
    if (configPath === "config.json" && existsSync("config.example.json")) {
      targetPath = "config.example.json"
    } else {
      return DEFAULT_CONFIG
    }
  }
  try {
    const raw = readFileSync(targetPath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<Config>
    return {
      positions: Array.isArray(parsed.positions) && parsed.positions.length > 0 ? parsed.positions : DEFAULT_CONFIG.positions,
      workTypes: Array.isArray(parsed.workTypes) && parsed.workTypes.length > 0 ? parsed.workTypes : DEFAULT_CONFIG.workTypes,
      portals: {
        ...DEFAULT_CONFIG.portals,
        ...(parsed.portals || {})
      },
      maxAgeDays: typeof parsed.maxAgeDays === "number" ? parsed.maxAgeDays : DEFAULT_CONFIG.maxAgeDays,
      rateLimitDelayMs: typeof parsed.rateLimitDelayMs === "number" ? parsed.rateLimitDelayMs : DEFAULT_CONFIG.rateLimitDelayMs
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[config] Failed to parse ${configPath}: ${msg}. Using defaults.`)
    return DEFAULT_CONFIG
  }
}
