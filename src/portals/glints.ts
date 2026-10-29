import type { Job, NormalizedWorkType, PortalScraper, WorkType } from "../core/types"
import { getBrowserContext } from "../services/browser"

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

function matchesRequestedWorkType(actual: NormalizedWorkType, requested: WorkType): boolean {
  if (requested === "remote_id" || requested === "remote_worldwide") return actual === "Remote"
  if (requested === "hybrid") return actual === "Hybrid"
  if (requested === "onsite") return actual === "On-site"
  return true
}

interface GlintsSalary {
  minAmount?: number
  maxAmount?: number
  CurrencyCode?: string
}

interface GlintsItem {
  id: string
  title?: string
  company?: { name?: string }
  city?: { name?: string }
  country?: { name?: string }
  location?: { formattedName?: string; parents?: Array<{ formattedName?: string }> }
  workplaceType?: string
  workArrangementOption?: string
  minSalary?: number
  maxSalary?: number
  salariesCurrency?: string
  salaries?: GlintsSalary[] | null
  createdAt?: string
  updatedAt?: string
}

export class GlintsScraper implements PortalScraper {
  name = "glints" as const

  private parseItems(items: GlintsItem[], workType: WorkType, maxAgeDays: number): Job[] {
    const now = Date.now()
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
    const jobs: Job[] = []

    for (const item of items) {
      if (!item.id || !item.title) continue

      const postedDate = item.createdAt || item.updatedAt || new Date().toISOString()
      const postTime = new Date(postedDate).getTime()
      if (Number.isFinite(postTime) && now - postTime > maxAgeMs) {
        continue
      }

      const wp = (item.workArrangementOption || item.workplaceType || "").toUpperCase()
      const normWorkType: NormalizedWorkType =
        wp === "REMOTE" ? "Remote" : wp === "HYBRID" ? "Hybrid" : wp === "ONSITE" ? "On-site" : "Unknown"

      if (!matchesRequestedWorkType(normWorkType, workType)) {
        continue
      }

      const company = item.company?.name || "Unknown Company"

      let locStr = item.location?.formattedName || item.city?.name || ""
      if (item.location?.parents && item.location.parents.length > 0) {
        const parentNames = item.location.parents.map((p) => p.formattedName).filter(Boolean)
        if (parentNames.length > 0) {
          locStr = `${locStr ? locStr + ", " : ""}${parentNames.slice(0, 2).join(", ")}`
        }
      }
      if (!locStr) locStr = "Indonesia"

      let salary: string | undefined
      if (item.salaries && item.salaries.length > 0) {
        const s = item.salaries[0]
        if (s.minAmount && s.maxAmount) {
          salary = `${s.CurrencyCode || "IDR"} ${s.minAmount.toLocaleString()} - ${s.maxAmount.toLocaleString()}`
        } else if (s.minAmount) {
          salary = `${s.CurrencyCode || "IDR"} ${s.minAmount.toLocaleString()}`
        }
      } else if (item.minSalary && item.maxSalary) {
        salary = `${item.salariesCurrency || "IDR"} ${item.minSalary.toLocaleString()} - ${item.maxSalary.toLocaleString()}`
      }

      jobs.push({
        id: String(item.id),
        title: item.title.trim(),
        company: company.trim(),
        location: locStr.trim(),
        workType: normWorkType,
        salary,
        url: `https://glints.com/id/opportunities/jobs/${item.id}`,
        postedDate,
        portal: this.name
      })
    }

    return jobs
  }

  private async searchWithBrowser(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    const context = await getBrowserContext()
    if (!context) return []

    const page = await context.newPage()
    try {
      const url = new URL("https://glints.com/id/opportunities/jobs/explore")
      url.searchParams.set("keyword", query)
      url.searchParams.set("country", "ID")

      if (workType === "remote_id" || workType === "remote_worldwide") {
        url.searchParams.set("workArrangementOptions", "REMOTE")
      } else if (workType === "hybrid") {
        url.searchParams.set("workArrangementOptions", "HYBRID")
      } else if (workType === "onsite") {
        url.searchParams.set("workArrangementOptions", "ONSITE")
      }

      await page.goto(url.toString(), { waitUntil: "commit", timeout: 15000 })
      await page.waitForSelector("script#__NEXT_DATA__", { timeout: 15000 }).catch(() => {})
      const items = (await page.evaluate(() => {
        const script = document.getElementById("__NEXT_DATA__")
        if (!script) return []
        try {
          const parsed = JSON.parse(script.textContent || "{}")
          return parsed.props?.pageProps?.initialJobs?.jobsInPage || []
        } catch {
          return []
        }
      })) as GlintsItem[]

      return this.parseItems(items, workType, maxAgeDays)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[glints-playwright] Scrape failed: ${msg}`)
      return []
    } finally {
      await page.close().catch(() => {})
    }
  }

  async search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    const url = new URL("https://glints.com/api/jobs")
    url.searchParams.set("keyword", query)
    url.searchParams.set("country", "ID")
    url.searchParams.set("pageSize", "30")

    if (workType === "remote_id" || workType === "remote_worldwide") {
      url.searchParams.set("workArrangementOptions", "REMOTE")
    } else if (workType === "hybrid") {
      url.searchParams.set("workArrangementOptions", "HYBRID")
    } else if (workType === "onsite") {
      url.searchParams.set("workArrangementOptions", "ONSITE")
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json",
          "Referer": "https://glints.com/id/opportunities/jobs/explore"
        }
      })

      if (res.status === 403) {
        return await this.searchWithBrowser(query, workType, maxAgeDays)
      }

      if (!res.ok) {
        console.warn(`[glints] HTTP ${res.status}: ${res.statusText}`)
        return []
      }

      const json = (await res.json()) as { data?: GlintsItem[]; jobs?: GlintsItem[] }
      const items = json.data || json.jobs || []
      return this.parseItems(items, workType, maxAgeDays)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[glints] Fetch failed: ${msg}. Attempting Playwright fallback...`)
      return await this.searchWithBrowser(query, workType, maxAgeDays)
    }
  }
}

if (import.meta.main) {
  const scraper = new GlintsScraper()
  console.log("Searching Glints for Software Engineer (onsite)...")
  const jobs = await scraper.search("Software Engineer", "onsite", 90)
  console.log(`Found ${jobs.length} jobs:`, JSON.stringify(jobs.slice(0, 2), null, 2))
  const { closeBrowser } = await import("../services/browser")
  await closeBrowser()
}
