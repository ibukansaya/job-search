import OpenAI from "openai"
import type { Job } from "../core/types"

const isEnabled = process.env.AI_ENRICH_ENABLED === "true"
const baseURL = process.env.NINEROUTER_BASE_URL || process.env.OPENAI_BASE_URL || ""
const apiKey = process.env.NINEROUTER_API_KEY || process.env.OPENAI_API_KEY || "dummy"
const model = process.env.NINEROUTER_MODEL || process.env.OPENAI_MODEL || "openai/gpt-4o-mini"

let client: OpenAI | null = null

function getClient(): OpenAI | null {
  if (!isEnabled || !baseURL) return null
  if (!client) {
    client = new OpenAI({ baseURL, apiKey })
  }
  return client
}

export async function enrichJob(job: Job, allowedPositions: string[] = []): Promise<Job> {
  const openai = getClient()
  if (!openai) {
    return job
  }

  const positionsContext =
    allowedPositions.length > 0
      ? `Target engineering positions to evaluate against: ${allowedPositions.join(", ")}.`
      : ""

  const prompt = `Analyze this job posting. ${positionsContext}
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Description/Snippet: ${job.descriptionSnippet || "None"}

Task:
1. Determine if this posting genuinely represents a software engineering, development, QA/SDET, DevOps, Cloud, AI/ML, or technical infrastructure role (NOT pure UI/graphic design, sales, product management, or customer support).
2. Extract the core tech stack tools/languages.
3. Write a concise 1-paragraph summary (2-4 sentences) covering the core role focus and key responsibilities.

Return pure JSON matching this schema:
{
  "matchesTargetRole": true,
  "rejectionReason": null,
  "techStack": ["string"],
  "summary": "string"
}
(If matchesTargetRole is false, set rejectionReason to a concise explanation e.g. "Role is UI/UX design, not engineering")`

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a tech recruiter analyzer. Respond with valid JSON only."
        },
        { role: "user", content: prompt }
      ]
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) return job

    const parsed = JSON.parse(raw) as {
      matchesTargetRole?: boolean
      rejectionReason?: string | null
      techStack?: string[]
      summary?: string
    }

    return {
      ...job,
      aiAnalysis: {
        matchesTargetRole: parsed.matchesTargetRole !== false,
        rejectionReason: parsed.rejectionReason || undefined,
        techStack: Array.isArray(parsed.techStack) ? parsed.techStack.slice(0, 8) : [],
        summary: typeof parsed.summary === "string" ? parsed.summary.trim() : ""
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ai] Enrichment failed for ${job.title}: ${msg}`)
    return job
  }
}

export async function enrichJobs(
  jobs: Job[],
  concurrency = 3,
  allowedPositions: string[] = []
): Promise<Job[]> {
  if (jobs.length === 0 || !process.env.NINEROUTER_BASE_URL) {
    return jobs
  }

  const results: Job[] = []
  for (let i = 0; i < jobs.length; i += concurrency) {
    const chunk = jobs.slice(i, i + concurrency)
    const enrichedChunk = await Promise.all(chunk.map((job) => enrichJob(job, allowedPositions)))
    results.push(...enrichedChunk)
  }
  return results
}
