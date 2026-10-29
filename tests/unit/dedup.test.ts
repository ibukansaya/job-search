import { describe, expect, test } from "bun:test"
import { makeKey } from "../../src/core/dedup"

describe("dedup", () => {
  test("generates stable canonical key across casing and whitespace", () => {
    const k1 = makeKey("PT Bukalapak.com Tbk", "Senior Software Engineer - Backend")
    const k2 = makeKey("  pt bukalapak.com tbk  ", "  senior software engineer - backend  ")

    expect(k1).toBe("bukalapak_senior-software-engineer-backend")
    expect(k1).toBe(k2)
  })

  test("deduplicates across portals despite legal prefixes and arrangement tags", () => {
    const jobstreet = makeKey("PT Bukalapak.com Tbk", "Senior Software Engineer - Backend (Remote)")
    const linkedin = makeKey("Bukalapak", "Senior Software Engineer - Backend")
    const glints = makeKey("Bukalapak.com", "Senior Software Engineer - Backend - Remote")

    expect(jobstreet).toBe("bukalapak_senior-software-engineer-backend")
    expect(jobstreet).toBe(linkedin)
    expect(jobstreet).toBe(glints)
  })

  test("truncates long titles and appends SHA1 disambiguation hash", () => {
    const company = "Google"
    const longTitle = "A".repeat(100)
    const key = makeKey(company, longTitle)

    expect(key.startsWith("google_aaaa")).toBe(true)
    const parts = key.split("_")
    expect(parts.length).toBe(3)
    expect(parts[2].length).toBe(8)
  })

  test("truncates long company name and appends SHA1 hash", () => {
    const longCompany = "Enterprise Solution Provider Group Worldwide International"
    const title = "Software Engineer"
    const key = makeKey(longCompany, title)

    const parts = key.split("_")
    expect(parts.length).toBe(3)
    expect(parts[2].length).toBe(8)
  })

  test("handles special characters and non-latin input gracefully", () => {
    const keySymbols = makeKey("!@#$%", "^&*()")
    expect(keySymbols.startsWith("unknown_untitled_")).toBe(true)

    const keyEmpty = makeKey("", "")
    expect(keyEmpty.startsWith("unknown_untitled_")).toBe(true)
  })
})
