/**
 * Cloudflare Worker — CricClubs ticker proxy (production).
 *
 * The browser overlay can't call the CricClubs API directly: the API requires
 * an `x-content-token` header (an RSA/PKCS#1-v1.5 encryption of "core-<now_ms>"
 * under a public key from the CricClubs web app) and sends no CORS header.
 * This Worker builds that token per request and adds CORS.
 *
 * Deploy:  wrangler deploy
 * Use:     GET /<clubId>/<matchId>     e.g. /1110094/994
 *          GET /?club=<clubId>&id=<matchId>
 */

const API = "https://core-prod-origin.cricclubs.com/core/scoreCard/getScoreCardSummary";
const APP_VERSION = "4.0.536";

// RSA public key (modulus + exponent) the CricClubs web app uses for the token.
const N = BigInt("0x8da248fae4d61cf4b75866c8418ba23505456ef0d76171a7d29334ae805570532770eedd833da65c7b0c64928dc6d91ff4392f2cedc79257fa78ce58ed80236d96ce40e934f6121b28c61aa1e8f1d146e2b882f84f9fc818b415e3407923d155a4afd5683dd12ddcd408af4324066c0082de58913095d4464f3809ec2d29d0af");
const E = 65537n;
const K = 128; // 1024-bit modulus = 128 bytes

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

function modPow(base, exp, mod) {
  let r = 1n; base %= mod;
  while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; exp >>= 1n; base = (base * base) % mod; }
  return r;
}

function contentToken() {
  const msg = new TextEncoder().encode("core-" + Date.now());
  const psLen = K - 3 - msg.length;
  const ps = new Uint8Array(psLen);
  crypto.getRandomValues(ps);
  for (let i = 0; i < psLen; i++) {
    while (ps[i] === 0) { const b = new Uint8Array(1); crypto.getRandomValues(b); ps[i] = b[0]; }
  }
  const em = new Uint8Array(K);
  em[0] = 0; em[1] = 2; em.set(ps, 2); em[2 + psLen] = 0; em.set(msg, 3 + psLen);
  let m = 0n;
  for (const byte of em) m = (m << 8n) | BigInt(byte);
  let c = modPow(m, E, N);
  const out = new Uint8Array(K);
  for (let i = K - 1; i >= 0; i--) { out[i] = Number(c & 0xffn); c >>= 8n; }
  let bin = ""; for (const b of out) bin += String.fromCharCode(b);
  return btoa(bin);
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    const club = url.searchParams.get("club") || parts[0];
    const match = url.searchParams.get("id") || parts[1];
    if (!/^\d+$/.test(club || "") || !/^\d+$/.test(match || "")) {
      return json({ error: "use /<clubId>/<matchId>" }, 400);
    }

    const target = `${API}?v=${APP_VERSION}&clubId=${club}&matchId=${match}`;
    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          "x-content-token": contentToken(),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://app.cricclubs.com/",
          "Accept": "application/json, text/plain, */*",
        },
      });
    } catch (e) {
      return json({ error: String(e) }, 502);
    }
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", ...CORS },
  });
}
