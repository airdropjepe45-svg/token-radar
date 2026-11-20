// The token radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// pre-token protocol below the watchlist floor the early radar can carry: the early rows the radar
// exists to find. A protocol is pre-token when its index entry records no token (no market cap, no
// CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and shown as the
// market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures (TVL, seven-day change, age from
// listed_at, category, chains). No protocol name is ever special-cased: the same function scores
// every row.
//
//   base       = tvl_usd x BASE_MULTIPLE x tvlScale
//                tvlScale = clamp((tvl_usd / TVL_REF) ^ -TVL_EXPONENT, 0.5, 1.15)
//                (diminishing returns: a $8B protocol's TVL counts less per dollar than a $50M one's)
//   growth     = clamp(change_7d, -80, 500) per cent
//   growthMult = 1 + GROWTH_WEIGHT x ln(1 + growth / GROWTH_LOG_SCALE)   (growth >= 0)
//              = 1 + (growth / 100) x GROWTH_DOWN_WEIGHT                (growth < 0)
//                (asymmetric log response: a +4000% week still beats a +40% week, but not 100x over;
//                 a falling week is punished linearly, never below 0.6x)
//   maturity   = MATURITY_FLOOR + MATURITY_RANGE x (1 - exp(-age_days / MATURITY_DAYS))
//                (age_days unknown: UNKNOWN_AGE_DAYS; a saturating curve, steep early, flat late:
//                 surviving the first year matters far more than the fourth)
//   implied    = max(1, round(base x growthMult x maturity))
//
// Why radar-2 beats the house starter (radar-1): the starter's linear growth clamp threw away the
// difference between +120% and +4400% and punished a -70% week the same as a -60% one; its linear
// maturity gave a 3-year-old protocol twice the credit of a 6-month-old one for merely existing; and
// its flat 0.25x multiple let the biggest TVLs dominate by size alone. Radar-2 keeps the same three
// factors and the same row shape, but scores growth on a log scale, maturity on a saturating curve,
// and TVL with diminishing returns, so a fast-growing mid-size protocol can outrank a stagnant giant.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Divisor inside the log response to positive growth: ln(1 + growth / growth_log_scale). */
  growth_log_scale: number;
  /** Linear weight on negative growth, so a falling week is punished without collapsing the row. */
  growth_down_weight: number;
  /** TVL the diminishing-returns scale is anchored at, in USD. */
  tvl_ref_usd: number;
  /** Power of the diminishing-returns scale: (tvl_usd / tvl_ref_usd) ^ -tvl_exponent. */
  tvl_exponent: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.3,
  growth_weight: 0.35,
  growth_floor: -80,
  growth_cap: 500,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 365,
  unknown_age_days: 365,
  growth_log_scale: 25,
  growth_down_weight: 0.5,
  tvl_ref_usd: 100_000_000,
  tvl_exponent: 0.1,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 186;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The diminishing-returns scale on TVL: 1 at the reference TVL, smaller above it, larger below it,
 * clamped so the smallest protocols never more than 1.15x and the largest never below 0.5x.
 */
function tvlScale(tvlUsd: number, model: ModelConstants): number {
  const raw = Math.pow(Math.max(tvlUsd, 1) / model.tvl_ref_usd, -model.tvl_exponent);
  return Math.min(1.15, Math.max(0.5, raw));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  // Positive growth answers on a log scale (a +4000% week beats a +40% week, not 100x over);
  // negative growth is punished linearly, floored at 1 - 0.8 x growth_down_weight.
  const growthMult = growthPct >= 0
    ? 1 + model.growth_weight * Math.log1p(growthPct / model.growth_log_scale)
    : 1 + (growthPct / 100) * model.growth_down_weight;
  const ageForModel = age ?? model.unknown_age_days;
  // Saturating maturity: surviving the first year is most of the signal; the fourth adds almost nothing.
  const maturityMult = model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_days));
  const base = protocol.tvl_usd * model.base_multiple * tvlScale(protocol.tvl_usd, model);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 50_000_000) return 75;
  return 50;
}

/** A smaller follow-up amount, rounded to a neat $5 step and never below $10. */
function smallFor(capital: number): number {
  return Math.max(10, Math.round(capital / 2 / 5) * 5);
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 90) return 90;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, by how expensive that chain's gas usually is. */
function gasFor(chain: string): { tx: string; week: string } {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return { tx: 'about $6–$18 of gas', week: 'about $6–$18 of gas a week' };
  if (c.includes('bitcoin')) return { tx: 'about $1–$5 of network fees', week: 'about $1–$5 of network fees a week' };
  if (c.includes('solana') || c.includes('sui') || c.includes('aptos') || c.includes('movement')) {
    return { tx: 'about $0.01 of gas', week: 'about $0.05 of gas a week' };
  }
  if (
    c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('zksync') ||
    c.includes('scroll') || c.includes('linea') || c.includes('blast') || c.includes('mode') ||
    c.includes('mantle') || c.includes('berachain') || c.includes('monad') || c.includes('hyperliquid')
  ) {
    return { tx: 'about $0.05–$0.50 of gas', week: 'about $0.20–$1 of gas a week' };
  }
  return { tx: 'about $1–$3 of gas', week: 'about $1–$3 of gas a week' };
}

/**
 * A category's two moves: the position to open first, and the second qualifying action that proves
 * the wallet is a user, not a single deposit. Every template names the protocol, its chain and the
 * capital, so no two rows' plans read the same. Matching is by category words, never by name.
 */
function playbook(p: SnapshotProtocol, capital: number, chain: string): { primary: string; secondary: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = smallFor(capital);
  if (c.includes('uncollateralized lending') || c.includes('lending') || c.includes('cdp') || c.includes('collateral')) {
    return {
      primary: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the loan-to-value low.`,
      secondary: `Borrow about $${small} against the ${name} deposit, use it for one swap, then repay it within the week to show both sides of the market.`,
    };
  }
  if (c.includes('liquidity manager')) {
    return {
      primary: `Deposit $${capital} of USDC into a ${name} managed position on ${chain} and let it rebalance inside its range.`,
      secondary: `Check the ${name} position after its first rebalance and add $${small} only if the range still looks right.`,
    };
  }
  if (c.includes('dex')) {
    return {
      primary: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      secondary: `Swap $${small} through the ${name} pool on ${chain} once a week so the wallet shows trading activity as well as liquidity.`,
    };
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('farm') || c.includes('leveraged farm')) {
    return {
      primary: `Deposit $${capital} of USDC into a ${name} vault on ${chain} and leave it compounding.`,
      secondary: `Harvest or compound the ${name} vault rewards once they pass $${small} instead of letting them sit unclaimed.`,
    };
  }
  if (c.includes('bridge') || c.includes('cross chain') || c.includes('canonical bridge')) {
    return {
      primary: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
      secondary: `Bridge $${small} back through ${name} a few days later so the wallet shows a round trip, not a one-way transfer.`,
    };
  }
  if (c.includes('restak')) {
    return {
      primary: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
      secondary: `Claim the ${name} staking rewards once they pass $${small} and restake them instead of selling.`,
    };
  }
  if (c.includes('staking')) {
    return {
      primary: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
      secondary: `Add $${small} more to the ${name} stake after the first rewards land, so the position grows instead of sitting still.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) {
    return {
      primary: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedge, not a leveraged bet.`,
      secondary: `Close the ${name} hedge after a week and open a fresh small one, so the wallet shows repeated use rather than one trade.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      primary: `Fund $${capital} on ${name} on ${chain} and place one market position on an outcome you have actually researched.`,
      secondary: `Settle or claim the ${name} position once its market resolves, then place one more small position the following week.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      primary: `Mint $${capital} of the yield-bearing asset on ${name} on ${chain} and hold it in the farming wallet.`,
      secondary: `Check the ${name} yield accrual after two weeks and top the position up by $${small} if the yield is paying as described.`,
    };
  }
  if (c.includes('stable')) {
    return {
      primary: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`,
      secondary: `Swap $${small} of the ${name} stable asset for a yield-bearing version once, to show the wallet uses the peg rather than just parking it.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      primary: `Buy $${capital} of cover from ${name} on ${chain} for the position you already hold, and keep the policy active.`,
      secondary: `Extend the ${name} cover by $${small} before it lapses so the wallet shows a renewal, not a single purchase.`,
    };
  }
  if (c.includes('index')) {
    return {
      primary: `Buy $${capital} of the ${name} index token on ${chain} and hold the basket.`,
      secondary: `Check the ${name} index composition after its next rebalance and add $${small} if the basket still matches your view.`,
    };
  }
  if (c.includes('payment') || c.includes('card')) {
    return {
      primary: `Top up $${capital} on ${name} on ${chain} and spend a small part of it on a real purchase.`,
      secondary: `Make one more $${small} spend through ${name} the following week so the wallet shows repeat use, not a single top-up.`,
    };
  }
  if (c.includes('governance')) {
    return {
      primary: `Lock $${capital} of the governance asset through ${name} on ${chain} and vote in the current proposal.`,
      secondary: `Vote again in the next ${name} epoch and keep the lock open through at least one full voting cycle.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      primary: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares through the first allocation cycle.`,
      secondary: `Move $${small} of the ${name} deposit into a second vault run by a different curator to show the wallet compares allocations.`,
    };
  }
  if (c === 'chain') {
    return {
      primary: `Bridge $${capital} of USDC onto ${chain} through ${name}'s official bridge and use it in the chain's flagship app.`,
      secondary: `Stake $${small} of the ${chain} native asset through ${name} to show a second kind of activity on the chain.`,
    };
  }
  if (c.includes('btc')) {
    return {
      primary: `Mint $${capital} of the BTC-backed asset on ${name} on ${chain} and hold it in the farming wallet.`,
      secondary: `Redeem $${small} of the ${name} BTC asset once to prove the exit works, then mint it back.`,
    };
  }
  if (c.includes('otc')) {
    return {
      primary: `Request a quote on ${name} on ${chain} for a $${capital} trade and settle it only if the price matches the public market.`,
      secondary: `Settle one more $${small} trade on ${name} the following week to show repeat use of the desk.`,
    };
  }
  if (c.includes('cedefi')) {
    return {
      primary: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares through the first yield cycle.`,
      secondary: `Check the ${name} vault's reported yield after two weeks and add $${small} only if it matches the advertised rate.`,
    };
  }
  return {
    primary: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    secondary: `Swap $${small} through ${name} on ${chain} once a week so the wallet shows activity beyond the first deposit.`,
  };
}

/**
 * A protocol's farm plan: 8 steps, 9 when it runs on more than one chain, 10 at most when it is
 * also young enough to need a diligence check first. Every step names the protocol, its chain, its
 * capital tier or its hold window, so the plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const small = smallFor(capital);
  const hold = holdDaysFor(age);
  const book = playbook(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Open a fresh wallet just for farming ${p.name} on ${chain}; fund it with only the $${capital} you plan to use and store the seed phrase offline, never in a screenshot or a chat.`,
      cost: `${gas.tx} for the first transaction`,
      time: '10 minutes',
    },
    {
      text: book.primary,
      cost: `$${capital} of capital plus ${gas.tx}`,
      time: '15 minutes to set up',
    },
  ];
  if (age !== null && age < 180) {
    steps.push({
      text: `Before sizing up, read ${p.name}'s docs and check whether its contracts are audited; a protocol listed only ${age} days ago deserves a smaller first position than an old one.`,
      cost: 'nothing but the reading',
      time: '20 minutes',
    });
  }
  steps.push(
    {
      text: book.secondary,
      cost: `about $${small} plus ${gas.tx}`,
      time: '10 minutes',
    },
  );
  if (p.chains.length > 1) {
    const second = p.chains[1]!;
    const gas2 = gasFor(second);
    const small2 = Math.max(10, Math.round(capital / 3 / 5) * 5);
    steps.push({
      text: `Repeat a smaller $${small2} position on ${second} through ${p.name} so the activity shows on a second chain; keep the same wallet so the history links.`,
      cost: `$${small2} of capital plus ${gas2.tx}`,
      time: '15 minutes to set up',
    });
  }
  steps.push(
    {
      text: `Come back once a week and do one more qualifying action on ${p.name} on ${chain} — a deposit, a swap or a vote — so the wallet stays active across snapshots instead of looking like a single deposit.`,
      cost: gas.week,
      time: '10 minutes a week',
    },
    {
      text: `Hold the ${p.name} position for at least ${hold} days so the activity is counted in more than one snapshot; withdrawing early is the most common way a farm is filtered out.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from its official site or docs and claim only from the link it publishes; never connect the wallet to a claim link from a DM or a search ad.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `When the ${hold}-day window ends, unwind the ${p.name} position in two parts — half first, then the rest a day later — and write the wallet, the dates and every transaction hash in a farm log.`,
      cost: `${gas.tx} for each of the two exits`,
      time: '15 minutes plus a day between exits',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
