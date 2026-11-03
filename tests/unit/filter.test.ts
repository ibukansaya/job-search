import { describe, expect, test } from "bun:test"
import {
  findBestMatchingPosition,
  isJobTitleRelevant,
  normalizeJobTitle,
  verifyJobContent
} from "../../src/core/filter"
import type { PositionConfig } from "../../src/core/types"

function position(name: string, threadId: string, extra: Partial<PositionConfig> = {}): PositionConfig {
  return { name, discord: { threadId }, ...extra }
}

const positions: PositionConfig[] = [
  position("Software Engineer", "100", { aliases: ["Software Developer"], priority: 10 }),
  position("Frontend Developer", "101", { aliases: ["Frontend Engineer"] }),
  position("Backend Developer", "102", { aliases: ["Backend Engineer"] }),
  position("Fullstack Developer", "103", { aliases: ["Fullstack Engineer", "Full Stack Developer"] }),
  position("AI Engineer", "104", { aliases: ["AI Developer"] }),
  position("ML Engineer", "105", { aliases: ["Machine Learning Engineer"] }),
  position("Cloud Engineer", "106", { aliases: ["Cloud Infrastructure Engineer"] }),
  position("DevOps Engineer", "107", { aliases: ["Site Reliability Engineer", "SRE"] }),
  position("QA Engineer", "108", { aliases: ["SDET", "Quality Assurance Engineer", "Test Engineer"] })
]

describe("config-driven title filter", () => {
  test("normalizes text generically without hardcoded role synonyms", () => {
    expect(normalizeJobTitle("Front-End Developer")).toBe("front end developer")
    expect(normalizeJobTitle("  Backend   Engineer  ")).toBe("backend engineer")
    expect(normalizeJobTitle("QA/DevOps")).toBe("qa devops")
    expect(normalizeJobTitle("Développeur")).toBe("developpeur")
    // Role vocabulary lives in config aliases, not normalization.
    expect(normalizeJobTitle("SDET Specialist")).toBe("sdet specialist")
  })

  test("accepts titles matched by configured names and aliases", () => {
    expect(isJobTitleRelevant("Senior Backend Engineer - Central Tech", positions)).toBe(true)
    expect(isJobTitleRelevant("Lead AI Engineer / AI Solutions Architect", positions)).toBe(true)
    expect(isJobTitleRelevant("Fullstack Developer", positions)).toBe(true)
    expect(isJobTitleRelevant("Jr. QA Engineer", positions)).toBe(true)
    expect(isJobTitleRelevant("Cloud Infrastructure Engineer", positions)).toBe(true)
    expect(isJobTitleRelevant("DevOps Engineer", positions)).toBe(true)
    expect(isJobTitleRelevant("Front-End Developer", positions)).toBe(true)
    expect(isJobTitleRelevant("Site Reliability Engineer", positions)).toBe(true)
    expect(isJobTitleRelevant("SDET Specialist", positions)).toBe(true)
    expect(isJobTitleRelevant("Machine Learning Engineer", positions)).toBe(true)
  })

  test("rejects titles that no configured position or alias matches", () => {
    expect(isJobTitleRelevant("Senior AI UI/UX Designer", positions)).toBe(false)
    expect(isJobTitleRelevant("Product Manager", positions)).toBe(false)
    expect(isJobTitleRelevant("Scrum Master", positions)).toBe(false)
    expect(isJobTitleRelevant("IT Helpdesk", positions)).toBe(false)
    expect(isJobTitleRelevant("Sales Engineer", positions)).toBe(false)
    expect(isJobTitleRelevant("Civil Engineer", positions)).toBe(false)
  })

  test("new configured positions are matched without code changes", () => {
    const custom = [position("Data Scientist", "200", { aliases: ["Data Analyst"] })]
    expect(isJobTitleRelevant("Senior Data Scientist", custom)).toBe(true)
    expect(isJobTitleRelevant("Data Analyst - Growth", custom)).toBe(true)
    expect(isJobTitleRelevant("Backend Engineer", custom)).toBe(false)
  })

  test("excludeKeywords comes from config and blocks matching titles", () => {
    const broad = [position("Engineer", "300")]
    expect(isJobTitleRelevant("Sales Engineer", broad)).toBe(true)
    expect(isJobTitleRelevant("Sales Engineer", broad, ["sales"])).toBe(false)

    // A keyword explicitly present in a configured position or alias is requested, not excluded.
    const salesEngineer = [position("Sales Engineer", "301")]
    expect(isJobTitleRelevant("Sales Engineer", salesEngineer, ["sales"])).toBe(true)
  })

  test("verifyJobContent rejects snippets containing configured exclude keywords", () => {
    const badJob = {
      title: "DevOps Engineer",
      descriptionSnippet: "Supervising HVAC system installation."
    }
    expect(verifyJobContent(badJob, positions, ["hvac"]).pass).toBe(false)

    const goodJob = {
      title: "DevOps Engineer",
      descriptionSnippet: "Managing Kubernetes clusters, CI/CD pipelines, and Terraform infrastructure."
    }
    expect(verifyJobContent(goodJob, positions, ["hvac"]).pass).toBe(true)
  })
})

describe("findBestMatchingPosition", () => {
  test("config priority sends a shared title to the more specific thread", () => {
    const configPositions = [
      position("Software Engineer", "generic", { priority: 10 }),
      position("Backend Engineer", "backend")
    ]
    expect(findBestMatchingPosition("Senior Backend Software Engineer", configPositions)?.discord.threadId).toBe(
      "backend"
    )
    expect(findBestMatchingPosition("Software Engineer", configPositions)?.discord.threadId).toBe("generic")
  })

  test("without priority, equal specificity keeps configuration order", () => {
    const configPositions = [position("Software Engineer", "first"), position("Backend Engineer", "second")]
    expect(findBestMatchingPosition("Senior Backend Software Engineer", configPositions)?.discord.threadId).toBe(
      "first"
    )
  })

  test("normalized duplicate targets resolve to the first configured position", () => {
    const duplicates = [
      position("Frontend Developer", "first"),
      position("Frontend Engineer", "second", { aliases: ["Frontend Developer"] })
    ]
    expect(findBestMatchingPosition("Frontend Developer", duplicates)?.discord.threadId).toBe("first")
  })

  test("more specific alias wins over a broader match", () => {
    const configPositions = [position("Engineer", "broad"), position("Data Engineer", "data")]
    expect(findBestMatchingPosition("Senior Data Engineer", configPositions)?.discord.threadId).toBe("data")
  })

  test("aliases route titles into their configured thread", () => {
    expect(findBestMatchingPosition("Site Reliability Engineer", positions)?.discord.threadId).toBe("107")
    expect(findBestMatchingPosition("Quality Assurance Engineer", positions)?.discord.threadId).toBe("108")
  })

  test("excluded or unmatched titles resolve to undefined", () => {
    const broad = [position("Engineer", "300")]
    expect(findBestMatchingPosition("Sales Engineer", broad, ["sales"])).toBeUndefined()
    expect(findBestMatchingPosition("Product Manager", positions)).toBeUndefined()
    expect(findBestMatchingPosition("", positions)).toBeUndefined()
    expect(findBestMatchingPosition("Backend Engineer", [])).toBeUndefined()
  })
})
