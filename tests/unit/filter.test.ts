import { describe, expect, test } from "bun:test"
import { isJobTitleRelevant, normalizeJobTitle, verifyJobContent } from "../../src/core/filter"

describe("2-Layer Filter Tests", () => {
  const allowedPositions = [
    "Software Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Fullstack Developer",
    "AI Engineer",
    "ML Engineer",
    "Cloud Engineer",
    "DevOps Engineer",
    "QA Engineer"
  ]

  test("normalizes developer synonyms and hyphenated terms", () => {
    expect(normalizeJobTitle("Front-End Developer")).toContain("frontend engineer")
    expect(normalizeJobTitle("Full-Stack Developer")).toContain("fullstack engineer")
    expect(normalizeJobTitle("Back-End Developer")).toContain("backend engineer")
    expect(normalizeJobTitle("SDET Specialist")).toContain("qa engineer")
  })

  test("Layer 1: accepts genuine software and engineering titles", () => {
    expect(isJobTitleRelevant("Senior Backend Engineer - Central Tech", allowedPositions)).toBe(true)
    expect(isJobTitleRelevant("Lead AI Engineer / AI Solutions Architect", allowedPositions)).toBe(true)
    expect(isJobTitleRelevant("Fullstack Developer", allowedPositions)).toBe(true)
    expect(isJobTitleRelevant("Jr. QA Engineer", allowedPositions)).toBe(true)
    expect(isJobTitleRelevant("Cloud Infrastructure Engineer", allowedPositions)).toBe(true)
    expect(isJobTitleRelevant("DevOps Engineer", allowedPositions)).toBe(true)
    expect(isJobTitleRelevant("Software Engineer - Fullstack", allowedPositions)).toBe(true)
  })

  test("Layer 1: rejects non-tech and non-developer roles", () => {
    expect(isJobTitleRelevant("Senior AI UI/UX Designer", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("Product Manager", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("Senior Product Manager - Consumer", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("Product Manager - Agriculture & Delivery Drones", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("AI Product Manager Intern", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("Scrum Master", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("IT Helpdesk", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("Desktop Support Specialist", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("Sales Engineer", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("Civil Engineer", allowedPositions)).toBe(false)
    expect(isJobTitleRelevant("Mechanical Engineer", allowedPositions)).toBe(false)
  })

  test("Layer 2: verifyJobContent rejects non-software content signals", () => {
    const badJob = {
      title: "DevOps Engineer",
      descriptionSnippet: "Supervising civil construction and site safety."
    }
    const check = verifyJobContent(badJob, allowedPositions)
    expect(check.pass).toBe(false)

    const goodJob = {
      title: "DevOps Engineer",
      descriptionSnippet: "Managing Kubernetes clusters, CI/CD pipelines, and Terraform infrastructure."
    }
    expect(verifyJobContent(goodJob, allowedPositions).pass).toBe(true)
  })
})
