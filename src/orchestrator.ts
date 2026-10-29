import { makeKey } from "./core/dedup"
import { isJobTitleRelevant, verifyJobContent } from "./core/filter"
import type { Config, Job, PortalName } from "./core/types"
import { getScrapers } from "./portals"
import { enrichJobs } from "./services/ai"
import { sendDiscordJobs } from "./services/discord"
import type { JobDatabase } from "./storage/db"

export interface ScrapeResult {
  scanned: number
  newCount: number
  seenCount: number
  notifiedCount: number
}

export async function runScraper(config: Config, db: JobDatabase): Promise<ScrapeResult> {
  const scrapers = getScrapers()
  const activePortalNames = (Object.keys(scrapers) as PortalName[]).filter((p) => config.portals[p] !== false)

  console.log(
    `[Scraper] Starting scan matrix: ${config.positions.length} queries × ${config.workTypes.length} work types × ${activePortalNames.length} portals`
  )

  let scanned = 0
  let seenCount = 0
  const candidateJobs: Array<{ job: Job; key: string }> = []

  for (const portalName of activePortalNames) {
    const scraper = scrapers[portalName]

    for (const query of config.positions) {
      for (const workType of config.workTypes) {
        // Skip irrelevant portal combos (e.g. Jobstreet ID does not serve worldwide remote)
        if (workType === "remote_worldwide" && (portalName === "jobstreet" || portalName === "kalibrr")) {
          continue
        }

        console.log(`[${portalName}] Querying: "${query}" (${workType})`)
        const jobs = await scraper.search(query, workType, config.maxAgeDays)
        scanned += jobs.length

        for (const job of jobs) {
          // Layer 1: Deterministic title filter against configured target positions
          if (!isJobTitleRelevant(job.title, config.positions)) {
            continue
          }

          const key = makeKey(job.company, job.title)
          if (db.isSeen(key)) {
            seenCount++
          } else {
            const alreadyQueued = candidateJobs.some((c) => c.key === key)
            if (!alreadyQueued) {
              candidateJobs.push({ job, key })
            }
          }
        }
        if (config.rateLimitDelayMs > 0) {
          await Bun.sleep(config.rateLimitDelayMs)
        }
      }
    }
  }

  const newCount = candidateJobs.length
  console.log(`[Scraper] Scanned: ${scanned}, Found new candidates: ${newCount}, Already seen: ${seenCount}`)

  let notifiedCount = 0

  if (candidateJobs.length > 0) {
    console.log(`[Scraper] Enriching & verifying ${candidateJobs.length} new candidates...`)
    const rawJobs = candidateJobs.map((c) => c.job)
    const enriched = await enrichJobs(rawJobs, 3, config.positions)

    for (let i = 0; i < candidateJobs.length; i++) {
      const job = enriched[i] || candidateJobs[i].job

      // Layer 2: Semantic AI & content verification
      if (job.aiAnalysis?.matchesTargetRole === false) {
        console.log(
          `[Filter L2] Dropped non-matching role: "${job.title}" @ ${job.company} (${job.aiAnalysis.rejectionReason || "AI rejection"})`
        )
        continue
      }

      const contentCheck = verifyJobContent(job, config.positions)
      if (!contentCheck.pass) {
        console.log(
          `[Filter L2] Dropped non-matching content: "${job.title}" @ ${job.company} (${contentCheck.reason})`
        )
        continue
      }

      db.saveCandidate(job, candidateJobs[i].key)
    }
  }
  // Collect all unnotified jobs from database (new candidates + retries from previous runs)
  const pendingToNotify = db.getPendingJobs(50)

  if (pendingToNotify.length > 0) {
    console.log(`[Scraper] Dispatching ${pendingToNotify.length} pending candidate(s) to Discord...`)
    const dispatchResult = await sendDiscordJobs(pendingToNotify)
    notifiedCount = dispatchResult.sentCount

    if (dispatchResult.sentKeys.length > 0) {
      db.markNotified(dispatchResult.sentKeys)
    }

    if (dispatchResult.failedCount > 0) {
      console.warn(
        `[discord] ⚠️ ${dispatchResult.failedCount} job(s) failed delivery. Preserved in SQLite for automatic retry.`
      )
      for (const err of dispatchResult.errors) {
        console.warn(`[discord] Delivery error: ${err}`)
      }
    }
  }
  console.log(
    `[Scrape Complete] ${scanned} scanned, ${newCount} new, ${seenCount} already seen, ${notifiedCount} sent to Discord.`
  )

  return { scanned, newCount, seenCount, notifiedCount }
}
