import type { Job, NormalizedWorkType, PortalName, PortalScraper, WorkType } from "../core/types"

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

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

interface TechInAsiaItem {
  id?: string | number
  status?: string
  title?: string
  is_remote?: boolean
  work_arrangement?: string
  salary_min?: number | null
  salary_max?: number | null
  description?: string
  published_at?: string
  city?: {
    name?: string | null
    country?: {
      alpha2?: string | null
      name?: string | null
      currency?: {
        currency_code?: string | null
      } | null
    } | null
  } | null
  company?: {
    name?: string | null
  } | null
  position?: {
    name?: string | null
  } | null
}

interface TechInAsiaResponse {
  data?: TechInAsiaItem[]
}

export class TechInAsiaScraper implements PortalScraper {
  name: PortalName = "techinasia" as PortalName

  async search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    const url = new URL("https://www.techinasia.com/api/2.0/job-postings")
    url.searchParams.set("per_page", "100")
    url.searchParams.set("page", "1")

    if (workType === "remote_id" || workType === "remote_worldwide") {
      url.searchParams.set("is_remote", "1")
    } else if (workType === "hybrid") {
      url.searchParams.append("work_arrangement[]", "hybrid")
    } else if (workType === "onsite") {
      url.searchParams.append("work_arrangement[]", "on-site")
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        }
      })

      if (!res.ok) {
        console.error(`[techinasia] HTTP ${res.status}: ${res.statusText}`)
        return []
      }

      const json = (await res.json()) as TechInAsiaResponse
      const items = json.data || []
      const now = Date.now()
      const maxAgeMs = maxAgeDays * 86400 * 1000
      const q = query.toLowerCase()

      const jobs: Job[] = []

      for (const item of items) {
        if (!item.id || !item.title) continue

        const titleMatch = item.title.toLowerCase().includes(q)
        const positionMatch = item.position?.name ? item.position.name.toLowerCase().includes(q) : false
        if (!titleMatch && !positionMatch) {
          continue
        }

        if (workType !== "remote_worldwide") {
          const alpha2 = item.city?.country?.alpha2
          if (alpha2 && alpha2 !== "ID") {
            continue
          }
        }

        const publishedTime = item.published_at ? new Date(item.published_at).getTime() : NaN
        if (Number.isFinite(publishedTime) && now - publishedTime > maxAgeMs) {
          continue
        }

        const normWorkType: NormalizedWorkType = item.is_remote
          ? "Remote"
          : item.work_arrangement === "hybrid"
          ? "Hybrid"
          : "On-site"

        let salary: string | undefined
        if (item.salary_min && item.salary_max) {
          const currency = item.city?.country?.currency?.currency_code || "IDR"
          salary = `${currency} ${item.salary_min.toLocaleString()} - ${item.salary_max.toLocaleString()}`
        }

        const location = [item.city?.name, item.city?.country?.name || "Indonesia"]
          .filter(Boolean)
          .join(", ")

        jobs.push({
          id: String(item.id),
          title: item.title.trim(),
          company: item.company?.name?.trim() || "Unknown Company",
          location,
          workType: normWorkType,
          salary,
          url: `https://www.techinasia.com/jobs/${item.id}`,
          postedDate: item.published_at || new Date().toISOString(),
          portal: this.name,
          descriptionSnippet: item.description ? stripHtml(item.description.slice(0, 200)) : undefined
        })
      }

      return jobs
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[techinasia] Request failed: ${msg}`)
      return []
    }
  }
}

if (import.meta.main) {
  const scraper = new TechInAsiaScraper()
  console.log("Searching Tech In Asia for 'Engineer'...")
  const jobs = await scraper.search("Engineer", "remote_worldwide", 60)
  console.log(`Found ${jobs.length} jobs:`)
  console.log(JSON.stringify(jobs.slice(0, 2), null, 2))
}
