export type WorkType = "onsite" | "hybrid" | "remote_id" | "remote_worldwide"

export type NormalizedWorkType = "On-site" | "Hybrid" | "Remote" | "Unknown"

export type PortalName = "jobstreet" | "linkedin" | "glints" | "kalibrr" | "dealls" | "techinasia" | "indeed" | "glassdoor"

export interface Job {
  id: string
  title: string
  company: string
  location: string
  workType: NormalizedWorkType
  salary?: string
  url: string
  postedDate: string
  portal: PortalName
  descriptionSnippet?: string
  aiAnalysis?: {
    techStack: string[]
    summary: string
    matchesTargetRole?: boolean
    rejectionReason?: string
  }
}

export interface PortalScraper {
  name: PortalName
  search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]>
}

export interface Config {
  positions: string[]
  workTypes: WorkType[]
  portals: Record<PortalName, boolean>
  maxAgeDays: number
  rateLimitDelayMs: number
}
