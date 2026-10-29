# Domain Reference: Job Portals

This document provides complete technical specifications for all job portals integrated or analyzed in this scraper, including request URLs, query parameters, data mapping, authentication, and Cloudflare anti-bot handling.

---

## Active Portals (8)

### 1. JobStreet Indonesia (`jobstreet`)
- **Portal Engine:** Native REST API (SEEK Asia v5).
- **Endpoint:** `GET https://id.jobstreet.com/api/jobsearch/v5/search`
- **Authentication:** Public / None required.
- **Headers:** `User-Agent: Mozilla/5.0 ...`, `Accept: application/json`.
- **Query Parameters:**
  - `siteKey`: `ID-Main`
  - `keywords`: Target position query (e.g. `Software Engineer`)
  - `where`: `Indonesia` (or specific city)
  - `pageSize`: `30`
  - `sortMode`: `ListedDate` (ensures freshest postings return first)
- **Work Type Extraction:**
  - Evaluates `workArrangements.data[].label.text` and `title`.
  - Maps `"Remote"` / `"WFH"` -> `Remote`
  - Maps `"Hybrid"` -> `Hybrid`
  - Maps `"On-site"` -> `On-site`
- **Entity Mapping:**
  - `id`: `String(data.id)`
  - `title`: `data.title`
  - `company`: `data.companyName || data.advertiser.description || data.employer.name`
  - `location`: `data.locations[0].label`
  - `salary`: `data.salaryLabel`
  - `url`: `https://id.jobstreet.com/id/job/${data.id}`
  - `postedDate`: `data.listingDate` (ISO 8601)
  - `descriptionSnippet`: `data.teaser`

---

### 2. LinkedIn Guest API (`linkedin`)
- **Portal Engine:** Guest Search API + Regex HTML Parser.
- **Endpoint:** `GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`
- **Authentication:** Public guest endpoint / No cookies or login required.
- **Headers:**
  - `User-Agent`: `Mozilla/5.0 ...`
  - `Accept-Language`: `en-US,en;q=0.9`
  - `Accept`: `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`
- **Query Parameters:**
  - `keywords`: Position query
  - `location`: `"Indonesia"` for local search; `"Worldwide"` for global remote
  - `f_WT`: Work type filter (`"1"` = On-site, `"2"` = Remote, `"3"` = Hybrid)
  - `f_TPR`: Time filter in seconds (e.g. `r259200` for 3 days, `r604800` for 7 days)
- **HTML Parsing Strategy:**
  - Segmented by `<li[\s\S]*?<\/li>` cards.
  - `id`: extracted from `data-entity-urn="urn:li:jobPosting:(\d+)"`.
  - `title`: extracted from `<h3 class="base-search-card__title">`.
  - `company`: extracted from `<h4 class="base-search-card__subtitle">`.
  - `location`: extracted from `<span class="job-search-card__location">`.
  - `postedDate`: extracted from `<time datetime="...">`.
  - `url`: `https://www.linkedin.com/jobs/view/${id}`.

---

### 3. Kalibrr Indonesia (`kalibrr`)
- **Portal Engine:** Public REST API.
- **Endpoint:** `GET https://www.kalibrr.com/api/job_board/search`
- **Authentication:** Public / None required.
- **Headers:** `User-Agent: Mozilla/5.0 ...`, `Accept: application/json`.
- **Query Parameters:**
  - `k`: Position query
  - `limit`: `30`
- **Work Type Extraction:**
  - Evaluates `is_work_from_home` (boolean) -> `Remote`
  - Evaluates `is_hybrid` (boolean) -> `Hybrid`
  - Otherwise -> `On-site`
- **Entity Mapping:**
  - `id`: `String(data.id)`
  - `title`: `data.name`
  - `company`: `data.company_name || data.company_info.name || data.company.name`
  - `location`: `google_location.address_components.city + ", " + country`
  - `salary`: Formatted string from `base_salary`, `maximum_salary`, `salary_currency`
  - `url`: `https://www.kalibrr.com/c/${company_info.code}/jobs/${id}/${slug}`
  - `postedDate`: `data.activation_date || data.created_at`
  - `descriptionSnippet`: Stripped text from `data.description`

---

### 4. Glints Indonesia (`glints`)
- **Portal Engine:** Public REST with Headless Playwright Fallback.
- **Direct REST Endpoint:** `GET https://glints.com/api/jobs`
  - Query parameters: `keyword`, `country=ID`, `pageSize=30`, `workArrangementOptions=REMOTE|HYBRID|ONSITE`.
  - Cloudflare Behavior: Direct `fetch()` triggers HTTP 403 firewall challenge.
- **Playwright Fallback Engine:**
  - URL: `https://glints.com/id/opportunities/jobs/explore?keyword={query}&country=ID&workArrangementOptions={type}`
  - Wait strategy: `waitUntil: "commit"` followed by `waitForSelector("script#__NEXT_DATA__")`.
  - Extraction: Reads Next.js hydrated state at `window.__NEXT_DATA__.props.pageProps.initialJobs.jobsInPage`.
- **Entity Mapping:**
  - `id`: `String(data.id)`
  - `title`: `data.title`
  - `company`: `data.company.name`
  - `location`: Parsed from `location.formattedName` and hierarchical parents.
  - `workType`: `workArrangementOption` (`"REMOTE"` -> `Remote`, `"HYBRID"` -> `Hybrid`, `"ONSITE"` -> `On-site`).
  - `salary`: Formatted from `salaries[0].minAmount` and `maxAmount` in `CurrencyCode` (IDR).
  - `url`: `https://glints.com/id/opportunities/jobs/${id}`
  - `postedDate`: `data.createdAt || data.updatedAt`

---

### 5. Dealls (`dealls`)
- **Portal Engine:** Direct Public REST API (Sejutacita).
- **Endpoint:** `GET https://api.sejutacita.id/v1/explore-job/job`
- **Authentication:** Public / CORS open.
- **Headers:** `User-Agent: Mozilla/5.0 ...`, `Accept: application/json`.
- **Query Parameters:**
  - `search`: Target keyword (e.g. `software engineer`)
  - `workplaceTypes[]`: Array of `remote`, `hybrid`, `onSite`
  - `limit`: `50` (Note: values > 50 return HTTP 400 Bad Request)
  - `page`: `1`
  - `sortParam`: `publishedAt`
  - `sortBy`: `desc` (newest first)
- **Entity Mapping:**
  - `id`: `String(data.id)`
  - `title`: `data.role`
  - `company`: `data.company.name`
  - `location`: `[data.city?.name, data.country?.name || "Indonesia"].filter(Boolean).join(", ")`
  - `workType`: `data.workplaceType` (`"remote"` -> `Remote`, `"hybrid"` -> `Hybrid`, `"onSite"` -> `On-site`)
  - `salary`: `data.salaryRange` formatted as `IDR {start} - {end}`
  - `url`: `https://dealls.com/loker/${data.slug}~${data.company?.slug}`
  - `postedDate`: `data.publishedAt` (ISO 8601)
  - `descriptionSnippet`: Extracted from required skills list

---

### 6. Tech in Asia Jobs (`techinasia`)
- **Portal Engine:** Public REST API v2.0.
- **Endpoint:** `GET https://www.techinasia.com/api/2.0/job-postings`
- **Authentication:** Public / None required.
- **Headers:** `User-Agent: Mozilla/5.0 ...`, `Accept: application/json`.
- **Query Parameters:**
  - `per_page`: `100`
  - `page`: `1`
  - `is_remote`: `1` (when querying remote)
  - `work_arrangement[]`: `remote`, `hybrid`, `on-site`
- **Client-Side Filtering:**
  - The API's `title` parameter requires exact full-string match (e.g. `title=software` yields 0, while `title=Software Engineer` yields matches).
  - Therefore, the scraper fetches up to 100 recent jobs and performs in-memory substring matching on `title` and `position.name`.
  - Verifies `city.country.alpha2 === "ID"` for Indonesia-specific roles.
- **Entity Mapping:**
  - `id`: `String(data.id)`
  - `title`: `data.title`
  - `company`: `data.company.name`
  - `location`: `[data.city?.name, data.city?.country?.name || "Indonesia"].filter(Boolean).join(", ")`
  - `workType`: `data.is_remote ? "Remote" : (data.work_arrangement === "hybrid" ? "Hybrid" : "On-site")`
  - `salary`: `data.salary_min` and `salary_max` formatted with currency symbol
  - `url`: `https://www.techinasia.com/jobs/${data.id}`
  - `postedDate`: `data.published_at`
  - `descriptionSnippet`: HTML-stripped excerpt from `data.description`

---

### 7. Indeed Indonesia (`indeed`)
- **Portal Engine:** Headless Playwright Chromium DOM Scraper.
- **Target URL:** `https://id.indeed.com/jobs?q={query}&l=Indonesia{fromage}`
- **Cloudflare Behavior:**
  - Direct HTTP `fetch()` triggers a Cloudflare managed JS challenge (`window.INDEED_CLOUDFLARE_STATIC_PAGE`, HTTP 403 on search, HTTP 401 on job detail).
  - Running via Playwright Chromium with real viewport (1280x800) and genuine Chrome User-Agent cleanly loads the SERP with HTTP 200 and ~32 job cards.
- **Query & Age Normalization:**
  - Indeed only accepts `fromage` values of `1`, `3`, `7`, or `14`. The scraper automatically clamps `maxAgeDays` to the nearest valid value.
  - Remote queries append `remote` to the keyword string and filter `loc: "Remote"`.
- **DOM Selectors:**
  - Cards: `.cardOutline, [data-jk]`
  - Job Key (`id`): `card.getAttribute("data-jk")`
  - Title: `card.querySelector("h2.jobTitle, .jobTitle, a[data-jk] span")`
  - Company: `card.querySelector("[data-testid=\"company-name\"], .companyName")`
  - Location: `card.querySelector("[data-testid=\"text-location\"], .companyLocation")`
  - Salary: `card.querySelector("[data-testid=\"attribute_snippet_testid\"], .salary-snippet-container")`
  - URL: `https://id.indeed.com/viewjob?jk=${jk}`

---

### 8. Glassdoor Indonesia (`glassdoor`)
- **Portal Engine:** Headless Playwright Chromium DOM Scraper.
- **Target URL:** `https://www.glassdoor.com/Job/jobs.htm?sc.keyword={query}&locT=C&locId=113` (`locId=113` corresponds to Indonesia).
  - When searching remote: appends `&remoteWorkType=1`.
- **Cloudflare Behavior:**
  - Direct HTTP requests to `glassdoor.com/Job/...` are rejected with HTTP 403.
  - Playwright Chromium bypasses the edge gate, loading full job cards with HTTP 200.
- **DOM Selectors:**
  - Cards: `[data-test="jobListing"]`
  - Job ID: `card.getAttribute("data-jobid")`
  - Title: `card.querySelector("a[class*=\"JobCard_jobTitle\"], [data-test=\"job-title\"]")`
  - Company: `card.querySelector("span[class*=\"EmployerProfile_compactEmployerName\"], [data-test=\"employer-name\"]")`
  - Location: `card.querySelector("div[class*=\"JobCard_location\"], [data-test=\"emp-location\"]")`
  - Salary Estimate: `card.querySelector("div[class*=\"JobCard_salaryEstimate\"], [data-test=\"detailSalary\"]")`
  - URL: Extracted from link href, resolved to absolute URL `https://www.glassdoor.com...`.

---

## Inactive & Skipped Portals Analysis

During portal feasibility auditing, candidate services were probed and categorized:

| Portal | Probe Status | Failure Reason | Verdict |
|---|---|---|---|
| **Urbanhire** | Defunct | Cloudflare 1016 "Origin DNS error". Company permanently closed. | **SKIP** |
| **Jooble ID** | Key-gated | HTML scraping blocked by Cloudflare; official REST API requires registration key capped at 500 lifetime requests. | **SKIP** (low ROI) |
| **TopKarir** | 404 Not Found | Public search endpoints return 404 plain text; API domain defunct. | **SKIP** |
| **Karir.com** | Skipped | Heavy single-page application requiring complex session handshakes. | **SKIP** per preference |
| **Loker.id** | Skipped | Low volume of technical/software engineering listings. | **SKIP** per preference |
| **KarirHub** | Skipped | Government portal with non-public internal microservice endpoints. | **SKIP** per preference |
