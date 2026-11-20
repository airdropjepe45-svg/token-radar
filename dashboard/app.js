// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, a per-protocol detail panel
// and the model in plain words. Fully offline: no network calls, no outside
// files. Implied value and both multipliers are shown exactly as data.js
// carries them; the farm plan is derived in-page from each row's own
// category, chains, TVL and age.
(function () {
  'use strict';

  var app = document.getElementById('app');
  var DATA = window.RADAR;
  if (!DATA || !DATA.rows) {
    app.textContent = 'No radar data found. This page needs the data file written next to it.';
    app.setAttribute('aria-busy', 'false');
    return;
  }
  var M = DATA.model;
  var FLOOR = DATA.floor_usd;
  var WATCH = new Set(DATA.rows.filter(function (r) { return r.tvl_usd >= FLOOR; }).map(function (r) { return r.slug; }));

  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'pre-token', sort: 'rank', dir: 1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function fmtMult(v) { return (v === null || v === undefined || !isFinite(v)) ? 'n/a' : String(v); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  // ---- farm plan: original derivation from the row itself ----
  // Capital tiers follow TVL; gas follows the first chain (mainnet costs
  // more than an L2); the hold follows age, so a young protocol earns a
  // longer qualifying window. The action follows the category.
  function chainOf(p) { return (p.chains && p.chains.length) ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 2e9) return 300;
    if (p.tvl_usd >= 5e8) return 200;
    if (p.tvl_usd >= 1e8) return 120;
    return 60;
  }
  function gasFor(chain) { return (/ethereum/i.test(chain || '')) ? 12 : 3; }
  function holdFor(age) {
    if (age === null || age === undefined) return 60;
    if (age < 90) return 90;
    if (age < 365) return 60;
    if (age < 1095) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Lend $' + capital + ' of USDC into ' + name + ' on ' + chain + ', then borrow a small amount against it once so the loan book records you as a borrower too.';
    if (c.indexOf('dex') >= 0) return 'Open a $' + capital + ' position in the busiest ' + name + ' pool on ' + chain + ', in the price range the app itself suggests, and leave it earning fees.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' into the highest-TVL ' + name + ' vault on ' + chain + ' and keep the vault shares instead of rotating them.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC through ' + name + ' to ' + chain + ', then put the bridged funds to work in the destination app instead of bridging straight back.';
    if (c.indexOf('liquid') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + ' of the native asset through ' + name + ' on ' + chain + ' and keep the liquid receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Post $' + capital + ' of USDC as collateral on ' + name + ', open one small position, and close it the same week so the account shows real trading volume.';
    if (c.indexOf('prediction') >= 0) return 'Fund the account with $' + capital + ' and settle one prediction on ' + name + '; leave any winnings in the account rather than withdrawing at once.';
    if (c.indexOf('rwa') >= 0) return 'Buy $' + capital + ' of the tokenised yield asset ' + name + ' issues on ' + chain + ' and hold it through one distribution.';
    if (c.indexOf('stable') >= 0) return 'Mint $' + capital + ' of the stable asset against collateral on ' + name + ' and keep the position safely over-collateralised.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' for a position you actually hold, and keep the policy live.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Allocate $' + capital + ' to a curated vault on ' + name + ' on ' + chain + ' and keep the allocation through one rebalance.';
    return 'Put $' + capital + ' of USDC to work in the main ' + name + ' product on ' + chain + ' and leave the position open.';
  }
  function farmPlan(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var gas = gasFor(chain);
    var hold = holdFor(p.age_days);
    return {
      capital: capital, gas: gas, hold: hold, chain: chain,
      steps: [
        { text: 'Set up a wallet used only for this farm, write its seed phrase on paper, and fund it with the farming capital plus gas.', cost: 'about $' + gas + ' of gas for the funding transaction', time: '10 minutes' },
        { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
        { text: 'Come back twice a month and do one real action: add a little, claim, vote, or rebalance. Repeated use counts more than a single deposit.', cost: 'about $2 of gas per visit', time: '15 minutes per visit' },
        { text: 'Keep the position for at least ' + hold + ' days so the wallet is active across more than one snapshot.', cost: 'the $' + capital + ' stays locked in the position', time: hold + ' days' },
        { text: 'Once a month, open the points or rewards page ' + p.name + ' itself publishes and check this wallet is credited. Claim only from links on that page.', cost: 'free to check; never pay to claim', time: '10 minutes' },
        { text: 'Log the wallet, the dates and every transaction hash. When you unwind, withdraw in two steps a week apart and keep the log as proof if a snapshot is ever disputed.', cost: 'about $' + gas + ' of gas to exit', time: '10 minutes' }
      ]
    };
  }

  // ---- filtering & sorting ----
  function filteredPre() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !WATCH.has(r.slug)) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function filteredLive() {
    var q = state.q.trim().toLowerCase();
    return DATA.live.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function valOf(r, key) {
    if (key === 'rank') return r.rank === undefined ? 1e9 : r.rank;
    if (key === 'implied') return r.implied_value_usd;
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'growth') return (r.change_7d === null || r.change_7d === undefined) ? -Infinity : r.change_7d;
    if (key === 'age') return (r.age_days === null || r.age_days === undefined) ? -Infinity : r.age_days;
    if (key === 'mcap') return (r.mcap_usd === null || r.mcap_usd === undefined) ? -Infinity : r.mcap_usd;
    if (key === 'name') return (r.name || '').toLowerCase();
    return 0;
  }
  function sortList(list, key, dir) {
    return list.slice().sort(function (a, b) {
      var av = valOf(a, key), bv = valOf(b, key);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function defaultDir(key) { return (key === 'rank' || key === 'name') ? 1 : -1; }
  function setSort(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = defaultDir(key); }
    render();
  }

  // ---- hash deep-link ----
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var ps = new URLSearchParams(h);
    if (ps.get('q')) state.q = ps.get('q');
    if (ps.get('category')) state.category = ps.get('category');
    if (ps.get('chain')) state.chain = ps.get('chain');
    if (ps.get('tab') === 'live') { state.tab = 'live'; state.sort = 'mcap'; state.dir = -1; }
    if (ps.get('watch') === '1') state.watchOnly = true;
    if (ps.get('p')) state.selected = ps.get('p');
  }
  function writeHash() {
    var ps = new URLSearchParams();
    if (state.q) ps.set('q', state.q);
    if (state.category !== 'all') ps.set('category', state.category);
    if (state.chain !== 'all') ps.set('chain', state.chain);
    if (state.tab === 'live') ps.set('tab', 'live');
    if (state.watchOnly) ps.set('watch', '1');
    if (state.selected) ps.set('p', state.selected);
    var s = ps.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  // ---- sections ----
  function masthead() {
    var top = DATA.rows[0];
    return el('header', { class: 'mast' },
      el('div', { class: 'mast-left' },
        el('div', { class: 'ring', 'aria-hidden': 'true' }),
        el('div', null,
          el('div', { class: 'kicker', text: 'Token Radar · ' + DATA.model_version }),
          el('h1', { text: 'Which protocol launches next?' }),
          el('p', { class: 'lede' },
            el('b', { text: DATA.watchlist_size + ' watchlist protocols' }),
            ' with no token yet, ranked by implied value — TVL times a base multiple, adjusted for 7-day growth and for how long each has run without a token. The early radar adds ' + DATA.early_size + ' smaller pre-token finds below the floor.'
          )
        )
      ),
      el('div', { class: 'meta' },
        el('span', { class: 'chip' }, el('span', { class: 'dot' }), 'Snapshot ' + DATA.as_of),
        el('span', { class: 'chip' }, 'Source: ', el('b', { text: 'DefiLlama' })),
        el('span', { class: 'chip' }, 'Floor ', el('b', { text: fmtUsd(FLOOR) })),
        el('span', { class: 'chip' }, 'Top implied ', el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }))
      )
    );
  }

  function kpis() {
    var gainers = DATA.rows.filter(function (r) { return r.change_7d !== null && r.change_7d > 0; }).length;
    return el('section', { class: 'kpis', 'aria-label': 'Board totals' },
      el('div', { class: 'kpi hot' },
        el('div', { class: 'k-label', text: 'Watchlist · no token, at floor' }),
        el('div', { class: 'k-val', text: String(DATA.watchlist_size) }),
        el('div', { class: 'k-sub', text: 'every one ranked, none skipped' })),
      el('div', { class: 'kpi' },
        el('div', { class: 'k-label', text: 'Pre-token rows scored' }),
        el('div', { class: 'k-val', text: String(DATA.board_size) }),
        el('div', { class: 'k-sub', text: DATA.early_size + ' early finds below the floor' })),
      el('div', { class: 'kpi' },
        el('div', { class: 'k-label', text: 'Growing in the last 7 days' }),
        el('div', { class: 'k-val', text: String(gainers) }),
        el('div', { class: 'k-sub', text: 'of ' + DATA.board_size + ' rows, TVL up week over week' })),
      el('div', { class: 'kpi' },
        el('div', { class: 'k-label', text: 'Live-token protocols set aside' }),
        el('div', { class: 'k-val', text: String(DATA.live_size) }),
        el('div', { class: 'k-sub', text: 'they already trade — market cap, not a model' }))
    );
  }

  function signals() {
    var top = DATA.rows.slice(0, 5);
    return el('section', { class: 'signals', 'aria-label': 'Strongest signals' },
      el('h2', { text: 'Strongest signals' }),
      el('div', { class: 'sig-row' }, top.map(function (r) {
        return el('button', { type: 'button', class: 'sig', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 's-rank', text: 'RANK ' + r.rank }),
          el('span', { class: 's-name', text: r.name }),
          el('span', { class: 's-imp num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 's-sub', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · ' + fmtPct(r.change_7d) + ' in 7d' })
        );
      }))
    );
  }

  function toolbar() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a]; }).slice(0, 12);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCount[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var watchBtn = el('button', { type: 'button', class: 'toggle', 'aria-pressed': state.watchOnly ? 'true' : 'false', onclick: function () { state.watchOnly = !state.watchOnly; if (state.tab === 'live') state.tab = 'pre-token'; writeHash(); render(); } },
      el('span', { class: 'box', text: state.watchOnly ? '✓' : '' }), 'Watchlist only');
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token (' + DATA.board_size + ')', onclick: function () { state.tab = 'pre-token'; if (state.sort === 'mcap') { state.sort = 'rank'; state.dir = 1; } writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (' + DATA.live_size + ')', onclick: function () { state.tab = 'live'; state.sort = 'mcap'; state.dir = -1; writeHash(); render(); } });
    var shown = state.tab === 'pre-token' ? filteredPre().length : filteredLive().length;
    var total = state.tab === 'pre-token' ? DATA.board_size : DATA.live_size;
    return el('div', { class: 'toolbar' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Scope' }), watchBtn),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: shown + ' of ' + total + ' shown' })
    );
  }

  function sortTh(key, label, cls) {
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', onclick: function () { setSort(key); }, 'aria-label': 'Sort by ' + label },
        label, state.sort === key ? el('span', { class: 'arr', 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : el('span', { class: 'arr', 'aria-hidden': 'true', text: ' ↕' })));
  }

  function nameCell(r, badge) {
    var sub = (r.category || 'Other') + ' · ' + ((r.chains && r.chains.length) ? r.chains.slice(0, 3).join(', ') : 'chain not listed');
    if ((r.chains || []).length > 3) sub += ' +' + ((r.chains || []).length - 3);
    return el('td', null,
      el('div', { class: 'pname' },
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: sub }),
        el('span', { class: 'badges' }, badge)
      )
    );
  }
  function growthCell(v) {
    var cls = 'num ' + (v === null || v === undefined ? '' : v >= 0 ? 'pos' : 'neg');
    return el('td', { class: cls, text: fmtPct(v) });
  }

  function boardTable() {
    var list = sortList(filteredPre(), state.sort, state.dir);
    if (list.length === 0) return emptyPanel();
    var max = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var isW = WATCH.has(r.slug);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank-cell' + (r.rank <= 3 ? ' top3' : ''), text: '#' + r.rank }),
        nameCell(r, el('span', { class: 'pill ' + (isW ? 'watch' : 'early'), text: isW ? 'Watchlist' : 'Early find' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growthCell(r.change_7d),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num' }, el('div', { class: 'imp' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'board' },
      el('div', { class: 'scroll' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortTh('rank', 'Rank'),
            sortTh('name', 'Protocol'),
            sortTh('tvl', 'TVL', 'num'),
            sortTh('growth', '7d', 'num'),
            sortTh('age', 'Age', 'num'),
            sortTh('implied', 'Implied value', 'num')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = sortList(filteredLive(), state.sort, state.dir);
    if (list.length === 0) return emptyPanel();
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', { tabindex: '0' },
        nameCell(r, el('span', { class: 'pill live', text: 'Live token' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growthCell(r.change_7d),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: (r.mcap_usd && r.tvl_usd) ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' : 'n/a' })
      ));
    });
    return el('div', { class: 'board' },
      el('div', { class: 'scroll' },
        el('table', null,
          el('caption', { text: 'Already trading: market cap is a fact, not a model, so these sit outside the pre-token ranking. The last column is market cap divided by TVL.' }),
          el('thead', null, el('tr', null,
            sortTh('name', 'Protocol'),
            sortTh('tvl', 'TVL', 'num'),
            sortTh('growth', '7d', 'num'),
            sortTh('mcap', 'Market cap', 'num'),
            el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' })
          )),
          tbody
        )
      )
    );
  }

  function emptyPanel() {
    return el('div', { class: 'board' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search, pick another category or chain, or switch the watchlist toggle off.' }),
      el('button', { class: 'btn primary', type: 'button', text: 'Clear all filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; writeHash(); render(); } })
    ));
  }

  var CONST_LABELS = { base_multiple: 'Base multiple', growth_weight: 'Growth weight', growth_floor: 'Growth floor', growth_cap: 'Growth cap', maturity_floor: 'Maturity floor', maturity_range: 'Maturity range', maturity_days: 'Maturity window', unknown_age_days: 'Unknown age counts as', growth_log_scale: 'Growth log scale', growth_down_weight: 'Down-growth weight', tvl_ref_usd: 'TVL reference', tvl_exponent: 'TVL exponent' };
  function constVal(k, v) {
    if (k === 'tvl_ref_usd') return fmtUsd(v);
    if (k === 'growth_floor' || k === 'growth_cap') return (v > 0 ? '+' : '') + v + '%';
    if (k === 'maturity_days' || k === 'unknown_age_days') return v + ' days';
    return String(v);
  }

  function modelPanel() {
    var top = DATA.rows[0];
    return el('section', { class: 'model', 'aria-label': 'How implied value is computed' },
      el('h2', { text: 'How the radar scores a protocol' }),
      el('p', { class: 'mut', text: 'One function scores every row. No name is special-cased and no row is hand-picked — the same three factors decide every rank.' }),
      el('ol', { class: 'steps-plain' },
        el('li', null, el('b', { text: 'Size, with diminishing returns. ' }), 'The base starts at TVL times the base multiple of ' + M.base_multiple + '. Then a TVL scale pulls giant protocols back and lifts small ones a little: (TVL ÷ ' + fmtUsd(M.tvl_ref_usd) + ') to the power −' + M.tvl_exponent + ', capped between 0.5 and 1.15. A dollar of TVL counts for less at $2B than at $20M.'),
        el('li', null, el('b', { text: 'Momentum, logged up and straight down. ' }), 'The 7-day TVL change is clamped between ' + M.growth_floor + '% and +' + M.growth_cap + '%. Positive growth answers on a log scale — weight ' + M.growth_weight + ' times ln(1 + growth ÷ ' + M.growth_log_scale + ') — so a +400% week beats a +40% week, but not ten times over. Negative growth is punished in a straight line, at weight ' + M.growth_down_weight + '.'),
        el('li', null, el('b', { text: 'Maturity, saturating. ' }), 'The maturity factor starts at ' + M.maturity_floor + ' and rises toward ' + (M.maturity_floor + M.maturity_range).toFixed(2) + ' as the protocol survives: ' + M.maturity_range + ' × (1 − exp(−age ÷ ' + M.maturity_days + ')). Surviving the first year is most of the signal; the fourth year adds almost nothing. An unknown listing age counts as ' + M.unknown_age_days + ' days.')
      ),
      el('div', { class: 'formula' },
        el('div', { text: 'base = TVL × ' + M.base_multiple + ' × clamp((TVL ÷ ' + fmtUsd(M.tvl_ref_usd) + ')^−' + M.tvl_exponent + ', 0.5, 1.15)' }),
        el('div', { text: 'growth = clamp(7d change, ' + M.growth_floor + '%, +' + M.growth_cap + '%)' }),
        el('div', { text: 'growth mult = 1 + ' + M.growth_weight + ' × ln(1 + growth ÷ ' + M.growth_log_scale + ')  if growth ≥ 0;  else 1 + (growth ÷ 100) × ' + M.growth_down_weight }),
        el('div', { text: 'maturity = ' + M.maturity_floor + ' + ' + M.maturity_range + ' × (1 − exp(−age ÷ ' + M.maturity_days + '))' }),
        el('div', { text: 'implied = max(1, round(base × growth mult × maturity))' })
      ),
      el('div', { class: 'consts' },
        Object.keys(M).map(function (k) {
          return el('div', null, el('span', { text: CONST_LABELS[k] || k }), el('b', { text: constVal(k, M[k]) }));
        }).concat([el('div', null, el('span', { text: 'Model version' }), el('b', { text: DATA.model_version }))])
      ),
      top ? el('p', { class: 'mut', text: 'Rank 1 — ' + top.name + ': TVL ' + fmtUsd(top.tvl_usd) + ', 7-day change ' + fmtPct(top.change_7d) + ', age ' + fmtAge(top.age_days) + '. The row carries growth multiplier ' + fmtMult(top.growth_multiplier) + ' and maturity multiplier ' + fmtMult(top.maturity_multiplier) + '; implied value ' + fmtUsd(top.implied_value_usd) + '.' }) : null,
      el('p', { class: 'caveat', text: 'Implied value is an estimate, not a price and not a promise of a token. TVL can be mercenary, growth can reverse, and a protocol may never launch a token at all. Use the ranking to choose where to look first — then read the protocol before farming it.' })
    );
  }

  // ---- detail panel ----
  var scrim = el('div', { class: 'scrim', hidden: 'hidden', onclick: function () { closeDetail(); } });
  var detail = el('aside', { class: 'detail', hidden: 'hidden', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'd-title' });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var plan = farmPlan(row);
    var isW = WATCH.has(row.slug);
    detail.textContent = '';
    detail.appendChild(el('div', { class: 'd-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isW ? ' · Watchlist' : ' · Early find') }),
        el('h2', { id: 'd-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · listed ' + (row.listed_at || 'date unknown') + ' · slug ' + row.slug })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: '✕ Close', onclick: function () { closeDetail(); } })
    ));
    detail.appendChild(el('div', { class: 'chips' },
      el('span', { class: 'pill ' + (isW ? 'watch' : 'early'), text: isW ? 'Watchlist' : 'Early find' }),
      el('span', { class: 'chip', text: 'No token' }),
      el('span', { class: 'chip', text: 'Age ' + fmtAge(row.age_days) })
    ));
    detail.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: 'Valuation' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'big', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'TVL change, 7 days' }), el('b', { class: row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Market cap' }), el('b', { text: row.mcap_usd === null ? 'none — no token' : fmtUsd(row.mcap_usd) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { text: (row.chains && row.chains.length) ? row.chains.join(', ') : 'not listed' })),
        el('div', null, el('span', { text: 'Listed since' }), el('b', { text: row.listed_at || 'unknown' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) }))
      )
    ));
    detail.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: 'Model breakdown' }),
      el('div', { class: 'math' },
        el('div', null, el('span', { text: 'Base multiple (TVL × ' + M.base_multiple + ', then the TVL scale)' }), el('b', { text: String(M.base_multiple) })),
        el('div', null, el('span', { text: 'Growth multiplier (7d ' + fmtPct(row.change_7d) + ', clamped ' + M.growth_floor + '% to +' + M.growth_cap + '%)' }), el('b', { text: fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier (age ' + fmtAge(row.age_days) + ', window ' + M.maturity_days + 'd)' }), el('b', { text: fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value, as scored' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'mut small', text: 'Model ' + DATA.model_version + ': the multipliers and the implied value above are the row\u2019s own values from the data.' })
    ));
    detail.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'plan' }, plan.steps.map(function (s) {
        return el('li', null, el('div', null, el('b', { text: s.text }), el('div', { class: 'cost', text: 'Cost: ' + s.cost + ' · Time: ' + s.time })));
      })),
      el('p', { class: 'plan-note', text: 'Position: $' + plan.capital + ' of capital on ' + plan.chain + ' · hold at least ' + plan.hold + ' days · setup gas about $' + plan.gas + '. Size follows this protocol\u2019s TVL tier; the hold follows its age.' })
    ));
    scrim.removeAttribute('hidden');
    detail.removeAttribute('hidden');
    var btn = detail.querySelector('.close');
    if (btn) btn.focus();
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    scrim.setAttribute('hidden', 'hidden');
    detail.setAttribute('hidden', 'hidden');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'wrap' });
    shell.appendChild(masthead());
    shell.appendChild(kpis());
    if (state.tab === 'pre-token') shell.appendChild(signals());
    shell.appendChild(toolbar());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'Snapshot ' + DATA.as_of + ' · Source: DefiLlama · Model ' + DATA.model_version }),
      el('span', { text: 'Offline page — every number on it comes from the snapshot file next to it.' }),
      el('span', { text: 'Not financial advice. A token may never launch.' })
    ));
    app.appendChild(shell);
    if (!scrim.isConnected) { app.appendChild(scrim); app.appendChild(detail); }
    app.setAttribute('aria-busy', 'false');
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (row) openDetail(state.selected);
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !detail.hasAttribute('hidden')) closeDetail();
  });
})();
