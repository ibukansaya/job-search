import type { Job, NormalizedWorkType, PortalScraper, WorkType } from "../core/types"

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export class LinkedinScraper implements PortalScraper {
  name = "linkedin" as const

  async search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    const url = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search")
    url.searchParams.set("keywords", query)
    url.searchParams.set("location", workType === "remote_worldwide" ? "Worldwide" : "Indonesia")

    if (workType === "remote_id" || workType === "remote_worldwide") {
      url.searchParams.set("f_WT", "2")
    } else if (workType === "hybrid") {
      url.searchParams.set("f_WT", "3")
    } else if (workType === "onsite") {
      url.searchParams.set("f_WT", "1")
    }

    const ageSeconds = Math.max(86400, maxAgeDays * 86400)
    url.searchParams.set("f_TPR", `r${ageSeconds}`)

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      })

      if (!res.ok) {
        console.error(`[linkedin] HTTP ${res.status}: ${res.statusText}`)
        return []
      }

      const html = await res.text()
      const cardRegex = /<li[\s\S]*?<\/li>/gi
      const cards = html.match(cardRegex) || []

      const jobs: Job[] = []
      const normWorkType: NormalizedWorkType =
        workType === "remote_id" || workType === "remote_worldwide"
          ? "Remote"
          : workType === "hybrid"
          ? "Hybrid"
          : "On-site"

      for (const card of cards) {
        const urnMatch = card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/)
        if (!urnMatch || !urnMatch[1]) continue
        const id = urnMatch[1]

        const titleMatch = card.match(/<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)
        const compMatch = card.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/i)
        const locMatch = card.match(/<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
        const dateMatch = card.match(/<time[^>]*datetime="([^"]+)"/i)
        const salaryMatch = card.match(/<span[^>]*class="[^"]*job-search-card__salary-info[^"]*"[^>]*>([\s\S]*?)<\/span>/i)

        const title = titleMatch ? stripHtml(titleMatch[1]) : ""
        if (!title) continue

        const company = compMatch ? stripHtml(compMatch[1]) : "Unknown Company"
        const location = locMatch ? stripHtml(locMatch[1]) : "Indonesia"
        const postedDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString().slice(0, 10)
        const salary = salaryMatch ? stripHtml(salaryMatch[1]) : undefined

        jobs.push({
          id,
          title,
          company,
          location,
          workType: normWorkType,
          salary,
          url: `https://www.linkedin.com/jobs/view/${id}`,
          postedDate,
          portal: this.name
        })
      }

      return jobs
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[linkedin] Request failed: ${msg}`)
      return []
    }
  }
}

if (import.meta.main) {
  const scraper = new LinkedinScraper()
  console.log("Searching LinkedIn for Software Engineer...")
  const jobs = await scraper.search("Software Engineer", "remote_id", 7)
  console.log(`Found ${jobs.length} jobs:`, JSON.stringify(jobs.slice(0, 2), null, 2))
}
