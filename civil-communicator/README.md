# Civil Communicator Integration Research

Reverse-engineering and integration research for [CivilCommunicator.com](https://CivilCommunicator.com).

## Key Finding

**Civil Communicator is a Knack no-code app** — not a custom-built platform. This means:
- All APIs are standardized Knack REST endpoints
- App ID is publicly exposed: `58ed16ea1492ab54d00292f2`
- API base: `https://us-api.knack.com/v1/applications/58ed16ea1492ab54d00292f2`
- Full CRUD access with valid session tokens
- WebSocket support for real-time sync

## Quick Links

- [Full Research Report](RESEARCH.md) — Infrastructure, API catalog, tech stack, security
- [Integration Plan](INTEGRATION_PLAN.md) — Approaches, recommendations, next steps
- [UX Analysis](UX_ANALYSIS.md) — Features, user actions, data structure
- [API Discovery](API_DISCOVERY.md) — Endpoint testing results

## Infrastructure

| Layer | Service | Role |
|-------|---------|------|
| Marketing | Squarespace | Static marketing pages |
| App | Knack | The actual application (SPA) |
| Payments | MoonClerk | Subscription billing |
| CDN | Cloudflare + cloud-database.co | Asset delivery |

## API Endpoints

```
Base: https://us-api.knack.com/v1/applications/58ed16ea1492ab54d00292f2

Auth:
  POST /v1/session                          — Login
  GET  /token/verify                         — Verify token

Data:
  GET    /objects/{key}/records              — List records
  POST   /objects/{key}/records              — Create record
  GET    /objects/{key}/records/{id}         — Get record
  PUT    /objects/{key}/records/{id}         — Update record
  DELETE /objects/{key}/records/{id}         — Delete record

Real-time:
  WSS    sockets.knack.com                   — WebSocket sync
```

## Files

```
civil-communicator/
├── README.md              — This file
├── RESEARCH.md            — Full reverse-engineering report
├── INTEGRATION_PLAN.md    — Integration approaches & recommendations
├── UX_ANALYSIS.md         — Feature & UX analysis
└── API_DISCOVERY.md       — API endpoint testing
```

## Legal

This research is for educational and integration purposes only. Any tool built should:
- Use user-provided credentials only
- Respect Terms of Service
- Comply with HIPAA/data privacy requirements
- Stay within rate limits
