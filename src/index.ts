import { loadConfig } from "./core/config"
import { runScraper } from "./orchestrator"
import { closeBrowser } from "./services/browser"
import { sendDiscordJobs, testWebhook } from "./services/discord"
import { JobDatabase } from "./storage/db"
async function main() {
  const args = process.argv.slice(2)
  const isDaemon = args.includes("--daemon")
  const configArgIndex = args.indexOf("--config")
  const configPath = configArgIndex !== -1 && args[configArgIndex + 1] ? args[configArgIndex + 1] : "config.json"
  const config = loadConfig(configPath)
  const db = new JobDatabase()

  if (args.includes("--test-discord")) {
    console.log("[Discord] Sending test notification...")
    const ok = await testWebhook()
    db.close()
    process.exit(ok ? 0 : 1)
  }

  if (args.includes("--dispatch-pending")) {
    const idx = args.indexOf("--dispatch-pending")
    const limit = Number(args[idx + 1]) || 50
    const pending = db.getPendingJobs(limit)
    console.log(`[Discord] Found ${pending.length} pending job(s) in SQLite (limit: ${limit}).`)
    if (pending.length > 0) {
      const result = await sendDiscordJobs(pending)
      if (result.sentKeys.length > 0) {
        db.markNotified(result.sentKeys)
      }
      console.log(`[Discord] Dispatched: ${result.sentCount}, Failed: ${result.failedCount}`)
    }
    db.close()
    return
  }

  if (args.includes("--resend")) {
    const resendIndex = args.indexOf("--resend")
    const count = Number(args[resendIndex + 1]) || 5
    const resetCount = db.resetRecentNotified(count)
    console.log(`[Discord] Reset ${resetCount} recent job(s) to unnotified.`)

    const pending = db.getPendingJobs(count)
    if (pending.length > 0) {
      const result = await sendDiscordJobs(pending)
      if (result.sentKeys.length > 0) {
        db.markNotified(result.sentKeys)
      }
      console.log(`[Discord] Dispatched: ${result.sentCount}, Failed: ${result.failedCount}`)
    }
    db.close()
    return
  }

  if (args.includes("--stats")) {
    const stats = db.getStats()
    console.log(`Total indexed: ${stats.total}, Notified: ${stats.notified}`)
    db.close()
    return
  }
  if (!isDaemon) {
    try {
      await runScraper(config, db)
    } finally {
      await closeBrowser()
      db.close()
    }
    return
  }

function getMsUntilNextTime(timeStr: string): number {
  const parts = timeStr.split(":").map(Number)
  const hours = parts[0] || 0
  const minutes = parts[1] || 0
  const now = new Date()
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  return target.getTime() - now.getTime()
}

  const dailyTime = process.env.SCHEDULE_DAILY_AT?.trim() // e.g. "08:00"
  const runOnBoot = process.env.RUN_ON_BOOT !== "false"
  const intervalHours = Number(process.env.SCRAPE_INTERVAL_HOURS) || 24

  if (dailyTime) {
    console.log(`[Daemon] Daily schedule active: triggers at ${dailyTime} every day.`)
  } else {
    console.log(`[Daemon] Interval active: triggers every ${intervalHours} hours.`)
  }

  let running = true
  const shutdown = async () => {
    console.log("[Daemon] Shutting down...")
    running = false
    await closeBrowser()
    db.close()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  let isFirstRun = true

  while (running) {
    if (isFirstRun && !runOnBoot) {
      console.log("[Daemon] RUN_ON_BOOT=false. Waiting for scheduled time without scraping now.")
    } else {
      try {
        await runScraper(config, db)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Daemon] Cycle error: ${msg}`)
      }
    }

    isFirstRun = false

    let sleepMs: number
    if (dailyTime) {
      sleepMs = getMsUntilNextTime(dailyTime)
      const nextDate = new Date(Date.now() + sleepMs)
      console.log(
        `[Daemon] Next scrape at: ${nextDate.toLocaleString()} (in ${Math.round(sleepMs / 60000)} min)`
      )
    } else {
      sleepMs = intervalHours * 60 * 60 * 1000
      console.log(`[Daemon] Sleeping for ${intervalHours} hours until next cycle...`)
    }

    await Bun.sleep(sleepMs)
  }
}

if (import.meta.main) {
  await main()
}
