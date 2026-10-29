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

function matchesRequestedWorkType(actual: NormalizedWorkType, requested: WorkType): boolean {
  if (requested === "remote_id" || requested === "remote_worldwide") return actual === "Remote"
  if (requested === "hybrid") return actual === "Hybrid"
  if (requested === "onsite") return actual === "On-site"
  return true
}

interface KalibrrItem {
  id: number | string
  name?: string
  company_name?: string
  company?: { name?: string; code?: string }
  company_info?: { code?: string; name?: string }
  slug?: string
  is_work_from_home?: boolean
  is_hybrid?: boolean
  activation_date?: string
  created_at?: string
  base_salary?: number | null
  maximum_salary?: number | null
  salary_currency?: string | null
  description?: string
  google_location?: {
    address_components?: {
      city?: string
      region?: string
      country?: string
    }
  }
}

export class KalibrrScraper implements PortalScraper {
  name = "kalibrr" as const

  async search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]> {
    const url = new URL("https://www.kalibrr.com/api/job_board/search")
    url.searchParams.set("k", query)
    url.searchParams.set("limit", "30")

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        }
      })

      if (!res.ok) {
        console.error(`[kalibrr] HTTP ${res.status}: ${res.statusText}`)
        return []
      }

      const json = (await res.json()) as { jobs?: KalibrrItem[] }
      const items = json.jobs || []
      const now = Date.now()
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000

      const jobs: Job[] = []

      for (const item of items) {
        if (!item.id || !item.name) continue

        const postedDate = item.activation_date || item.created_at || new Date().toISOString()
        const postTime = new Date(postedDate).getTime()
        if (Number.isFinite(postTime) && now - postTime > maxAgeMs) {
          continue
        }

        const normWorkType: NormalizedWorkType = item.is_work_from_home
          ? "Remote"
          : item.is_hybrid
          ? "Hybrid"
          : "On-site"

        if (!matchesRequestedWorkType(normWorkType, workType)) {
          continue
        }

        const company =
          item.company_name || item.company_info?.name || item.company?.name || "Unknown Company"

        const loc = item.google_location?.address_components
        const locationParts = [loc?.city, loc?.country || "Indonesia"].filter(Boolean)
        const location = locationParts.join(", ") || "Indonesia"

        const companyCode = item.company_info?.code || item.company?.code || "c"
        const slug = item.slug || String(item.id)
        const jobUrl = `https://www.kalibrr.com/c/${companyCode}/jobs/${item.id}/${slug}`

        let salary: string | undefined
        if (item.base_salary && item.maximum_salary) {
          salary = `${item.salary_currency || "IDR"} ${item.base_salary.toLocaleString()} - ${item.maximum_salary.toLocaleString()}`
        } else if (item.base_salary) {
          salary = `${item.salary_currency || "IDR"} ${item.base_salary.toLocaleString()}`
        }

        const snippet = item.description ? stripHtml(item.description).slice(0, 200) : undefined

        jobs.push({
          id: String(item.id),
          title: item.name.trim(),
          company: company.trim(),
          location: location.trim(),
          workType: normWorkType,
          salary,
          url: jobUrl,
          postedDate,
          portal: this.name,
          descriptionSnippet: snippet
        })
      }

      return jobs
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[kalibrr] Request failed: ${msg}`)
      return []
    }
  }
}

if (import.meta.main) {
  const scraper = new KalibrrScraper()
  console.log("Searching Kalibrr for Software Engineer...")
  const jobs = await scraper.search("Software Engineer", "onsite", 30)
  console.log(`Found ${jobs.length} jobs:`, JSON.stringify(jobs.slice(0, 2), null, 2))
}
