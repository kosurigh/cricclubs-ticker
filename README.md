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

The proxy exposes three endpoints (same token/CORS treatment on each):

| Proxy route                      | CricClubs API                    | Used for                              |
|----------------------------------|----------------------------------|---------------------------------------|
| `/<club>/<match>`                | `scoreCard/getScoreCardSummary`  | teams, scores, toss, result, chase    |
| `/<club>/<match>/balls`          | `scoreCard/getBallByBall`        | live bar: current pair + bowler figures (`latestBatting`/`latestBowling`) and per-over `oversMap.OverN.balls[]` → this-over chips |
| `/<club>/schedule/<seriesId>`    | `match/getSchedule`              | resolving `fixture=` → live `matchId` |

Ball-feed notes: `balls[]` is newest-first (sort by `createdAt`); entries with
`ballType:"Auto Comment Ball"` are commentary noise, not deliveries;
`runsDisplay` is the chip text (`.` `1` `4` `6` `W` `1wd` `1nb`).
`innings1Balls.teamName` says who actually batted first (don't assume team1).

### IDs
- **`clubId`** is fixed per league (e.g. Fidelity Cricket League = `1110094`).
- **`matchId`** is assigned only when live scoring starts (`0` before), by a
  per-club counter — so it can't be known for sure in advance (two games run
  simultaneously each night; whichever starts scoring first takes the lower id).
- **`fixtureId`** is the stable per-fixture id from the schedule. Prefer
  `ticker.html?fixture=<id>&series=<seriesId>`: the overlay polls the schedule
  (every 30 s) until scoring assigns a matchId, then switches to it
  automatically — the browser source can be set up before the game.

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
| `fixture`  | off        | Fixture id — auto-resolves the match id when scoring starts (preferred) |
| `series`   | `18`       | Series id for `fixture` lookup (18 = Season 2026)|
| `id`       | `994`      | Match id (live scoring assigns it; `0` before)   |
| `provider` | off        | `streamlabs` / `prism` — compacts + fits names   |
| `refresh`  | `10`       | Seconds between updates (min 5)                  |
| `api`      | `DEFAULT_API` | Override the Worker URL                        |
| `demo`     | off        | `1` = green backdrop for local preview           |
| `view`     | off        | `live` = force the live bar on a completed match (debug) |

## Status / TODO

- ✅ Token + proxy + completed-match **scorecard** verified against real data.
- ✅ **Live bar** now driven by `getBallByBall`: current bowler with cumulative
  figures (`latestBowling` — the summary's `currentBowler` proved unreliable
  live) and **this-over ball chips** (`•`/runs/`W`/`1wd`/`1nb`, wicket red,
  4 teal, 6 navy). Falls back to the previous over while a new over has no
  deliveries yet, and to summary fields if the ball feed fails.
- 🔶 Striker (`▶`) still trusts the summary's `currentBatsman` when present;
  ball-feed fallback marks the over's `batsmanName`.
- Logos: drop PNGs in `assets/team-logos/` (filename ≈ team name) and run the
  manifest generator (see the CricHeroes project's README) — falls back to
  initials.
