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

export interface PositionConfig {
  name: string
  /** Extra job titles routed to this position/thread. */
  aliases?: string[]
  /** Lower values win when several positions match the same title (default 0). */
  priority?: number
  discord: {
    threadId: string
  }
}

export interface PortalScraper {
  name: PortalName
  search(query: string, workType: WorkType, maxAgeDays: number): Promise<Job[]>
}

export interface Config {
  positions: PositionConfig[]
  /** Title keywords that disqualify a job unless a configured position/alias asks for them. */
  excludeKeywords: string[]
  workTypes: WorkType[]
  portals: Record<PortalName, boolean>
  maxAgeDays: number
  rateLimitDelayMs: number
}
