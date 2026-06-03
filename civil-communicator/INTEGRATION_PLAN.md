# Civil Communicator Integration Plan

**Date:** 2026-06-02
**Status:** Research phase — integration points identified

---

## Summary

Civil Communicator is a **Knack no-code app** (not custom-built). This is huge for integration:
- **API is standardized** — all endpoints follow Knack's documented patterns
- **App ID is public:** `58ed16ea1492ab54d00292f2`
- **API base:** `https://us-api.knack.com/v1/applications/58ed16ea1492ab54d00292f2`
- **Auth:** `X-Knack-Application-Id` + `X-Knack-REST-API-Key` + Bearer JWT
- **WebSocket:** `https://sockets.knack.com` (real-time sync)
- **Rate limit:** 1,000-10,000 calls/day depending on plan

## Integration Approaches (ranked by feasibility)

### 1. Knack REST API (Best)
- **What:** Direct API access with valid credentials
- **Pros:** Full CRUD, well-documented, reliable
- **Cons:** Requires valid user session (login via API first)
- **Use case:** Dashboard, analytics, message monitoring, data export
- **Risk:** Medium — could violate ToS if automated without permission

### 2. Browser Automation (Puppeteer/Playwright)
- **What:** Automate the Knack-rendered SPA
- **Pros:** No API key needed, can observe all user flows
- **Cons:** Fragile, slow, reCAPTCHA on login
- **Use case:** Monitoring, scraping public data, testing
- **Risk:** Low — simulates user behavior

### 3. Knack Webhooks (If accessible)
- **What:** Subscribe to data changes in real-time
- **Pros:** Push-based, efficient, real-time
- **Cons:** Requires admin access to configure
- **Use case:** Real-time alerts, sync to external systems
- **Risk:** N/A — requires account owner permission

### 4. Knack Flows / Zapier Integration
- **What:** Use built-in automation or Zapier connector
- **Pros:** No-code, official, reliable
- **Cons:** Limited customization, requires admin setup
- **Use case:** Simple triggers, notifications, data sync
- **Risk:** None — official integration

### 5. PWA Interception
- **What:** Intercept API calls from the installed PWA
- **Pros:** Captures all traffic, can modify responses
- **Cons:** Requires device access, MitM setup
- **Use case:** Research, debugging, security auditing
- **Risk:** High — requires device access, legal concerns

## Recommended Tool to Build

**Build a "Civil Communicator Dashboard" that:**
1. Authenticates via Knack API (user provides their own credentials)
2. Fetches conversations, messages, calendar, expenses
3. Provides analytics dashboard (message volume, response times, sentiment)
4. Offers data export (CSV, JSON) for legal compliance
5. Real-time notifications via WebSocket

**Tech stack:**
- Backend: Node.js/Express (or Python/FastAPI)
- Frontend: React/Vue dashboard
- Auth: User-provided Knack credentials (stored encrypted)
- Sync: REST polling + WebSocket for real-time

## What We Can Build Without Credentials

1. **Login flow interceptor** — capture API key during auth flow
2. **Public data scraper** — marketing site, pricing, feature list
3. **API explorer** — interactive Knack API tester for the app
4. **Documentation generator** — reverse-engineer the data model

## Legal & Ethical Considerations

- **ToS compliance:** Civil Communicator's ToS likely prohibits automated access
- **Data privacy:** HIPAA-compliant platform — any data handling must be secure
- **User consent:** Only integrate with explicit user permission
- **Rate limiting:** Respect Knack's 1K-10K daily call limits
- **No credential sharing:** Users must provide their own credentials

## Next Steps

1. [ ] Set up project structure in `civil-communicator/`
2. [ ] Create Knack API client wrapper
3. [ ] Build login flow to capture session tokens
4. [ ] Explore the data model (objects, scenes, views)
5. [ ] Build dashboard frontend
6. [ ] Add real-time sync via WebSocket
7. [ ] Document all findings and API responses

## Files

| File | Description |
|------|-------------|
| `RESEARCH.md` | Full reverse-engineering report (infrastructure, APIs, tech stack) |
| `UX_ANALYSIS.md` | Feature and UX analysis (user actions, data structure) |
| `API_DISCOVERY.md` | API endpoint testing results |
| `INTEGRATION_PLAN.md` | This file — approaches, recommendations, next steps |
