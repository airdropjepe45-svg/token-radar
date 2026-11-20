[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/airdropjepe45-svg/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/airdropjepe45-svg/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

A radar for the protocols whose token does not exist yet: it reads a sealed
snapshot of the protocol universe (DefiLlama, 2026-11-14), scores every
pre-token protocol with a model built only from the snapshot's own figures
(TVL, seven-day growth, how long it has run with no token), and ranks them by
an implied value — what a token would be worth if the protocol's record stayed
as it is. Protocols whose token already trades are set aside in their own Live
view and never mixed into the ranked board.

Every row carries a concrete farm plan: what to do, what it costs and how long
it takes, derived from the protocol's own category, chains, TVL and age.

## The model

    implied = TVL x base_multiple x growth_multiplier x maturity_multiplier

- `base_multiple` (0.30) scales TVL into a starting value, with diminishing
  returns: very large TVLs are scaled down by
  `clamp((TVL / $100M)^-0.1, 0.5, 1.15)`, so size alone cannot win the board.
- `growth_multiplier` follows the protocol's seven-day change, clamped to
  −80%/+500% and answered on a log scale when positive
  (`1 + 0.35 x ln(1 + growth/25)`), so a +4,448% week counts for more than a
  +120% week but not 37 times more; falling protocols lose value linearly
  down to a 0.6x floor.
- `maturity_multiplier` rewards protocols that have run longer with no token:
  `0.55 + 0.45 x (1 - exp(-age/365))`, steep in the first year and saturating
  after it. Unknown age counts as 365 days.

No protocol name is ever special-cased: the same function scores every row.
The board covers all 40 protocols on the snapshot's watchlist, plus 186 early
pre-token protocols below the watchlist floor — 226 rows in total, strongest
first (rank 1: Steakhouse Financial, implied $526,914,682).

## Verified

Two runs of `main.ts` on the sealed snapshot write byte-identical `board.json`
and `dossier.json`. The board passes every gate check: ranks exactly 1..226,
implied value never rises with rank, all 40 watchlist slugs covered, every row
carries 7–9 farm steps of 147–307 characters each.

## Run it

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

`main.ts` (Node 22, standard library only) writes `board.json`, the
dashboard's `data.js`, copies `dashboard/` and `screenshots/`, and writes
`dossier.json` with the vendored make.fun library. The dashboard is a static
page — sortable board, filters, a detail view per protocol, the model
explained — with no network at all.

## Files

- `main.ts` — reads the snapshot, writes the board, data and dossier.
- `lib/model.ts` — the model, the board builder and the farm plans.
- `dashboard/` — `index.html`, `app.css`, `app.js` (flat, offline).
- `screenshots/` — the board, a detail view and a filtered view.
- `vendor/makefun-board.ts` — the make.fun dossier library, unchanged.
