import { describe, expect, test } from "bun:test"
import type { PortalScraper } from "../../src/core/types"
import { getScrapers } from "../../src/portals"

describe("portal scrapers integration", () => {
  test("getScrapers returns all 8 portals with name and callable search", () => {
    const scrapers = getScrapers()
    const expectedPortals: Array<keyof typeof scrapers> = [
      "jobstreet",
      "linkedin",
      "kalibrr",
      "glints",
      "dealls",
      "techinasia",
      "indeed",
      "glassdoor"
    ]
    expect(Object.keys(scrapers).sort()).toEqual(expectedPortals.slice().sort())

    for (const portalName of expectedPortals) {
      const scraper: PortalScraper = scrapers[portalName]
      expect(scraper).toBeDefined()
      expect(scraper.name).toBe(portalName)
      expect(typeof scraper.search).toBe("function")
    }
  })
})
