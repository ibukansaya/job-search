import { createHash } from "node:crypto"

export function cleanCompany(raw: string): string {
  let s = (raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, " ")
    .trim()

  // Remove Indonesian & international corporate legal entity prefixes
  s = s.replace(/^(pt\b\.?|cv\b\.?|ud\b\.?|perum\b\.?|yayasan\b\.?)\s+/g, "")

  // Remove common corporate suffixes
  s = s.replace(
    /\s+(tbk\b\.?|inc\b\.?|llc\b\.?|ltd\b\.?|corp\b\.?|corporation\b|group\b\.?|holdings?\b|technologies|solutions)$/g,
    ""
  )
  s = s.replace(/\s+(pte\.?\s*ltd\.?)$/g, "")

  // Remove common tech web domain extensions in company names
  s = s.replace(/\.(com|co\.id|id|io|ai|net|org)\b/g, "")

  return s.trim()
}

export function cleanTitle(raw: string): string {
  let s = (raw || "").toLowerCase().normalize("NFKD")

  // Remove bracketed work arrangement tags e.g. [Remote], (Hybrid), (WFO), (WFH), (Urgent)
  s = s.replace(/\[\s*(remote|hybrid|onsite|wfh|wfo|urgent|urgently needed|all genders?)\s*\]/gi, "")
  s = s.replace(/\(\s*(remote|hybrid|onsite|wfh|wfo|urgent|urgently needed|all genders?)\s*\)/gi, "")

  // Remove trailing work arrangement modifiers e.g. "- Remote", "/ Hybrid"
  s = s.replace(/\s*[-/|]\s*(remote|hybrid|onsite|wfh|wfo)\s*$/gi, "")

  return s.trim()
}

function slugify(input: string, maxLen: number): { slug: string; truncated: boolean } {
  const normalized = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-")

  if (normalized.length <= maxLen) {
    return { slug: normalized, truncated: false }
  }

  const truncatedSlug = normalized.slice(0, maxLen).replace(/-+$/, "")
  return { slug: truncatedSlug, truncated: true }
}

export function makeKey(company: string, title: string): string {
  const cleanedComp = cleanCompany(company || "unknown")
  const cleanedTitl = cleanTitle(title || "untitled")

  const comp = slugify(cleanedComp || "unknown", 40)
  const titl = slugify(cleanedTitl || "untitled", 60)

  const compSlug = comp.slug || "unknown"
  const titlSlug = titl.slug || "untitled"

  if (comp.truncated || titl.truncated || compSlug === "unknown" || titlSlug === "untitled") {
    const raw = `${(company || "").trim().toLowerCase()}::${(title || "").trim().toLowerCase()}`
    const hash = createHash("sha1").update(raw).digest("hex").slice(0, 8)
    return `${compSlug}_${titlSlug}_${hash}`
  }

  return `${compSlug}_${titlSlug}`
}
