export function normalizeJobTitle(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bback\s*end\b/g, "backend")
    .replace(/\bfront\s*end\b/g, "frontend")
    .replace(/\bfull\s*stack\b/g, "fullstack")
    .replace(/\bdevelopers?\b/g, "engineer")
    .replace(/\bprogrammers?\b/g, "engineer")
    .replace(/\bsdet\b/g, "qa engineer")
    .replace(/\bquality assurance\b/g, "qa")
    .replace(/\bmachine learning\b/g, "ml")
    .trim()
}

const DEFAULT_NEGATIVE_ROLES = [
  "ui/ux",
  "ux designer",
  "ui designer",
  "graphic designer",
  "product designer",
  "product manager",
  "project manager",
  "scrum master",
  "product owner",
  "it helpdesk",
  "helpdesk",
  "desktop support",
  "technical support",
  "customer support",
  "customer service",
  "sales",
  "marketing",
  "account executive",
  "recruiter",
  "talent acquisition",
  "finance",
  "accounting",
  "administrative",
  "legal",
  "human resources",
  "civil engineer",
  "mechanical engineer",
  "electrical engineer",
  "chemical engineer",
  "structural engineer",
  "industrial engineer",
  "sales engineer",
  "presales engineer",
  "field engineer",
  "maintenance engineer"
]


export function isJobTitleRelevant(title: string, allowedPositions: string[]): boolean {
  if (!title || allowedPositions.length === 0) return false

  const normTitle = normalizeJobTitle(title)

  // 1. Check for negative role signals unless user specifically asked for them
  for (const neg of DEFAULT_NEGATIVE_ROLES) {
    if (normTitle.includes(neg)) {
      const explicitlyRequested = allowedPositions.some((p) =>
        normalizeJobTitle(p).includes(neg)
      )
      if (!explicitlyRequested) {
        return false
      }
    }
  }

  // 2. Match against configured target positions
  for (const pos of allowedPositions) {
    const normTarget = normalizeJobTitle(pos)

    // Direct substring match
    if (normTitle.includes(normTarget)) {
      return true
    }

    // Token match: all non-trivial words in the target must exist in title
    const targetWords = normTarget.split(/\s+/).filter((w) => w.length > 1)
    const titleWords = normTitle.replace(/[^\w\s]/g, " ").split(/\s+/)

    const allWordsPresent = targetWords.every(
      (w) => titleWords.includes(w) || normTitle.includes(w)
    )
    if (allWordsPresent) {
      return true
    }
  }

  return false
}

export function verifyJobContent(
  job: { title: string; descriptionSnippet?: string },
  allowedPositions: string[]
): { pass: boolean; reason?: string } {
  if (!isJobTitleRelevant(job.title, allowedPositions)) {
    return { pass: false, reason: `Title "${job.title}" does not match target positions` }
  }

  if (job.descriptionSnippet) {
    const s = job.descriptionSnippet.toLowerCase()
    const snippetNegativeSignals = [
      "civil construction",
      "hvac system",
      "heavy machinery",
      "telemarketing",
      "cold calling"
    ]
    for (const sig of snippetNegativeSignals) {
      if (s.includes(sig)) {
        return { pass: false, reason: `Snippet contains non-software signal: "${sig}"` }
      }
    }
  }

  return { pass: true }
}
