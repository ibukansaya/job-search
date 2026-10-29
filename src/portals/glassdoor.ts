import type { Job, NormalizedWorkType, PortalName, PortalScraper, WorkType } from "../core/types"
import { closeBrowser, getBrowserContext } from "../services/browser"

function normalizeWorkType(workType: WorkType, location?: string, title?: string): NormalizedWorkType {
  const text = `${location || ""} ${title || ""}`.toLowerCase()
  if (text.includes("remote")) return "Remote"
  if (text.includes("hybrid")) return "Hybrid"
  if (workType === "remote_id" || workType === "remote_worldwide") return "Remote"
  if (workType === "hybrid") return "Hybrid"
  if (workType === "onsite") return "On-site"
  return "Unknown"
}

export class GlassdoorScraper implements PortalScraper {
  name: PortalName = "glassdoor" as PortalName

  async search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    let url = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(query)}&locT=C&locId=113`
    if (workType === "remote_id") {
      url += "&remoteWorkType=1"
    }

    const context = await getBrowserContext()
    if (!context) {
      console.warn("[glassdoor] Browser context unavailable")
      return []
    }

    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 })
      await page.waitForTimeout(3500)

      const rawJobs = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-test="jobListing"]'))
        return cards.map((card) => {
          const id = card.getAttribute("data-jobid") || ""
          const title =
            card.querySelector('a[class*="JobCard_jobTitle"], [data-test="job-title"]')?.textContent?.trim() || ""
          const company =
            card
              .querySelector('span[class*="EmployerProfile_compactEmployerName"], [data-test="employer-name"]')
              ?.textContent?.trim() || ""
          const location =
            card.querySelector('div[class*="JobCard_location"], [data-test="emp-location"]')?.textContent?.trim() || ""
          const salary =
            card.querySelector('div[class*="JobCard_salaryEstimate"], [data-test="detailSalary"]')?.textContent?.trim() ||
            undefined
          const link =
            card
              .querySelector('a[class*="JobCard_jobTitle"], a[data-test="job-title"]')
              ?.getAttribute("href") || ""
          const fullUrl = link.startsWith("http") ? link : link ? `https://www.glassdoor.com${link}` : ""

          return {
            id,
            title,
            company,
            location,
            salary,
            url: fullUrl
          }
        })
      })

      const today = new Date().toISOString()
      const jobs: Job[] = []

      for (let i = 0; i < rawJobs.length; i++) {
        const item = rawJobs[i]
        if (!item.title) continue

        const jobId = item.id || `gd-${Date.now()}-${i}`
        const jobUrl = item.url || `https://www.glassdoor.com/job-listing?jl=${jobId}`

        jobs.push({
          id: jobId,
          title: item.title,
          company: item.company || "Unknown Company",
          location: item.location || "Indonesia",
          workType: normalizeWorkType(workType, item.location, item.title),
          salary: item.salary || undefined,
          url: jobUrl,
          postedDate: today,
          portal: this.name
        })
      }

      return jobs
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[glassdoor] Scrape failed: ${msg}`)
      return []
    } finally {
      await page.close().catch(() => {})
    }
  }
}

if (import.meta.main) {
  const scraper = new GlassdoorScraper()
  console.log("Searching Glassdoor for Frontend Developer...")
  const jobs = await scraper.search("Frontend Developer", "remote_id", 30)
  console.log(`Found ${jobs.length} jobs:`, JSON.stringify(jobs.slice(0, 2), null, 2))
  await closeBrowser()
}
