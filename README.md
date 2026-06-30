# CricClubs Live Ticker

A streaming score ticker for **OBS / Streamlabs / PRISM**, driven by the
**CricClubs** scorecard API. Sibling of the CricHeroes `cric-ticker`, same
Classic (translucent white) look, but a different data source.

## How it works

CricClubs' public `www` site is behind a Cloudflare challenge, but the app's
data host is open:

- **API:** `https://core-prod-origin.cricclubs.com/core/scoreCard/getScoreCardSummary?v=4.0.536&clubId=&matchId=`
- **Auth:** an `x-content-token` header = RSA (PKCS#1 v1.5) encryption of
  `"core-<epoch_ms>"` under a public key from the CricClubs web app. The server
  decrypts it and checks the timestamp is fresh ("SEC001"). The proxy reproduces
  this token per request — pure-Python locally, pure-JS (BigInt) in the Worker.
- **CORS:** the API sends none, so the proxy adds it.

One JSON call returns: teams, scores/overs/wickets, toss, result, `isCompleted`,
top 3 batsmen + bowlers per team, and `currentBatsman`/`currentBowler`/
`currentInnings` (populate during live play).

### IDs
- **`clubId`** is fixed per league (e.g. Fidelity Cricket League = `1110094`).
- **`matchId`** is assigned only when live scoring starts (`0` before). The
  stable per-fixture id is `fixtureId`; find the live `matchId` in the app's
  **Fixture Details** screen.

```
index.html     Setup page — build the browser-source URL
ticker.html    The overlay (Classic theme; live bar + auto end-scorecard)
dev-server.py  Local test server + token-generating proxy (Python 3, no deps)
worker.js      Production proxy — Cloudflare Worker (pure-JS RSA token)
wrangler.toml  Worker config
```

## Test locally

```bash
python3 dev-server.py
# open http://localhost:8090/ticker.html?club=1110094&id=994&demo=1
```

## Deploy

1. **Proxy (Cloudflare Worker):** `wrangler login && wrangler deploy` →
   copy the URL, set it as `DEFAULT_API` at the top of `ticker.html`.
2. **Overlay (GitHub Pages):** push these files; enable Pages on `main`.
3. **Browser Source** (1920×1080, transparent):
   `…/ticker.html?club=<CLUB>&id=<MATCH>&provider=streamlabs`

## URL options

| Param      | Default    | Notes                                            |
|------------|------------|--------------------------------------------------|
| `club`     | `1110094`  | CricClubs club/league id                         |
| `id`       | `994`      | Match id (live scoring assigns it; `0` before)   |
| `provider` | off        | `streamlabs` / `prism` — compacts + fits names   |
| `refresh`  | `10`       | Seconds between updates (min 5)                  |
| `api`      | `DEFAULT_API` | Override the Worker URL                        |
| `demo`     | off        | `1` = green backdrop for local preview           |

## Status / TODO

- ✅ Token + proxy + completed-match **scorecard** verified against real data.
- 🔶 **Live bar** (striker/non-striker/current bowler, chase equation) is
  scaffolded from the field names but the live-only objects
  (`currentBatsman`/`currentRunner`/`currentBowler`) were `null` on the
  completed test match — to be confirmed/finalised against a live game.
- Logos: drop PNGs in `assets/team-logos/` (filename ≈ team name) and run the
  manifest generator (see the CricHeroes project's README) — falls back to
  initials.
