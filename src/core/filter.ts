import type { PositionConfig } from "./types"

/**
 * Generic text normalization only. Role vocabulary (synonyms, seniority, etc.)
 * belongs to the configured positions/aliases, never to this module.
 */
export function normalizeJobTitle(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

interface PositionMatch {
  position: PositionConfig
  index: number
  /** Distinct words in the best matching target (name or alias). */
  specificity: number
}

function normalizeTargets(position: PositionConfig): string[] {
  return [position.name, ...(position.aliases ?? [])].map(normalizeJobTitle)
}

function titleMatchesTarget(normTitle: string, normTarget: string): boolean {
  if (!normTarget) {
    return false
  }

  // Direct substring match
  if (normTitle.includes(normTarget)) {
    return true
  }

  const targetWords = normTarget.split(/\s+/).filter((w) => w.length > 1)
  const titleWords = normTitle.replace(/[^\w\s]/g, " ").split(/\s+/)

  // Spelling-agnostic match for multi-word targets: "front end developer" covers "frontend developer".
  if (
    targetWords.length > 1 &&
    normTitle.replace(/\s+/g, "").includes(normTarget.replace(/\s+/g, ""))
  ) {
    return true
  }

  // Token match: all non-trivial words in the target must exist in title
  return targetWords.every((w) => titleWords.includes(w) || normTitle.includes(w))
}

function isExcluded(
  text: string | undefined,
  positions: PositionConfig[],
  excludeKeywords: string[]
): boolean {
  if (!text || excludeKeywords.length === 0) {
    return false
  }
  const normText = normalizeJobTitle(text)
  const targets = positions.flatMap(normalizeTargets)

  return excludeKeywords.some((keyword) => {
    const normKeyword = normalizeJobTitle(keyword)
    if (!normKeyword || !normText.includes(normKeyword)) {
      return false
    }
    // A keyword explicitly present in a configured position/alias is requested, not noise.
    return !targets.some((target) => target.includes(normKeyword))
  })
}

function collectMatches(title: string, positions: PositionConfig[]): PositionMatch[] {
  if (!title || positions.length === 0) {
    return []
  }

  const normTitle = normalizeJobTitle(title)
  const matches: PositionMatch[] = []

  positions.forEach((position, index) => {
    const matchedTargets = normalizeTargets(position).filter((target) =>
      titleMatchesTarget(normTitle, target)
    )
    if (matchedTargets.length === 0) {
      return
    }
    const specificity = Math.max(
      ...matchedTargets.map(
        (target) => new Set(target.split(/\s+/).filter((w) => w.length > 1)).size
      )
    )
    matches.push({ position, index, specificity })
  })

  return matches
}

export function isJobTitleRelevant(
  title: string,
  positions: PositionConfig[],
  excludeKeywords: string[] = []
): boolean {
  if (isExcluded(title, positions, excludeKeywords)) {
    return false
  }
  return collectMatches(title, positions).length > 0
}

export function findBestMatchingPosition(
  title: string,
  positions: PositionConfig[],
  excludeKeywords: string[] = []
): PositionConfig | undefined {
  if (isExcluded(title, positions, excludeKeywords)) {
    return undefined
  }

  const matches = collectMatches(title, positions)
  if (matches.length === 0) {
    return undefined
  }

  // Explicit priority wins, then the most specific target, then config order.
  matches.sort(
    (a, b) =>
      (a.position.priority ?? 0) - (b.position.priority ?? 0) ||
      b.specificity - a.specificity ||
      a.index - b.index
  )

  return matches[0].position
}

export function verifyJobContent(
  job: { title: string; descriptionSnippet?: string },
  positions: PositionConfig[],
  excludeKeywords: string[] = []
): { pass: boolean; reason?: string } {
  if (!isJobTitleRelevant(job.title, positions, excludeKeywords)) {
    return { pass: false, reason: `Title "${job.title}" does not match target positions` }
  }

  if (isExcluded(job.descriptionSnippet, positions, excludeKeywords)) {
    return { pass: false, reason: "Snippet contains excluded keyword from config" }
  }

  return { pass: true }
}
