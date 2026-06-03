# Civil Communicator — Reverse Engineering Research Report

**Date:** 2026-06-02
**Scope:** Public-facing infrastructure, unofficial APIs, and integration points

---

## Executive Summary

Civil Communicator is a **no-code application built on the Knack platform**, wrapped in a Squarespace marketing site, with MoonClerk handling payments. There is **no custom backend API** — all data operations go through Knack's hosted API. The app has **no mobile apps** on Apple App Store or Google Play, and **no Chrome extension**.

The entire technical surface area is:

| Layer | Service | Role |
|---|---|---|
| Marketing site | **Squarespace** | `civilcommunicator.com` — static marketing pages |
| Support portal | **Squarespace** | `support.civilcommunicator.com` — help docs |
| Application | **Knack** | `communicator.knack.com/civil-communicator` — the actual app |
| Payments | **MoonClerk** | Subscription billing (handled externally) |
| Widgets | **ElfSight** | Embedded widgets on marketing pages |
| CDN | **cloud-database.co / Squarespace CDN** | Asset delivery |

---

## 1. Infrastructure Breakdown

### 1.1 Marketing Site — Squarespace
- **URL:** `https://www.civilcommunicator.com`
- **Server:** `Squarespace` (HTTP header)
- **Site ID:** `5581cd88e4b04787af42a511` (embedded in all Squarespace CDN URLs)
- **Squarespace backend:** `https://civilcommunicator.squarespace.com`
- **CDN:** `images.squarespace-cdn.com`, `static1.squarespace.com`, `definitions.sqspcdn.com`
- **Fonts:** Google Fonts (Open Sans, Montserrat), Adobe TypeKit
- **Template:** Brine (ID `52a74dafe4b073a80cd253c5`, version 7)

### 1.2 Support Portal — Squarespace
- **URL:** `https://www.support.civilcommunicator.com`
- **Site ID:** `60579d9c3909d31da1dd1b72` (different Squarespace site)
- **Squarespace backend:** `octopus-puma-spzk.squarespace.com`
- Contains tutorials organized by feature: Communication, Calendar, Library, Expenses, Contacts, Analytics, Coaching, Journal, My Professionals, Emergency, Monitored Call/Video, etc.

### 1.3 The Actual Application — Knack
- **URL:** `https://communicator.knack.com/civil-communicator#welcome/`
- **App ID:** `58ed16ea1492ab54d00292f2`
- **Region:** `us-east`
- **Professional signup URL:** `https://communicator.knack.com/civil-communicator#new-professional-sign-up-form`
- **Manifest:** Minimal PWA manifest (`{"display": "standalone"}`)
- **JS Bundle:** `https://cdn1.cloud-database.co/namespace/scripts/k_04269443069477f5315104a63bec128cc74fb2a5.js` (1.3MB gzipped, 5.8MB decompressed)
- **Client SHA:** `04269443069477f5315104a63bec128cc74fb2a5`

### 1.4 Payments — MoonClerk
- **Terms URL:** `https://www.moonclerk.com/terms-of-service/`
- **Hosting:** Netlify Edge + Cloudflare
- All credit/debit card processing is external to the Knack app

### 1.5 Legal Entity
- **Company:** Data Engineering, LLC ("DE")
- Mentioned in Terms of Service and Privacy Statement

---

## 2. Knack API — The Core Attack Surface

### 2.1 API Base URL Construction

The API URL is dynamically constructed in the client-side JavaScript:

```javascript
// From app shell inline JS:
api_domain = 'knack.com';
api_subdomain = 'us-api';
region = 'us-east';
app_id = '58ed16ea1492ab54d00292f2';
socket_url = 'https://sockets.knack.com';

// The API URL getter (dynamically computed):
this.api_url = `https://us-api.knack.com`
this.api = `https://us-api.knack.com/v1/applications/58ed16ea1492ab54d00292f2`
this.api_dev = `https://us-api.knack.com/v1`
```

**Multiple API subdomains** are supported for load balancing:
```
https://us-api.knack.com
https://us-api1.knack.com  (when use_multiple_api_subdomains is enabled)
```

### 2.2 Authentication

Authentication uses **custom headers** + **Bearer tokens**:

```
X-Knack-Application-Id: 58ed16ea1492ab54d00292f2
X-Knack-REST-API-Key: renderer-session    (for authenticated user sessions)
Authorization: Bearer <jwt_token>
knack-client-timezone: <timezone>
x-knack-new-builder: true
```

**Token lifecycle:**
- Refresh tokens stored in `localStorage` as `refreshToken-58ed16ea1492ab54d00292f2`
- Token verification endpoint: `{api}/token/verify`
- Session endpoint: `{api_dev}/session`
- Remember-me stored as cookie: `58ed16ea1492ab54d00292f2-remember-me`

**Auth endpoints discovered:**
```
POST   {api_dev}/session                          — Create session (login)
GET    {api}/token/verify                          — Verify token
POST   {api_dev}/user/password/reset/{token}       — Reset password
POST   {api_dev}/user/password/reset/confirm/{token} — Confirm password reset
GET    {api}/auth/{provider}/return                — OAuth callback
GET    {api}/auth/{provider}                       — OAuth initiation (SSO via Active Directory/LDAP)
```

### 2.3 Complete Endpoint Catalog

Extracted from the 5.8MB decompressed JavaScript bundle:

#### Core Resources
```
# Objects (data model metadata)
GET    {api_dev}/objects
GET    {api_dev}/objects/{object_key}
GET    {api_dev}/objects/{object_key}/fields
GET    {api_dev}/objects/{object_key}/tasks
GET    {api_dev}/objects/{object_key}/identifiers
PUT    {api_dev}/objects/{object_key}
PUT    {api_dev}/objects/{object_key}/fields/{field_id}

# Scenes (app pages/views)
GET    {api_dev}/scenes
GET    {api_dev}/scenes/{scene_key}/views
PUT    {api_dev}/scenes/{scene_key}

# Views
GET    {api_dev}/scenes/{scene_key}/views/{view_key}/records
POST   {api_dev}/scenes/{scene_key}/views/{view_key}/records
GET    {api_dev}/scenes/{scene_key}/views/{view_key}/records/{record_id}
PUT    {api_dev}/scenes/{scene_key}/views/{view_key}/records/{record_id}
DELETE {api_dev}/scenes/{scene_key}/views/{view_key}/records/{record_id}

# Objects-level records (alternative to views)
GET    {api_dev}/objects/{object_key}/records
POST   {api_dev}/objects/{object_key}/records
GET    {api_dev}/objects/{object_key}/records/{record_id}
PUT    {api_dev}/objects/{object_key}/records/{record_id}
DELETE {api_dev}/objects/{object_key}/records/{record_id}

# Records (standalone)
GET    {api_dev}/records/{record_id}
POST   {api_dev}/records/
PUT    {api_dev}/records/{record_id}

# Connections (relationships)
GET    {api_dev}/scenes/{scene_key}/views/{view_key}/connections/{input_id}
GET    {api_dev}/scenes/{scene_key}/views/{view_key}/connections/{input_id}/count
GET    {api}/connections/{object_key}

# Dashboard (admin-only)
GET    {loader_api}/dashboard/schemas
```

#### User Management
```
POST   {api_dev}/session                           — Login
POST   {api_dev}/user/password/reset/{token}        — Password reset
POST   {api_dev}/user/password/reset/confirm/{token} — Confirm reset
GET    {api_dev}/scenes/{scene_key}/views/{view_key}/records/profiles/{view_key} — User registration
```

#### File/Asset Management
```
GET    {api}/scene/{scene_key}/view/{view_key}/field/{field_key}/assets/{asset_id}/signed-url
GET    {api_url}/v2/applications/{app_id}/asset/{asset_id}/download/
```

#### Connections & Identifiers
```
POST   {api}/objects/{object_key}/identifiers       — Resolve identifiers
```

#### Payment Integration (Stripe)
```
GET    {api}/stripe/{processor_key}/stripe_customer/{scene_key}/{view_key}/{user_id}/retrieve
GET    {api}/stripe/{processor_key}/retrieve_customer
POST   {api}/stripe/charge_customer
GET    {api}/stripe
POST   {api}/stripe/create_customer
PUT    {api}/stripe/update_customer
GET    {api}/stripe/payment-processor-key/{key}/user/{user_id}/customer/{customer}/scenes/{scene_key}/views/{view_key}/remove_customer
```

#### Payment Integration (PayPal)
```
POST   {api}/paypal/checkout
POST   {api}/paypal/verify
```

#### Settings & Distributions
```
GET    {api_dev}/settings
PUT    {api_dev}/settings
GET    {api_dev}/distributions
```

### 2.4 WebSocket / Real-Time

```javascript
socket_url = 'https://sockets.knack.com'
// Uses easyXDM for cross-domain messaging to:
// {api_url}/api/xdc.html
```

### 2.5 S3 / Cloud Storage

```javascript
s3 = {
  domain: "s3.amazonaws.com",
  bucket: "assets.knackhq.com"
};
s3_secure = {
  domain: "s3.amazonaws.com",
  bucket: "cdn.cloud-database.co"
};
```

### 2.6 API Rate Limits (from Knack pricing)

| Plan | API Calls/Day |
|---|---|
| Starter | 1,000 |
| Pro | 5,000 |
| Corporate | 10,000 |
| Enterprise | Custom |

---

## 3. Domain & Subdomain Inventory

| Domain | Purpose | Status |
|---|---|---|
| `civilcommunicator.com` | Main domain (redirects to www) | ✅ Active |
| `www.civilcommunicator.com` | Marketing site (Squarespace) | ✅ Active |
| `civilcommunicator.squarespace.com` | Squarespace backend | ✅ Active |
| `support.civilcommunicator.com` | Support portal redirect | ✅ → www.support |
| `www.support.civilcommunicator.com` | Support portal (Squarespace) | ✅ Active |
| `communicator.knack.com` | **The actual application** | ✅ Active |
| `app.civilcommunicator.com` | App subdomain | ❌ DNS error |
| `api.civilcommunicator.com` | API subdomain | ❌ DNS error |
| `us-api.knack.com` | Knack API server | ✅ Active |
| `sockets.knack.com` | Knack WebSocket server | ✅ Active |
| `cdn1.cloud-database.co` | Knack CDN | ✅ Active |
| `cdn.cloud-database.co` | Knack assets CDN | ✅ Active |
| `docs.knack.com` | Knack developer docs | ✅ Active |
| `www.knack.com` | Knack marketing (WordPress) | ✅ Active |
| `knackhq.com` | Knack domain (SSL errors from this location) | ⚠️ SSL issue |
| `www.moonclerk.com` | Payment processor | ✅ Active |
| `octopus-puma-spzk.squarespace.com` | Support site Squarespace backend | ✅ Active |

---

## 4. Hidden Endpoint Discovery Results

| Endpoint | Status | Notes |
|---|---|---|
| `/health` | 404 | Not available |
| `/status` | 404 | Not available |
| `/robots.txt` | ✅ Found | Squarespace standard, blocks `/api/`, `/config`, `/account/` |
| `/sitemap.xml` | ✅ Found | Lists all marketing pages |
| `/.well-known/security.txt` | ✅ Found | Points to Squarespace vulnerability reporting |
| `/api/` | Blocked by robots.txt | Squarespace internal API, not app API |
| `/graphql` | 404 | Not used |
| `/api/v1` | 404 | Not used |
| `/login` | 404 | App is on `communicator.knack.com` |
| `/manifest.json` | ✅ Found (on knack app) | Minimal PWA config |

### Robots.txt Content
```
# Squarespace Robots Txt
User-agent: *
Disallow: /config
Disallow: /search
Disallow: /account$
Disallow: /account/
Disallow: /commerce/digital-download/
Disallow: /api/
Allow: /api/ui-extensions/
Disallow: /static/
...
Sitemap: https://www.civilcommunicator.com/sitemap.xml
```

### Security.txt
```
Contact: https://www.squarespace.com/vulnerability-reporting
Policy: https://www.squarespace.com/vulnerability-reporting
```

---

## 5. Third-Party Integrations

| Service | Purpose | Evidence |
|---|---|---|
| **Squarespace** | Marketing site hosting + support portal | Server headers, CDN URLs |
| **Knack** | Application platform + database + API | App URL, inline JS config |
| **MoonClerk** | Payment processing (credit/debit cards) | Privacy statement, terms |
| **Stripe** | In-app payments (via Knack integration) | JS bundle payment endpoints |
| **PayPal** | In-app payments (via Knack integration) | JS bundle payment endpoints |
| **Google reCAPTCHA** | Bot protection on forms | `https://www.google.com/recaptcha/api.js` |
| **Google Maps** | Map rendering in app | `https://maps.googleapis.com/maps/api/js` |
| **MapLibre** | Alternative map library | `https://maplibre.org/` |
| **Google Fonts** | Open Sans, Montserrat | Link tags in HTML |
| **Adobe TypeKit** | Custom fonts | Script tags |
| **ElfSight** | Embedded widgets | `apps.elfsight.com/p/platform.js` |
| **Highcharts** | Charting/Analytics | `https://export.highcharts.com/` |
| **LogRocket** | Session replay (non-HIPAA only) | JS bundle reference |
| **Segment** | Analytics (dashboard mode) | JS bundle reference |
| **HubSpot** | Marketing analytics (on knack.com) | WordPress plugin |
| **Google Tag Manager** | Analytics (on knack.com) | JS snippet |
| **ClickCease** | Click fraud protection | Script on knack.com |

---

## 6. Mobile Apps

**No mobile applications found:**

- ❌ **Apple App Store:** No app found under "Civil Communicator", "Civilized Apps", or "Data Engineering LLC"
- ❌ **Google Play Store:** No app found under `com.civilcommunicator` or `com.civilizedapps.civilcommunicator`
- ❌ **Chrome Web Store:** No extension found

The application is a **web-only SPA** (Single Page Application) hosted on Knack. The PWA manifest (`{"display": "standalone"}`) suggests it could be installed as a PWA on mobile browsers, but there are no native app wrappers.

---

## 7. Security & Compliance

From the TOS, Privacy Statement, and Knack security docs:

- **Encryption:** AES-256 at rest, SHA-256 + TLS 1.2+ in transit
- **Compliance:** HIPAA compliant, SOC 3, ISO 27001
- **Infrastructure:** AWS (multiple regions), 99.9% uptime SLA
- **Backups:** Daily immutable snapshots, 28-day retention
- **Auth:** Password + 2FA + SSO (Active Directory/LDAP)
- **IP restrictions:** Optional per-app
- **Inactivity timeout:** 15 minutes (HIPAA mode)

---

## 8. Application Data Model (Inferred)

Based on the Knack scenes/views structure and feature descriptions, the app likely contains these objects:

| Object | Purpose |
|---|---|
| `users` | Subscribers (parents), professionals |
| `conversations` | Monitored communication threads |
| `messages` | Individual messages within conversations |
| `calendar_events` | Shared calendar entries |
| `library_items` | Shared documents (court orders, medical records) |
| `expenses` | Expense reports and reimbursements |
| `contacts` | Shared contacts (doctors, emergency contacts) |
| `journal_entries` | Private notes per conversation |
| `review_actions` | Moderator review decisions (approve/reject/revise) |
| `analytics_data` | Communication statistics |
| `professionals` | Attorneys, therapists, parenting coordinators |
| `credits` | Subscription credits for monitored calls |
| `calls` | Monitored call/video records |
| `coaching_sessions` | Communication coaching records |

---

## 9. Integration Attack Surface Summary

### 9.1 Most Valuable Entry Points

1. **Knack REST API** (`https://us-api.knack.com/v1/applications/58ed16ea1492ab54d00292f2`)
   - Full CRUD access to all app data with valid API key + session
   - API key format: `X-Knack-Application-Id` + `X-Knack-REST-API-Key`
   - The app ID `58ed16ea1492ab54d00292f2` is publicly exposed

2. **Knack WebSockets** (`https://sockets.knack.com`)
   - Real-time data sync via easyXDM cross-domain sockets

3. **Knack OAuth** (`{api}/auth/{provider}`)
   - Supports SSO via Active Directory/LDAP
   - OAuth callback handlers exposed

4. **File Asset Downloads** (`{api_url}/v2/applications/{app_id}/asset/{asset_id}/download/`)
   - Signed URL generation for file downloads
   - Files stored in S3 (`assets.knackhq.com` bucket)

5. **Payment Endpoints** (Stripe + PayPal via Knack)
   - Stripe customer management and charging
   - PayPal checkout and verification

### 9.2 Known Knack Public API Documentation

Knack publishes its API at `https://docs.knack.com`. Key pages:
- Authentication docs at `https://docs.knack.com/docs/authentication`
- API reference index at `https://docs.knack.com/llms.txt` (large file, AI-formatted)
- All endpoints follow the pattern: `https://{region}-api.knack.com/v1/applications/{app_id}/{resource}`

### 9.3 Squarespace Internal API

The marketing site uses Squarespace's internal API (`Disallow: /api/` in robots.txt), which is a separate surface from the Knack app. Squarespace exposes:
- `/api/ui-extensions/` (allowed by robots.txt)
- Form submission endpoints (reCAPTCHA-protected)
- Commerce/digital download endpoints (blocked)

---

## 10. Methodology

1. **Raw HTML extraction** via `curl` (not browser-rendered, to capture all inline scripts)
2. **URL extraction** using regex on full page source
3. **JS bundle analysis** — downloaded, gunzipped (1.3MB → 5.8MB), searched with `grep`/`strings`
4. **Knack API endpoint reconstruction** from dynamic URL building patterns in the bundle
5. **Subdomain discovery** through inline JS config, robots.txt, and sitemap.xml
6. **Mobile app store searches** via Apple iTunes Search API and Google Play
7. **Hidden endpoint probing** (health, status, .well-known, robots.txt, sitemap.xml)
8. **Third-party service identification** from CDN domains, script sources, and privacy statements

---

## 11. Key Finding: No Custom API

Civil Communicator has **no proprietary API**. The entire application is a Knack no-code app. All data access, authentication, file storage, and real-time features are provided by Knack's platform. Any integration or automation would go through:

1. **Knack's public REST API** (documented at docs.knack.com)
2. **Knack webhooks** (outgoing, configurable within the app admin)
3. **Knack Flows** (built-in automation, 500+ SaaS integrations via Zapier/Make)
4. **Browser automation** against the Knack-rendered SPA
5. **Knack's Zapier/Make/Albato connectors** for third-party integrations

The app ID `58ed16ea1492ab54d00292f2` combined with a valid Knack REST API key provides full programmatic access to the entire application data model.
