import type { Job, NormalizedWorkType, PortalName, PortalScraper, WorkType } from "../core/types"

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

interface DeallsItem {
  id?: string | number
  role?: string
  slug?: string
  publishedAt?: string
  workplaceType?: string
  salaryRange?: {
    start?: number | null
    end?: number | null
  }
  company?: {
    name?: string
    slug?: string
  }
  country?: {
    name?: string
  }
  city?: {
    name?: string
  }
  skills?: Array<{
    name?: string
  }>
}

interface DeallsResponse {
  data?: {
    docs?: DeallsItem[]
  }
}

export class DeallsScraper implements PortalScraper {
  name: PortalName = "dealls" as PortalName

  async search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    const url = new URL("https://api.sejutacita.id/v1/explore-job/job")
    url.searchParams.set("search", query)
    url.searchParams.set("limit", "50")
    url.searchParams.set("page", "1")
    url.searchParams.set("sortParam", "publishedAt")
    url.searchParams.set("sortBy", "desc")

    if (workType === "remote_id" || workType === "remote_worldwide") {
      url.searchParams.append("workplaceTypes[]", "remote")
    } else if (workType === "hybrid") {
      url.searchParams.append("workplaceTypes[]", "hybrid")
    } else if (workType === "onsite") {
      url.searchParams.append("workplaceTypes[]", "onSite")
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        }
      })

      if (!res.ok) {
        console.error(`[dealls] HTTP ${res.status}: ${res.statusText}`)
        return []
      }

      const json = (await res.json()) as DeallsResponse
      const items = json.data?.docs || []
      const now = Date.now()
      const maxAgeMs = maxAgeDays * 86400 * 1000
      const jobs: Job[] = []

      for (const item of items) {
        if (!item.id || !item.role) continue

        if (item.publishedAt) {
          const publishedTime = new Date(item.publishedAt).getTime()
          if (Number.isFinite(publishedTime) && now - publishedTime > maxAgeMs) {
            continue
          }
        }

        const normalizedWorkType: NormalizedWorkType =
          item.workplaceType === "remote" ? "Remote" : item.workplaceType === "hybrid" ? "Hybrid" : "On-site"

        const salary =
          item.salaryRange?.start && item.salaryRange?.end
            ? "IDR " + item.salaryRange.start.toLocaleString() + " - " + item.salaryRange.end.toLocaleString()
            : undefined

        const skillsSnippet = item.skills?.map((s) => s.name).filter(Boolean).join(", ")

        jobs.push({
          id: String(item.id),
          title: item.role.trim(),
          company: item.company?.name?.trim() || "Unknown Company",
          location: [item.city?.name, item.country?.name || "Indonesia"].filter(Boolean).join(", "),
          workType: normalizedWorkType,
          salary,
          url: `https://dealls.com/loker/${item.slug}~${item.company?.slug || "company"}`,
          postedDate: item.publishedAt || new Date().toISOString(),
          portal: this.name,
          descriptionSnippet: skillsSnippet || undefined
        })
      }

      return jobs
    } catch (err: unknown) {
      console.error("[dealls] fetch error:", err instanceof Error ? err.message : String(err))
      return []
    }
  }
}

if (import.meta.main) {
  const scraper = new DeallsScraper()
  console.log("Searching dealls for 'engineer'...")
  const jobs = await scraper.search("engineer", "remote_id", 30)
  console.log(`Found ${jobs.length} jobs:`)
  console.log(JSON.stringify(jobs.slice(0, 3), null, 2))
}
