import { existsSync, readFileSync } from "node:fs"
import type { Config, PositionConfig } from "./types"

export const DEFAULT_CONFIG: Config = {
  positions: [
    // Broad fallback roles carry a higher priority number so specific roles win ties.
    { name: "Software Engineer", priority: 10, discord: { threadId: "" } },
    { name: "Frontend Developer", discord: { threadId: "" } },
    { name: "Backend Developer", discord: { threadId: "" } },
    { name: "Fullstack Developer", discord: { threadId: "" } }
  ],
  excludeKeywords: [],
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

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
}

export function validatePositionThreads(positions: PositionConfig[]): void {
  if (!positions || positions.length === 0) {
    throw new Error("No positions configured.")
  }
  for (const pos of positions) {
    const threadId = pos.discord?.threadId?.trim()
    if (!threadId || !/^\d+$/.test(threadId)) {
      throw new Error(
        `Invalid thread ID "${pos.discord?.threadId ?? ""}" for position "${pos.name}". Thread ID must be a numeric Discord ID. Please replace placeholder in configuration.`
      )
    }
  }
}

function parsePositions(value: unknown, targetPath: string): PositionConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `[config] "positions" in ${targetPath} must be a non-empty array of objects: { name: string, discord: { threadId: string } }. See config.example.json.`
    )
  }

  const positions: PositionConfig[] = []
  for (const item of value) {
    if (typeof item === "string") {
      throw new Error(
        `[config] Legacy positions format detected in ${targetPath}. "positions" must be an array of objects like { "name": "Software Engineer", "discord": { "threadId": "1234567890" } }. See config.example.json.`
      )
    }
    if (!item || typeof item !== "object") {
      throw new Error(
        `[config] Invalid position item in ${targetPath}. Each position must be an object: { name: string, discord: { threadId: string } }. See config.example.json.`
      )
    }

    const record = item as Record<string, unknown>
    const discord = record.discord as Record<string, unknown> | undefined
    if (!isNonBlankString(record.name) || !discord || typeof discord.threadId !== "string") {
      throw new Error(
        `[config] Invalid position item in ${targetPath}. Each position requires a non-empty "name" and "discord": { "threadId": string }. See config.example.json.`
      )
    }
    if (
      record.aliases !== undefined &&
      (!Array.isArray(record.aliases) || !record.aliases.every(isNonBlankString))
    ) {
      throw new Error(
        `[config] Position "${record.name}" in ${targetPath} has invalid "aliases". Use an array of non-empty title strings.`
      )
    }
    if (
      record.priority !== undefined &&
      (typeof record.priority !== "number" || !Number.isFinite(record.priority))
    ) {
      throw new Error(
        `[config] Position "${record.name}" in ${targetPath} has invalid "priority". Use a finite number; lower values win when several positions match.`
      )
    }

    const position: PositionConfig = {
      name: record.name.trim(),
      discord: { threadId: discord.threadId.trim() }
    }
    if (Array.isArray(record.aliases)) {
      position.aliases = (record.aliases as string[]).map((alias) => alias.trim())
    }
    if (typeof record.priority === "number") {
      position.priority = record.priority
    }
    positions.push(position)
  }
  return positions
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

  let parsed: Record<string, unknown>
  try {
    const raw = readFileSync(targetPath, "utf-8")
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[config] Failed to parse ${configPath}: ${msg}. Using defaults.`)
    return DEFAULT_CONFIG
  }

  const positions = parsed.positions === undefined ? DEFAULT_CONFIG.positions : parsePositions(parsed.positions, targetPath)

  let excludeKeywords = DEFAULT_CONFIG.excludeKeywords
  if (parsed.excludeKeywords !== undefined) {
    if (
      !Array.isArray(parsed.excludeKeywords) ||
      !parsed.excludeKeywords.every(isNonBlankString)
    ) {
      throw new Error(
        `[config] "excludeKeywords" in ${targetPath} must be an array of non-empty strings (use [] to disable keyword exclusion).`
      )
    }
    excludeKeywords = parsed.excludeKeywords as string[]
  }

  return {
    positions,
    excludeKeywords,
    workTypes:
      Array.isArray(parsed.workTypes) && parsed.workTypes.length > 0
        ? (parsed.workTypes as Config["workTypes"])
        : DEFAULT_CONFIG.workTypes,
    portals: {
      ...DEFAULT_CONFIG.portals,
      ...((parsed.portals as Partial<Config["portals"]>) || {})
    },
    maxAgeDays: typeof parsed.maxAgeDays === "number" ? parsed.maxAgeDays : DEFAULT_CONFIG.maxAgeDays,
    rateLimitDelayMs:
      typeof parsed.rateLimitDelayMs === "number" ? parsed.rateLimitDelayMs : DEFAULT_CONFIG.rateLimitDelayMs
  }
}
