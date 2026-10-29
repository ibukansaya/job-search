import type { Job, NormalizedWorkType, PortalScraper, WorkType } from "../core/types"

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function normalizeWorkType(arrangements?: Array<{ label?: { text?: string } }>, title?: string): NormalizedWorkType {
  const texts = (arrangements || []).map((a) => a.label?.text?.toLowerCase() || "").join(" ")
  const lowerTitle = (title || "").toLowerCase()
  if (texts.includes("remote") || lowerTitle.includes("remote") || lowerTitle.includes("wfh")) return "Remote"
  if (texts.includes("hybrid") || lowerTitle.includes("hybrid")) return "Hybrid"
  if (texts.includes("on-site") || texts.includes("onsite")) return "On-site"
  return "Unknown"
}

function matchesRequestedWorkType(actual: NormalizedWorkType, requested: WorkType): boolean {
  if (requested === "remote_id" || requested === "remote_worldwide") return actual === "Remote"
  if (requested === "hybrid") return actual === "Hybrid"
  if (requested === "onsite") return actual === "On-site"
  return true
}

export class JobstreetScraper implements PortalScraper {
  name = "jobstreet" as const

  async search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    const url = new URL("https://id.jobstreet.com/api/jobsearch/v5/search")
    url.searchParams.set("siteKey", "ID-Main")
    url.searchParams.set("keywords", query)
    url.searchParams.set("pageSize", "30")
    url.searchParams.set("sortMode", "ListedDate")

    // ponytail: jobstreet works nationwide with where=Indonesia; city-specific drilling can be added when requested.
    url.searchParams.set("where", "Indonesia")

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        }
      })

      if (!res.ok) {
        console.error(`[jobstreet] HTTP ${res.status}: ${res.statusText}`)
        return []
      }

      const json = (await res.json()) as {
        data?: Array<{
          id: string | number
          title?: string
          companyName?: string
          advertiser?: { description?: string }
          employer?: { name?: string }
          locations?: Array<{ label?: string }>
          salaryLabel?: string
          listingDate?: string
          teaser?: string
          workArrangements?: {
            data?: Array<{ label?: { text?: string } }>
          }
        }>
      }

      const items = json.data || []
      const now = Date.now()
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000

      const jobs: Job[] = []

      for (const item of items) {
        if (!item.id || !item.title) continue

        const postedDate = item.listingDate || new Date().toISOString()
        const postTime = new Date(postedDate).getTime()
        if (Number.isFinite(postTime) && now - postTime > maxAgeMs) {
          continue
        }

        const normWorkType = normalizeWorkType(item.workArrangements?.data, item.title)
        if (!matchesRequestedWorkType(normWorkType, workType)) {
          continue
        }

        const company =
          item.companyName || item.advertiser?.description || item.employer?.name || "Unknown Company"
        const location = item.locations?.[0]?.label || "Indonesia"
        const id = String(item.id)

        jobs.push({
          id,
          title: item.title.trim(),
          company: company.trim(),
          location: location.trim(),
          workType: normWorkType,
          salary: item.salaryLabel?.trim() || undefined,
          url: `https://id.jobstreet.com/id/job/${id}`,
          postedDate,
          portal: this.name,
          descriptionSnippet: item.teaser?.trim() || undefined
        })
      }

      return jobs
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[jobstreet] Request failed: ${msg}`)
      return []
    }
  }
}

if (import.meta.main) {
  const scraper = new JobstreetScraper()
  console.log("Searching Jobstreet for Software Engineer...")
  const jobs = await scraper.search("Software Engineer", "remote_id", 30)
  console.log(`Found ${jobs.length} jobs:`, JSON.stringify(jobs.slice(0, 2), null, 2))
}
