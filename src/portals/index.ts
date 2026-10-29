import type { PortalName, PortalScraper } from "../core/types"
import { DeallsScraper } from "./dealls"
import { GlassdoorScraper } from "./glassdoor"
import { GlintsScraper } from "./glints"
import { IndeedScraper } from "./indeed"
import { JobstreetScraper } from "./jobstreet"
import { KalibrrScraper } from "./kalibrr"
import { LinkedinScraper } from "./linkedin"
import { TechInAsiaScraper } from "./techinasia"

export {
  DeallsScraper,
  GlassdoorScraper,
  GlintsScraper,
  IndeedScraper,
  JobstreetScraper,
  KalibrrScraper,
  LinkedinScraper,
  TechInAsiaScraper
}
export function getScrapers(): Record<PortalName, PortalScraper> {
  return {
    jobstreet: new JobstreetScraper(),
    linkedin: new LinkedinScraper(),
    kalibrr: new KalibrrScraper(),
    glints: new GlintsScraper(),
    dealls: new DeallsScraper(),
    techinasia: new TechInAsiaScraper(),
    indeed: new IndeedScraper(),
    glassdoor: new GlassdoorScraper()
  }
}
