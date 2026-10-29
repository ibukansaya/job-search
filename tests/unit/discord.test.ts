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

  test("sendDiscordJobs dry runs and tracks sentKeys when webhook URL is empty", async () => {
    const resEmpty = await sendDiscordJobs([{ job: baseJob, key: "tokopedia_backend-eng" }], "")
    expect(resEmpty.sentCount).toBe(1)
    expect(resEmpty.failedCount).toBe(0)
    expect(resEmpty.sentKeys).toEqual(["tokopedia_backend-eng"])

    const resMultiple = await sendDiscordJobs(
      [
        { job: baseJob, key: "job-1" },
        { job: { ...baseJob, id: "2" }, key: "job-2" }
      ],
      ""
    )
    expect(resMultiple.sentCount).toBe(2)
    expect(resMultiple.sentKeys).toEqual(["job-1", "job-2"])

    const resZero = await sendDiscordJobs([], "")
    expect(resZero.sentCount).toBe(0)
    expect(resZero.failedCount).toBe(0)
  })
})
