import type { Job, PortalName } from "../core/types"

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
  key?: string
}

export interface DiscordDispatchResult {
  sentCount: number
  failedCount: number
  sentKeys: string[]
  failedKeys: string[]
  errors: string[]
}

export async function sendDiscordJobs(
  jobs: Array<Job | DiscordDispatchItem>,
  webhookUrl: string = process.env.DISCORD_WEBHOOK_URL || ""
): Promise<DiscordDispatchResult> {
  if (jobs.length === 0) {
    return { sentCount: 0, failedCount: 0, sentKeys: [], failedKeys: [], errors: [] }
  }

  const normalized: Array<{ job: Job; key: string }> = jobs.map((item) => {
    if ("job" in item) {
      return { job: item.job, key: item.key || item.job.id }
    }
    return { job: item, key: item.id }
  })

  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    console.warn("[discord] DISCORD_WEBHOOK_URL not configured. Printing jobs to stdout:")
    for (const { job } of normalized) {
      console.log(`- [${job.portal.toUpperCase()}] [${job.workType}] ${job.title} @ ${job.company} (${job.url})`)
    }
    return {
      sentCount: normalized.length,
      failedCount: 0,
      sentKeys: normalized.map((n) => n.key),
      failedKeys: [],
      errors: []
    }
  }

  const chunkSize = 5
  const delayMs = Number(process.env.DISCORD_DELAY_MS) || 2500
  const sentKeys: string[] = []
  const failedKeys: string[] = []
  const errors: string[] = []

  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize)
    const embeds = chunk.map((c) => formatJobEmbed(c.job))
    const chunkKeys = chunk.map((c) => c.key)

    let sent = false
    let attempts = 0

    while (!sent && attempts < 3) {
      attempts++
      try {
        const res = await fetch(webhookUrl, {
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
          const errMsg = `Webhook HTTP ${res.status}: ${errText}`
          console.error(`[discord] ${errMsg}`)
          errors.push(errMsg)
          break
        }

        sent = true
        sentKeys.push(...chunkKeys)
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
      failedKeys.push(...chunkKeys)
    }

    if (i + chunkSize < normalized.length) {
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
