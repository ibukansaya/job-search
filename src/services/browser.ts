import { chromium, type Browser, type BrowserContext } from "playwright"

let browserInstance: Browser | null = null
let contextInstance: BrowserContext | null = null

export async function getBrowserContext(): Promise<BrowserContext | null> {
  if (contextInstance) {
    return contextInstance
  }

  try {
    browserInstance = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    })

    contextInstance = await browserInstance.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 }
    })

    return contextInstance
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[browser] Playwright browser launch failed: ${msg}`)
    return null
  }
}

export async function closeBrowser(): Promise<void> {
  if (contextInstance) {
    await contextInstance.close().catch(() => {})
    contextInstance = null
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {})
    browserInstance = null
  }
}
