import { describe, expect, test } from "bun:test"
import type { Job, PortalName } from "../../src/core/types"
import { formatJobEmbed, sendDiscordJobs } from "../../src/services/discord"

describe("discord unit tests", () => {
  const baseJob: Job = {
    id: "test-job-1",
    title: "Senior Backend Engineer",
    company: "Tokopedia",
    location: "Jakarta, Indonesia",
    workType: "Hybrid",
    salary: "IDR 30,000,000 - 45,000,000",
    url: "https://example.com/jobs/1",
    postedDate: "2026-10-29T08:00:00.000Z",
    portal: "jobstreet"
  }

  test("formatJobEmbed produces expected embed structure", () => {
    const embed = formatJobEmbed(baseJob)

    expect(embed.title).toBe("[Hybrid] Senior Backend Engineer")
    expect(embed.url).toBe("https://example.com/jobs/1")
    expect(embed.author?.name).toBe("Tokopedia")
    expect(embed.footer.text).toContain("ID Job Alert Automation •")

    const names = embed.fields.map((f) => f.name)
    expect(names).toContain("🏢 Company")
    expect(names).toContain("📍 Location")
    expect(names).toContain("💼 Type")
    expect(names).toContain("💰 Salary")
    expect(names).toContain("🌐 Portal")
    expect(names).toContain("🕒 Posted")
  })

  test("portal color mapping applies distinct brand colors", () => {
    const portals: Array<{ portal: PortalName; color: number }> = [
      { portal: "jobstreet", color: 0x830051 },
      { portal: "linkedin", color: 0x0a66c2 },
      { portal: "glints", color: 0xef4546 },
      { portal: "kalibrr", color: 0x1f8ceb },
      { portal: "dealls", color: 0x2b6cb0 },
      { portal: "techinasia", color: 0xee3124 },
      { portal: "indeed", color: 0x2164f4 },
      { portal: "glassdoor", color: 0x0caa41 }
    ]

    for (const { portal, color } of portals) {
      const embed = formatJobEmbed({ ...baseJob, portal })
      expect(embed.color).toBe(color)
    }

    const fallbackEmbed = formatJobEmbed({ ...baseJob, portal: "unknown" as PortalName })
    expect(fallbackEmbed.color).toBe(0x5865f2)
  })

  test("embed includes AI fields when present", () => {
    const jobWithAi: Job = {
      ...baseJob,
      aiAnalysis: {
        techStack: ["Go", "PostgreSQL", "Kafka"],
        summary: "Build scalable microservices for fintech platform."
      }
    }

    const embed = formatJobEmbed(jobWithAi)
    const techStackField = embed.fields.find((f) => f.name.includes("Tech Stack"))
    const summaryField = embed.fields.find((f) => f.name.includes("Summary"))

    expect(techStackField).toBeDefined()
    expect(techStackField?.value).toBe("Go, PostgreSQL, Kafka")
    expect(summaryField).toBeDefined()
    expect(summaryField?.value).toBe("Build scalable microservices for fintech platform.")
  })

  test("embed falls back to snippet when no AI summary provided", () => {
    const jobWithSnippet: Job = {
      ...baseJob,
      descriptionSnippet: "Looking for experience in distributed systems and cloud architecture."
    }

    const embed = formatJobEmbed(jobWithSnippet)
    const snippetField = embed.fields.find((f) => f.name.includes("Snippet"))
    const summaryField = embed.fields.find((f) => f.name.includes("Summary"))

    expect(summaryField).toBeUndefined()
    expect(snippetField).toBeDefined()
    expect(snippetField?.value).toBe("Looking for experience in distributed systems and cloud architecture.")
  })

  test("sendDiscordJobs fails without a webhook instead of reporting success", async () => {
    const resEmpty = await sendDiscordJobs(
      [{ job: baseJob, key: "tokopedia_backend-eng", threadId: "1234567890" }],
      ""
    )
    expect(resEmpty.sentCount).toBe(0)
    expect(resEmpty.failedCount).toBe(1)
    expect(resEmpty.sentKeys).toEqual([])
    expect(resEmpty.failedKeys).toEqual(["tokopedia_backend-eng"])
    expect(resEmpty.errors[0]).toContain("DISCORD_WEBHOOK_URL")

    const resMultiple = await sendDiscordJobs(
      [
        { job: baseJob, key: "job-1", threadId: "1234567890" },
        { job: { ...baseJob, id: "2" }, key: "job-2", threadId: "1234567890" }
      ],
      ""
    )
    expect(resMultiple.sentCount).toBe(0)
    expect(resMultiple.sentKeys).toEqual([])
    expect(resMultiple.failedKeys).toEqual(["job-1", "job-2"])

    const resZero = await sendDiscordJobs([], "")
    expect(resZero.sentCount).toBe(0)
    expect(resZero.failedCount).toBe(0)
  })

  test("sendDiscordJobs refuses invalid thread IDs without posting to the parent channel", async () => {
    const calls: string[] = []
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        calls.push(req.url)
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
      }
    })

    try {
      const result = await sendDiscordJobs(
        [{ job: baseJob, key: "job-1", threadId: "REPLACE_WITH_THREAD_ID" }],
        `http://127.0.0.1:${server.port}/webhook`
      )
      expect(result.sentCount).toBe(0)
      expect(result.failedKeys).toEqual(["job-1"])
      expect(result.errors[0]).toContain("Invalid thread ID")
      expect(calls.length).toBe(0)
    } finally {
      server.stop(true)
    }
  })
})
