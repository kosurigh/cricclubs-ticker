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
| `/<club>/<match>/balls`          | `scoreCard/getBallByBall`        | everything else — live bar **and** all three splash cards |
| `/<club>/schedule/<seriesId>`    | `match/getSchedule`              | resolving `fixture=` → live `matchId` |

Ball-feed notes: `balls[]` is newest-first (sort by `createdAt`); entries with
`ballType:"Auto Comment Ball"` are commentary noise, not deliveries;
`runsDisplay` is the chip text (`.` `1` `4` `6` `W` `1wd` `1nb`).
`innings1Balls.teamName` says who actually batted first (don't assume team1).

### Why the ball feed carries the cards

`getScoreCardSummary` only returns the **top 3** batters and bowlers, which isn't
enough for a full-innings card. `getBallByBall` is the only full-detail source
CricClubs exposes, so `innStats()` in `ticker.html` rebuilds an innings from it:

- **Batting order** — order of first appearance of `strikerName` / `nonStrikerName`.
- **Batter lines** — accumulated per delivery (wides don't count as a ball faced;
  no-balls give 1 to extras; byes/leg-byes aren't credited to the bat). For a
  **dismissed** batter the OUT commentary is authoritative and overrides the
  accumulation — it carries runs, balls, 4s, 6s and SR exactly:
  `<strong>Rameshkumar Chellamuthu c Shaikh M b Nandhakumar M 8</strong> (5balls 0 fours, 1 sixes) SR 160.00`.
  Commentary names are full (`Viswa Chaitanya Kallagunta`) while the feed uses the
  short form (`Viswa Chaitanya K`), so the batter is matched by shortening the
  leading words until one hits a batter we've already seen; the rest is the dismissal.
- **Bowling figures** — each `oversMap.OverN` entry carries its bowler's *running*
  `bowlerBalls`/`bowlerMaidens`/`bowlerRuns`/`bowlerWickets`, so the last entry per
  bowler is their final line. Overs = `balls/6`, economy = `runs*6/balls`.
- **Extras** — `innings.runs` minus the sum of batter runs (exact); the
  `2wd 1nb` breakdown is counted from `ballType`.
- **Worm** — each over's `rcb` (`"70/7"`) is the authoritative cumulative anchor;
  wicket markers are placed at `over + ball/6` using the running ball total.

Verified against match `994`: batting 68 + 2 extras = 70/7, bowling 12.1 ov /
70 runs / 7 wkts, and the derived not-out pair matches `latestBatting`.

**Not available:** CricClubs exposes no squad list on these endpoints, so the
full card has no "yet to bat" row (the CricHeroes sibling shows one).

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
ticker.html    The overlay (live bar + auto splash cards + end-of-match scorecard)
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
| `theme`    | `classic`  | `classic` (white bar) or `dark` (translucent)    |
| `bg`       | —          | DARK theme only: 6/8-digit hex **without** `#` (a `#` in a URL starts the fragment); the score box is auto-tinted |
| `autocard` | on         | `0` disables the wicket / end-of-over splash     |
| `cardsecs` | `30`       | How long a splash stays up (min 5)               |
| `refresh`  | `10`       | Seconds between updates (min 5)                  |
| `api`      | `DEFAULT_API` | Override the Worker URL                        |
| `demo`     | off        | `1` = green backdrop for local preview           |
| `view`     | off        | `live` = force the live bar on a completed match (debug) |
| `card`     | off        | `full` / `summary` / `worm` — freeze one card for styling checks |

## Auto scorecard (wicket / end of over)

Every wicket and every completed over raises a **splash card above the live bar**
— the bar stays visible the whole time — for `cardsecs` seconds, banner-labelled
`Wicket!` or `End of over N`:

- **1st innings:** the full-innings card for the whole duration.
- **2nd innings:** full-innings card 10 s → both-teams summary 5 s → **worm
  graph** for whatever is left. At `cardsecs=15` there's no time left, so the
  worm is skipped; at `cardsecs=10` only the full card shows.

Triggers come from the ball feed (exact wicket count and completed-over count),
falling back to the summary's wickets/overs if the ball feed fails, and reset on
an innings change so the first poll of an innings only sets a baseline.

## Status

- ✅ Token + proxy + completed-match **scorecard** verified against real data.
- ✅ **Live bar** driven by `getBallByBall`. The bowler's figures come from the
  current over's running `bowlerBalls/Runs/Wickets`, keyed on that over's
  `bowlerName`, so they advance **every ball** and always belong to the bowler
  actually bowling. (`latestBowling` has only two slots — `bowler1`/`bowler2` —
  so once a third bowler is on it returns someone who isn't bowling, and the
  bar froze on their stale figures. It's now only a fallback.) Batter runs come
  from the same ball-derived totals, so the bar and the splash cards can never
  disagree. **This-over ball chips** (`•`/runs/`W`/`1wd`/`1nb`, wicket red,
  4 teal, 6 navy) show the whole over, extras included, falling back to the
  previous over while a new one has no deliveries yet.
- ✅ **Auto splash** (full innings / summary / worm) verified by replaying match
  `994` one delivery at a time against the overlay.
- ✅ **Classic + dark themes**, `?bg=` recolouring, `?card=` preview.
- 🔶 Striker (`▶`) still trusts the summary's `currentBatsman` when present;
  ball-feed fallback marks the over's `batsmanName`.
- Logos: drop PNGs in `assets/team-logos/` (filename ≈ team name) and run the
  manifest generator (see the CricHeroes project's README) — falls back to
  initials. Team logos also appear on the scorecard rows.
- Divisions: the strip above the score pill shows the league name, plus
  `• Division N` when an `assets/tournaments/data/divisions.json` is present
  (`{"<clubId>":{"byName":{"<normalised team name>":N}}}`). Absent file = no
  division, which is the normal case.
