import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { Config, Job } from "../../src/core/types"
import { dispatchPendingJobs } from "../../src/services/discord"
import { JobDatabase } from "../../src/storage/db"

interface RecordedRequest {
  threadId: string | null
  wait: string | null
  titles: string[]
}

function makeJob(id: string, title: string, company: string): Job {
  return {
    id,
    title,
    company,
    location: "Jakarta, Indonesia",
    workType: "Remote",
    url: `https://example.com/jobs/${id}`,
    postedDate: "2026-11-01T00:00:00.000Z",
    portal: "linkedin"
  }
}

function startFakeDiscord(failingThreadIds: Set<string> = new Set()) {
  const requests: RecordedRequest[] = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const body = (await req.json()) as { embeds: Array<{ title: string }> }
      const threadId = url.searchParams.get("thread_id")
      requests.push({
        threadId,
        wait: url.searchParams.get("wait"),
        titles: body.embeds.map((embed) => embed.title)
      })
      if (threadId && failingThreadIds.has(threadId)) {
        return new Response("missing permissions", { status: 403 })
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
    }
  })
  return {
    requests,
    failingThreadIds,
    webhookUrl: `http://127.0.0.1:${server.port}/api/webhooks/123/token?foo=bar`,
    stop: () => server.stop(true)
  }
}

const positions: Config["positions"] = [
  { name: "Frontend Developer", discord: { threadId: "1000" } },
  { name: "Backend Engineer", discord: { threadId: "2000" } },
  { name: "Software Engineer", priority: 10, discord: { threadId: "3000" } }
]

const config: Pick<Config, "positions" | "excludeKeywords"> = { positions, excludeKeywords: [] }

describe("discord thread dispatch integration", () => {
  beforeAll(() => {
    process.env.DISCORD_DELAY_MS = "0"
  })

  afterAll(() => {
    delete process.env.DISCORD_DELAY_MS
  })

  test("routes every job to exactly one thread and never mixes destinations in a batch", async () => {
    const fake = startFakeDiscord()
    const db = new JobDatabase(":memory:")

    try {
      db.saveCandidate(makeJob("1", "Frontend Developer", "Alpha"), "alpha_frontend")
      db.saveCandidate(makeJob("2", "Senior Backend Software Engineer", "Beta"), "beta_backend")
      db.saveCandidate(makeJob("3", "Software Engineer", "Gamma"), "gamma_generic")
      for (let i = 0; i < 6; i++) {
        db.saveCandidate(makeJob(`b${i}`, "Backend Engineer", `Company ${i}`), `company-${i}_backend`)
      }

      const result = await dispatchPendingJobs(db, config, 50, fake.webhookUrl)

      expect(result.sentCount).toBe(9)
      expect(result.failedCount).toBe(0)

      const titlesByThread = new Map<string, string[]>()
      for (const request of fake.requests) {
        expect(request.threadId).not.toBeNull()
        expect(request.wait).toBe("true")
        expect(request.titles.length).toBeLessThanOrEqual(5)
        const threadId = request.threadId as string
        titlesByThread.set(threadId, [...(titlesByThread.get(threadId) ?? []), ...request.titles])
      }

      // 7 backend jobs need two batches, both on the same thread.
      expect(fake.requests.filter((r) => r.threadId === "2000").length).toBe(2)
      expect(titlesByThread.get("2000")).toHaveLength(7)
      expect(titlesByThread.get("2000")?.every((title) => title.includes("Backend"))).toBe(true)
      expect(titlesByThread.get("1000")).toEqual(["[Remote] Frontend Developer"])
      expect(titlesByThread.get("3000")).toEqual(["[Remote] Software Engineer"])
      expect(titlesByThread.size).toBe(3)

      expect(db.getStats()).toEqual({ total: 9, notified: 9 })
    } finally {
      db.close()
      fake.stop()
    }
  })

  test("marks only the successful thread as notified and retries the failed one", async () => {
    const fake = startFakeDiscord(new Set(["4000"]))
    const db = new JobDatabase(":memory:")

    try {
      db.saveCandidate(makeJob("d1", "Data Engineer", "Delta"), "delta_data")
      db.saveCandidate(makeJob("p1", "Platform Engineer", "Epsilon"), "epsilon_platform")

      const failingConfig: Pick<Config, "positions" | "excludeKeywords"> = {
        positions: [
          { name: "Data Engineer", discord: { threadId: "4000" } },
          { name: "Platform Engineer", discord: { threadId: "5000" } }
        ],
        excludeKeywords: []
      }

      const first = await dispatchPendingJobs(db, failingConfig, 10, fake.webhookUrl)
      expect(first.sentCount).toBe(1)
      expect(first.failedCount).toBe(1)
      expect(first.sentKeys).toEqual(["epsilon_platform"])
      expect(first.failedKeys).toEqual(["delta_data"])

      const pendingAfterFailure = db.getPendingJobs(10)
      expect(pendingAfterFailure.map((row) => row.key)).toEqual(["delta_data"])

      fake.failingThreadIds.clear()
      const second = await dispatchPendingJobs(db, failingConfig, 10, fake.webhookUrl)
      expect(second.sentCount).toBe(1)
      expect(second.sentKeys).toEqual(["delta_data"])
      expect(db.getPendingJobs(10)).toHaveLength(0)
      expect(db.getStats()).toEqual({ total: 2, notified: 2 })
    } finally {
      db.close()
      fake.stop()
    }
  })

  test("paging lets a later matching job dispatch past unmatched pending rows", async () => {
    const fake = startFakeDiscord()
    const db = new JobDatabase(":memory:")

    try {
      for (let i = 0; i < 50; i++) {
        db.saveCandidate(makeJob(`old${i}`, "Product Manager", `Legacy ${i}`), `legacy-${i}_pm`)
      }
      db.saveCandidate(makeJob("new1", "Backend Engineer", "Fresh"), "fresh_backend")

      const result = await dispatchPendingJobs(db, config, 1, fake.webhookUrl)

      expect(result.sentCount).toBe(1)
      expect(result.sentKeys).toEqual(["fresh_backend"])
      expect(fake.requests).toHaveLength(1)
      expect(fake.requests[0].threadId).toBe("2000")
      expect(fake.requests[0].titles).toEqual(["[Remote] Backend Engineer"])

      const pending = db.getPendingJobs(100)
      expect(pending).toHaveLength(50)
      expect(pending.every((row) => row.job.title === "Product Manager")).toBe(true)
    } finally {
      db.close()
      fake.stop()
    }
  })

  test("an unset webhook sends nothing and marks nothing", async () => {
    const db = new JobDatabase(":memory:")

    try {
      db.saveCandidate(makeJob("u1", "Backend Engineer", "Zeta"), "zeta_backend")

      const result = await dispatchPendingJobs(db, config, 10, "")

      expect(result.sentCount).toBe(0)
      expect(result.sentKeys).toEqual([])
      expect(result.failedKeys).toEqual(["zeta_backend"])
      expect(db.getStats()).toEqual({ total: 1, notified: 0 })
    } finally {
      db.close()
    }
  })
})
