import type { Job, NormalizedWorkType, PortalName, PortalScraper, WorkType } from "../core/types"
import { closeBrowser, getBrowserContext } from "../services/browser"

function matchesRequestedWorkType(actual: NormalizedWorkType, requested: WorkType): boolean {
  if (requested === "remote_id" || requested === "remote_worldwide") return actual === "Remote"
  if (requested === "hybrid") return actual === "Hybrid"
  if (requested === "onsite") return actual === "On-site"
  return true
}

function resolveWorkType(
  title: string,
  location: string,
  snippet: string,
  requested: WorkType
): NormalizedWorkType {
  const combined = `${title} ${location} ${snippet}`.toLowerCase()
  if (combined.includes("remote") || combined.includes("wfh") || combined.includes("work from home")) {
    return "Remote"
  }
  if (combined.includes("hybrid")) {
    return "Hybrid"
  }
  if (requested === "remote_id" || requested === "remote_worldwide") {
    return "Remote"
  }
  if (combined.includes("on-site") || combined.includes("onsite")) {
    return "On-site"
  }
  if (requested === "onsite") {
    return "On-site"
  }
  return "Unknown"
}

export class IndeedScraper implements PortalScraper {
  name: PortalName = "indeed" as PortalName

  async search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    const q = workType === "remote_id" || workType === "remote_worldwide" ? `${query} remote` : query
    const validFromage = maxAgeDays <= 1 ? "1" : maxAgeDays <= 3 ? "3" : maxAgeDays <= 7 ? "7" : maxAgeDays <= 14 ? "14" : ""
    const fromageParam = validFromage ? `&fromage=${validFromage}` : ""
    const url = `https://id.indeed.com/jobs?q=${encodeURIComponent(q)}&l=Indonesia${fromageParam}`
    const context = await getBrowserContext()
    if (!context) {
      console.warn("[indeed] Browser context unavailable")
      return []
    }

    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 })
      await page.waitForTimeout(3000)

      // ponytail: single page extraction without pagination; add pagination loop when result count exceeds single page.
      const rawCards = await page.$$eval(".cardOutline, [data-jk]", (elements) => {
        const items: Array<{
          jk: string
          title: string
          company: string
          location: string
          salary?: string
          snippet?: string
        }> = []
        const seen = new Set<string>()

        for (const card of elements) {
          const jk =
            card.getAttribute("data-jk") ||
            card.querySelector("a[data-jk]")?.getAttribute("data-jk") ||
            ""
          if (!jk || seen.has(jk)) continue

          const title =
            card.querySelector("h2.jobTitle, .jobTitle, a[data-jk] span")?.textContent?.trim() || ""
          if (!title) continue

          seen.add(jk)
          const company =
            card.querySelector("[data-testid=\"company-name\"], .companyName")?.textContent?.trim() || ""
          const location =
            card.querySelector("[data-testid=\"text-location\"], .companyLocation")?.textContent?.trim() || ""
          const salary =
            card.querySelector("[data-testid=\"attribute_snippet_testid\"], .salary-snippet-container")?.textContent?.trim() || undefined
          const snippet =
            card.querySelector(".job-snippet, [data-testid=\"job-snippet\"]")?.textContent?.trim() || undefined

          items.push({ jk, title, company, location, salary, snippet })
        }
        return items
      })

      const today = new Date().toISOString()
      const jobs: Job[] = []

      for (const item of rawCards) {
        const normWorkType = resolveWorkType(
          item.title,
          item.location,
          item.snippet || "",
          workType
        )

        if (!matchesRequestedWorkType(normWorkType, workType)) {
          continue
        }

        jobs.push({
          id: item.jk,
          title: item.title,
          company: item.company || "Unknown Company",
          location: item.location || "Indonesia",
          workType: normWorkType,
          salary: item.salary,
          url: `https://id.indeed.com/viewjob?jk=${item.jk}`,
          postedDate: today,
          portal: this.name,
          descriptionSnippet: item.snippet
        })
      }

      return jobs
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[indeed] Search failed: ${msg}`)
      return []
    } finally {
      await page.close().catch(() => {})
    }
  }
}

if (import.meta.main) {
  const scraper = new IndeedScraper()
  console.log("Testing IndeedScraper...")
  const jobs = await scraper.search("Software Engineer", "remote_id", 3)
  console.log(`Found ${jobs.length} jobs:`, JSON.stringify(jobs.slice(0, 3), null, 2))
  await closeBrowser()
}
