import { validatePositionThreads } from "../core/config"
import { findBestMatchingPosition } from "../core/filter"
import type { Config, Job, PortalName, PositionConfig } from "../core/types"
import type { JobDatabase } from "../storage/db"

const PORTAL_COLORS: Record<PortalName, number> = {
  jobstreet: 0x830051,
  linkedin: 0x0a66c2,
  glints: 0xef4546,
  kalibrr: 0x1f8ceb,
  dealls: 0x2b6cb0,
  techinasia: 0xee3124,
  indeed: 0x2164f4,
  glassdoor: 0x0caa41
}

interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

interface DiscordEmbed {
  title: string
  url: string
  color: number
  author?: { name: string }
  fields: DiscordEmbedField[]
  footer: { text: string }
  timestamp?: string
}

export function formatJobEmbed(job: Job): DiscordEmbed {
  const color = PORTAL_COLORS[job.portal] || 0x5865f2
  const dateStr = job.postedDate ? job.postedDate.slice(0, 10) : new Date().toISOString().slice(0, 10)

  const fields: DiscordEmbedField[] = [
    { name: "🏢 Company", value: job.company || "Unknown", inline: true },
    { name: "📍 Location", value: job.location || "Indonesia", inline: true },
    { name: "💼 Type", value: job.workType, inline: true },
    { name: "💰 Salary", value: job.salary || "Not specified", inline: true },
    { name: "🌐 Portal", value: job.portal.toUpperCase(), inline: true },
    { name: "🕒 Posted", value: dateStr, inline: true }
  ]

  if (job.aiAnalysis?.techStack && job.aiAnalysis.techStack.length > 0) {
    fields.push({
      name: "🛠️ Tech Stack",
      value: job.aiAnalysis.techStack.join(", "),
      inline: false
    })
  }

  if (job.aiAnalysis?.summary) {
    fields.push({
      name: "📝 Summary",
      value: job.aiAnalysis.summary,
      inline: false
    })
  } else if (job.descriptionSnippet) {
    fields.push({
      name: "📋 Snippet",
      value: job.descriptionSnippet.slice(0, 250),
      inline: false
    })
  }

  return {
    title: `[${job.workType}] ${job.title}`,
    url: job.url,
    color,
    author: { name: job.company },
    fields,
    footer: {
      text: `ID Job Alert Automation • ${new Date().toISOString().slice(0, 10)}`
    }
  }
}
export interface DiscordDispatchItem {
  job: Job
  key: string
  threadId: string
}

export interface DiscordDispatchResult {
  sentCount: number
  failedCount: number
  sentKeys: string[]
  failedKeys: string[]
  errors: string[]
}

export async function sendDiscordJobs(
  items: DiscordDispatchItem[],
  webhookUrl: string = process.env.DISCORD_WEBHOOK_URL || ""
): Promise<DiscordDispatchResult> {
  const sentKeys: string[] = []
  const failedKeys: string[] = []
  const errors: string[] = []

  if (items.length === 0) {
    return { sentCount: 0, failedCount: 0, sentKeys, failedKeys, errors }
  }

  let parsedWebhook: URL | undefined
  if (webhookUrl) {
    try {
      const candidate = new URL(webhookUrl)
      if (candidate.protocol === "http:" || candidate.protocol === "https:") {
        parsedWebhook = candidate
      }
    } catch {
      parsedWebhook = undefined
    }
  }

  if (!parsedWebhook) {
    const message = webhookUrl
      ? "[discord] DISCORD_WEBHOOK_URL is malformed; expected https://discord.com/api/webhooks/<id>/<token>. Nothing sent, all jobs stay pending."
      : "[discord] DISCORD_WEBHOOK_URL is not configured; nothing sent, all jobs stay pending."
    console.error(message)
    for (const { job } of items) {
      console.log(`- [${job.portal.toUpperCase()}] [${job.workType}] ${job.title} @ ${job.company} (${job.url})`)
    }
    return {
      sentCount: 0,
      failedCount: items.length,
      sentKeys,
      failedKeys: items.map((item) => item.key),
      errors: [message]
    }
  }

  const chunkSize = 5
  const delayMs = process.env.DISCORD_DELAY_MS ? Number(process.env.DISCORD_DELAY_MS) : 2500

  // Group by thread so a batch never mixes destinations; order inside a group is preserved.
  const groups = new Map<string, DiscordDispatchItem[]>()
  for (const item of items) {
    const group = groups.get(item.threadId)
    if (group) {
      group.push(item)
    } else {
      groups.set(item.threadId, [item])
    }
  }

  const batches: Array<{ target?: string; items: DiscordDispatchItem[] }> = []
  for (const [threadId, group] of groups) {
    let target: string | undefined
    if (!/^\d+$/.test(threadId)) {
      errors.push(`Invalid thread ID "${threadId}"; refusing to post to the parent channel.`)
    } else {
      try {
        const url = new URL(parsedWebhook.href)
        url.searchParams.set("thread_id", threadId)
        url.searchParams.set("wait", "true")
        target = url.toString()
      } catch (err: unknown) {
        errors.push(`Invalid webhook URL: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (!target) {
      console.error(`[discord] ${errors[errors.length - 1]}`)
    }
    for (let i = 0; i < group.length; i += chunkSize) {
      batches.push({ target, items: group.slice(i, i + chunkSize) })
    }
  }

  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index]
    const batchKeys = batch.items.map((item) => item.key)

    if (!batch.target) {
      failedKeys.push(...batchKeys)
    } else {
      const embeds = batch.items.map((item) => formatJobEmbed(item.job))
      let sent = false
      let attempts = 0

      while (!sent && attempts < 3) {
        attempts++
        try {
          const res = await fetch(batch.target, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "ID-Job-Scraper/1.0"
            },
            body: JSON.stringify({ embeds })
          })

          if (res.status === 429) {
            const body = (await res.json()) as { retry_after?: number }
            const waitMs = Math.ceil((body.retry_after || 3) * 1000) + 500
            console.warn(`[discord] Rate limited (429). Waiting ${waitMs}ms before retry...`)
            await Bun.sleep(waitMs)
            continue
          }

          if (!res.ok) {
            const errText = await res.text()
            const hint =
              errText.includes("10003") || /unknown channel/i.test(errText)
                ? " (thread not found in this webhook's channel; recreate the thread there or update threadId)"
                : ""
            const errMsg = `Webhook HTTP ${res.status}: ${errText}${hint}`
            console.error(`[discord] ${errMsg}`)
            errors.push(errMsg)
            break
          }

          sent = true
          sentKeys.push(...batchKeys)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          if (attempts < 3) {
            const backoffMs = 2000 * attempts
            console.warn(
              `[discord] Socket/network error (attempt ${attempts}/3): ${msg}. Retrying in ${backoffMs}ms...`
            )
            await Bun.sleep(backoffMs)
          } else {
            console.error(`[discord] Dispatch failed after 3 attempts: ${msg}`)
            errors.push(msg)
            break
          }
        }
      }

      if (!sent) {
        failedKeys.push(...batchKeys)
      }
    }

    if (index < batches.length - 1) {
      await Bun.sleep(delayMs)
    }
  }

  return {
    sentCount: sentKeys.length,
    failedCount: failedKeys.length,
    sentKeys,
    failedKeys,
    errors
  }
}

export async function dispatchPendingJobs(
  db: JobDatabase,
  config: Pick<Config, "positions" | "excludeKeywords">,
  limit: number,
  webhookUrl: string = process.env.DISCORD_WEBHOOK_URL || ""
): Promise<DiscordDispatchResult> {
  validatePositionThreads(config.positions)

  const pageSize = 50
  const selected: DiscordDispatchItem[] = []
  let offset = 0

  // Page the queue so unmatched legacy rows cannot starve later matching jobs.
  // Nothing is marked during selection, so offsets stay stable for this dispatch.
  while (selected.length < limit) {
    const page = db.getPendingJobs(pageSize, offset)
    if (page.length === 0) {
      break
    }
    for (const row of page) {
      if (selected.length >= limit) {
        break
      }
      const position = findBestMatchingPosition(
        row.job.title,
        config.positions,
        config.excludeKeywords
      )
      if (!position) {
        console.log(
          `[discord] No configured position matches pending job "${row.job.title}" @ ${row.job.company} (${row.key}); left pending.`
        )
        continue
      }
      selected.push({ job: row.job, key: row.key, threadId: position.discord.threadId })
    }
    if (page.length < pageSize) {
      break
    }
    offset += pageSize
  }

  if (selected.length === 0) {
    return { sentCount: 0, failedCount: 0, sentKeys: [], failedKeys: [], errors: [] }
  }

  const result = await sendDiscordJobs(selected, webhookUrl)
  if (result.sentKeys.length > 0) {
    db.markNotified(result.sentKeys)
  }
  return result
}

export async function testWebhook(
  webhookUrl: string = process.env.DISCORD_WEBHOOK_URL || ""
): Promise<boolean> {
  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    console.error("[discord] DISCORD_WEBHOOK_URL is missing or not a valid HTTP URL.")
    return false
  }

  const sampleJob: Job = {
    id: "test-notification",
    title: "Test Alert (Webhook Connected)",
    company: "ID Job Scraper Automation",
    location: "Jakarta, Indonesia",
    workType: "Remote",
    salary: "IDR 25,000,000 - 35,000,000",
    url: "https://id.jobstreet.com",
    postedDate: new Date().toISOString(),
    portal: "jobstreet",
    aiAnalysis: {
      techStack: ["TypeScript", "Bun", "SQLite", "Playwright"],
      summary: "Webhook integration test successful. Your Discord alert pipeline is active and ready to receive real postings."
    }
  }

  const embed = formatJobEmbed(sampleJob)
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[discord] Test webhook failed (HTTP ${res.status}): ${errText}`)
      return false
    }

    console.log("[discord] Webhook test succeeded! Check your Discord channel.")
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[discord] Test webhook request failed: ${msg}`)
    return false
  }
}
