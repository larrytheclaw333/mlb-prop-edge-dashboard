// MLB Prop Edge Dashboard — app.js
// Loads from ./data/latest.json, ./data/history.json, ./data/manifest.json

"use strict";

// ── State ────────────────────────────────────────────────────────────────────

let STATE = {
  currentDate: null,
  dayData: null,
  history: null,
  manifest: null,
  audit: null,
  activePage: "picks",
  performanceScope: "v2",
  explorerSort: { key: "expected_value_per_100", dir: -1 },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v, decimals = 2) {
  if (v == null) return "—";
  return Number(v).toFixed(decimals);
}
function fmtPct(v) { return v == null ? "—" : fmt(v, 1) + "%"; }
function fmtOdds(v) { return v == null ? "—" : (v > 0 ? "+" + v : "" + v); }
function fmtPL(v) { return v == null ? "—" : (v >= 0 ? "+$" + fmt(v) : "-$" + fmt(Math.abs(v))); }
function fmtROI(v) { return v == null ? "—" : (v >= 0 ? "+" : "") + fmt(v, 1) + "%"; }
function text(v) { return v == null || v === "" ? "—" : String(v); }
function selClass(s) {
  const lc = (s || "").toLowerCase();
  return ["over","under","yrfi","nrfi"].includes(lc) ? lc : "";
}
function mktLabel(m) {
  return { pitcher_strikeouts: "Pitcher Ks", batter_hits: "Batter hits", nrfi_yrfi: "NRFI/YRFI" }[m] || m;
}
function mktBadgeHTML(m) {
  const cls = { pitcher_strikeouts: "mkt-k", batter_hits: "mkt-hits", nrfi_yrfi: "mkt-nrfi" }[m] || "mkt-k";
  return `<span class="mkt-badge ${cls}">${mktLabel(m)}</span>`;
}
function el(id) { return document.getElementById(id); }
function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
function versionBoundary() {
  return STATE.history?.model_version_boundary || {};
}
function dayModelVersion(day) {
  return day?.summary?.model_version || day?.candidates_meta?.model_version || null;
}
function dayVersionState(day) {
  const boundary = versionBoundary();
  const current = boundary.current_version || "v2";
  const effective = boundary.effective_date || "2026-06-18";
  const version = dayModelVersion(day);
  if (version === current) return { kind: "current", version, current, effective };
  return { kind: "archive", version: version || "v1 archive", current, effective };
}
function dateRangeLabel(days) {
  if (!days.length) return "no dates yet";
  const dates = days.map(d => d.date).filter(Boolean);
  if (!dates.length) return "no dates yet";
  return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]}–${dates[dates.length - 1]}`;
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadManifest() {
  try {
    const r = await fetch("./data/manifest.json");
    STATE.manifest = await r.json();
  } catch (e) {
    STATE.manifest = { dates: [], latest: null };
  }
}

async function loadDay(date) {
  // Always load the immutable dated export for a selected date.  The moving
  // latest.json alias can be newer than a cached manifest, which made an old
  // "latest" option (for example 2026-05-27) display newer picks.
  const url = `./data/daily/${date}.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url}`);
  return r.json();
}

async function loadHistory() {
  try {
    const r = await fetch("./data/history.json");
    STATE.history = await r.json();
  } catch (e) {
    STATE.history = { days: [], totals: {} };
  }
}

async function loadAudit() {
  try {
    const r = await fetch("./data/audit/latest.json");
    if (!r.ok) throw new Error("Audit export missing");
    STATE.audit = await r.json();
  } catch (e) {
    STATE.audit = null;
  }
}

// ── Date picker ──────────────────────────────────────────────────────────────

function buildDatePicker() {
  const sel = el("date-picker");
  if (!sel || !STATE.manifest) return;
  sel.innerHTML = "";
  const dates = [...STATE.manifest.dates].reverse();
  dates.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    if (d === STATE.currentDate) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = async () => {
    el("loading-msg").textContent = "Loading…";
    STATE.dayData = await loadDay(sel.value);
    STATE.currentDate = sel.value;
    el("loading-msg").textContent = "";
    renderAll();
  };
}

// ── Run metadata bar ─────────────────────────────────────────────────────────

function renderMeta() {
  const d = STATE.dayData;
  if (!d) return;
  const cm = d.candidates_meta || {};
  const windows = cm.window_count || cm.source_windows?.length || 1;
  el("run-meta").textContent =
    `${d.run_date} · ${windows} window${windows !== 1 ? "s" : ""} · ${d.summary.total_candidates} candidates`;
}

function renderVersionBanner() {
  const banner = el("version-banner");
  if (!banner || !STATE.dayData) return;
  const title = el("version-title");
  const copy = el("version-copy");
  const pill = el("version-pill");
  const boundary = versionBoundary();
  const state = dayVersionState(STATE.dayData);
  banner.classList.toggle("archive", state.kind !== "current");

  if (state.kind === "current") {
    title.textContent = `Model ${state.current} active`;
    copy.textContent = `${boundary.description || "Current production baseline"} Baseline starts ${state.effective}.`;
    pill.textContent = state.current;
  } else {
    title.textContent = "Viewing archived baseline";
    copy.textContent = `This date is outside the ${state.current} reporting baseline that starts ${state.effective}.`;
    pill.textContent = state.version;
  }
}

// ── Picks page ───────────────────────────────────────────────────────────────

function buildPickCard(c, isPick) {
  const div = document.createElement("div");
  div.className = "pick-card" + (isPick ? " is-pick" : "");
  const sc = selClass(c.selection);
  const edge = c.edge_percentage_points;
  const edgeCls = edge >= 0 ? "pos" : "neg";
  const edgeSign = edge >= 0 ? "+" : "";

  // Result badge
  let resultHTML = "";
  if (c.win === true) {
    resultHTML = `<div class="result-row"><span class="result-badge result-win">Win</span>${c.result ? `<span class="result-text">${c.result}</span>` : ""}${c.profit_loss != null ? `<span class="result-text pos">${fmtPL(c.profit_loss)}</span>` : ""}</div>`;
  } else if (c.win === false) {
    resultHTML = `<div class="result-row"><span class="result-badge result-loss">Loss</span>${c.result ? `<span class="result-text">${c.result}</span>` : ""}${c.profit_loss != null ? `<span class="result-text neg">${fmtPL(c.profit_loss)}</span>` : ""}</div>`;
  } else {
    resultHTML = `<div class="result-row"><span class="result-badge result-pending">Pending</span></div>`;
  }

  // Market-specific detail rows
  let detailRows = "";
  if (c.market === "pitcher_strikeouts") {
    detailRows = [
      ["Projected Ks", fmt(c.projected_ks, 2)],
      ["IP / start", fmt(c.ip_per_start, 2)],
      ["Starter role", c.starter_role ? c.starter_role.replace(/_/g, " ") : "—"],
      ["Opp K adjustment", fmt(c.opponent_k_adjustment, 3)],
      ["Baseball prob", fmtPct(c.baseball_probability)],
      ["Consensus prob", fmtPct(c.consensus_probability)],
      ["Model weight", c.baseball_weight != null ? (c.baseball_weight * 100).toFixed(0) + "%" : "—"],
      ["Park factor", fmt(c.park_hit_factor, 2)],
    ].map(([k, v]) => `<div class="drow"><span class="dkey">${k}</span><span class="dval">${v}</span></div>`).join("");
  } else if (c.market === "batter_hits") {
    detailRows = [
      ["AVG / xBA", `${fmt(c.batter_avg, 3)} / ${c.batter_xba != null ? fmt(c.batter_xba, 3) : "—"}`],
      ["xBA available", c.xba_available ? "yes" : "no"],
      ["xBA blend used", c.xba_blend_used ? "yes" : "no"],
      ["Season PA", c.season_pa ?? "—"],
      ["Lineup spot", c.lineup_spot != null ? "#" + c.lineup_spot : "—"],
      ["Lineup confirmed", c.lineup_confirmed ? "yes" : "no"],
      ["Opp pitcher", c.opposing_pitcher || "—"],
      [`Opp ERA / H9`, c.opposing_pitcher_era != null ? `${fmt(c.opposing_pitcher_era, 2)} / ${fmt(c.opposing_pitcher_h9, 2)}` : "—"],
      ["Pitcher hit adj", fmt(c.pitcher_hit_adjustment, 3)],
      ["Park factor", fmt(c.park_hit_factor, 2)],
      ["Baseball prob", fmtPct(c.baseball_probability)],
      ["Consensus prob", fmtPct(c.consensus_probability)],
    ].map(([k, v]) => `<div class="drow"><span class="dkey">${k}</span><span class="dval">${v}</span></div>`).join("");
  } else if (c.market === "nrfi_yrfi") {
    detailRows = [
      ["Away starter", c.away_probable_pitcher || "—"],
      ["Home starter", c.home_probable_pitcher || "—"],
      ["Away 1st inn λ", fmt(c.away_first_inning_lambda, 3)],
      ["Home 1st inn λ", fmt(c.home_first_inning_lambda, 3)],
      ["Away score prob", fmtPct(c.away_score_probability)],
      ["Home score prob", fmtPct(c.home_score_probability)],
      ["Market hold %", fmt(c.market_hold_pct, 1)],
      ["Baseball prob", fmtPct(c.baseball_probability)],
      ["Consensus prob", fmtPct(c.consensus_probability)],
    ].map(([k, v]) => `<div class="drow"><span class="dkey">${k}</span><span class="dval">${v}</span></div>`).join("");
  }

  const uid = (c.candidate_id || c.label || Math.random()).toString().replace(/[^a-z0-9]/gi, "_");

  div.innerHTML = `
    <div class="pick-header">
      <span class="sel-badge sel-${sc}">${c.selection}</span>
      <span class="pick-name">${c.label}</span>
      ${mktBadgeHTML(c.market)}
    </div>
    <div class="pick-stats">
      <div class="pstat">EV <span>$${fmt(c.expected_value_per_100, 2)}</span></div>
      <div class="pstat">Edge <span class="${edgeCls}">${edgeSign}${fmt(edge, 2)}pp</span></div>
      <div class="pstat">Model <span>${fmtPct(c.model_probability)}</span></div>
      <div class="pstat">Implied <span>${fmtPct(c.implied_probability)}</span></div>
      <div class="pstat">Odds <span>${fmtOdds(c.american_odds)}</span></div>
      <div class="pstat">@ <span>${c.venue_name || c.event_label || "—"}</span></div>
    </div>
    ${resultHTML}
    <div class="pick-detail" id="det-${uid}">
      <div class="prob-visual">
        <div class="prob-track">
          <div class="prob-fill" style="width:${Math.min(c.model_probability ?? 0, 100)}%"></div>
          <div class="prob-marker" style="left:${Math.min(c.implied_probability ?? 0, 100)}%"></div>
        </div>
        <div class="prob-labels">
          <span>Model ${fmtPct(c.model_probability)}</span>
          <span>Implied ${fmtPct(c.implied_probability)}</span>
        </div>
      </div>
      <div class="detail-grid">${detailRows}</div>
    </div>`;

  div.querySelector(".pick-header").addEventListener("click", () => {
    const det = div.querySelector(".pick-detail");
    const open = det.classList.toggle("open");
    div.classList.toggle("expanded", open);
  });

  return div;
}

function renderPicksPage() {
  const d = STATE.dayData;
  if (!d) return;
  const s = d.summary;

  // Summary stats
  const winLabel = s.wins > 0 || s.losses > 0
    ? `${s.wins}W / ${s.losses}L`
    : `${s.pending} pending`;
  const plLabel = s.total_profit_loss !== 0
    ? fmtPL(s.total_profit_loss)
    : "no settled bets";

  el("stat-total").textContent = s.total_candidates;
  el("stat-qualified").textContent = s.qualified_count;
  el("stat-picks").textContent = s.picks_count;
  el("stat-pl").textContent = plLabel;
  el("stat-record").textContent = winLabel;

  // Picks
  const pl = el("picks-list");
  pl.innerHTML = "";
  if (!d.picks || d.picks.length === 0) {
    pl.innerHTML = '<p class="empty">No final picks for this date.</p>';
  } else {
    d.picks.forEach(p => pl.appendChild(buildPickCard(p, true)));
  }
}

// ── Explorer page ────────────────────────────────────────────────────────────

let explorerSortKey = "expected_value_per_100";
let explorerSortDir = -1;

function renderExplorer() {
  const d = STATE.dayData;
  if (!d) return;

  const mktF = el("f-market").value;
  const qualF = el("f-qual").value;
  const selF = el("f-sel").value;

  let data = (d.all_candidates || []).slice();
  if (mktF) data = data.filter(c => c.market === mktF);
  if (qualF === "true") data = data.filter(c => c.qualified);
  if (qualF === "false") data = data.filter(c => !c.qualified);
  if (selF === "Over") data = data.filter(c => c.selection === "Over" || c.selection === "YRFI");
  if (selF === "Under") data = data.filter(c => c.selection === "Under" || c.selection === "NRFI");

  data.sort((a, b) => explorerSortDir * ((b[explorerSortKey] ?? -9999) - (a[explorerSortKey] ?? -9999)));

  const tbody = el("explorer-body");
  tbody.innerHTML = "";

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No candidates match filters.</td></tr>';
    el("tbl-count").textContent = "0 results";
    return;
  }

  data.forEach(c => {
    const edge = c.edge_percentage_points;
    const ecls = edge >= 0 ? "pos" : "neg";
    const sc = selClass(c.selection);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${c.label}</td>
      <td>${mktBadgeHTML(c.market)}</td>
      <td><span class="sel-badge sel-${sc}" style="font-size:10px;">${c.selection}</span></td>
      <td>${fmtOdds(c.american_odds)}</td>
      <td>${fmtPct(c.model_probability)}</td>
      <td>${fmtPct(c.implied_probability)}</td>
      <td class="${ecls}">${edge >= 0 ? "+" : ""}${fmt(edge, 2)}</td>
      <td>$${fmt(c.expected_value_per_100, 2)}</td>
      <td><span class="${c.qualified ? "badge-q" : "badge-nq"}">${c.qualified ? "yes" : "no"}</span></td>`;
    tbody.appendChild(row);
  });

  el("tbl-count").textContent = `${data.length} of ${d.all_candidates?.length ?? 0} candidates`;
}

function setupExplorerSort() {
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (explorerSortKey === key) {
        explorerSortDir *= -1;
      } else {
        explorerSortKey = key;
        explorerSortDir = -1;
      }
      document.querySelectorAll("th[data-sort]").forEach(t => {
        t.classList.remove("sorted");
        t.querySelector(".sort-arrow").textContent = "↕";
      });
      th.classList.add("sorted");
      th.querySelector(".sort-arrow").textContent = explorerSortDir === -1 ? "↓" : "↑";
      renderExplorer();
    });
  });
  ["f-market","f-qual","f-sel"].forEach(id => {
    el(id)?.addEventListener("change", renderExplorer);
  });
}

// ── Diagnostics page ─────────────────────────────────────────────────────────

let chartsBuilt = false;
let mktChart, edgeChart;

function renderDiagnostics() {
  const d = STATE.dayData;
  if (!d) return;
  const cov = d.summary.coverage;
  const bh = cov.batter_hits;
  const pk = cov.pitcher_strikeouts;
  const nrfi = cov.nrfi_yrfi;

  // Stat grid
  el("diag-batter").textContent = bh.total;
  el("diag-batter-q").textContent = bh.qualified + " qualified";
  el("diag-pitcher").textContent = pk.total;
  el("diag-pitcher-q").textContent = pk.qualified + " qualified";
  el("diag-nrfi").textContent = nrfi.total;
  el("diag-nrfi-q").textContent = nrfi.qualified + " qualified";

  // Coverage bars
  function covBar(pct) {
    return `<div class="cov-bar-fill" style="width:${Math.min(pct || 0, 100)}%"></div>`;
  }
  el("cov-xba").innerHTML = covBar(bh.xba_available_pct);
  el("cov-xba-pct").textContent = fmtPct(bh.xba_available_pct);
  el("cov-blend").innerHTML = covBar(bh.xba_blend_used_pct);
  el("cov-blend-pct").textContent = fmtPct(bh.xba_blend_used_pct);
  el("cov-lineup").innerHTML = covBar(bh.lineup_confirmed_pct);
  el("cov-lineup-pct").textContent = fmtPct(bh.lineup_confirmed_pct);
  el("cov-pitcher").innerHTML = covBar(bh.pitcher_mapped_pct);
  el("cov-pitcher-pct").textContent = fmtPct(bh.pitcher_mapped_pct);

  // Rejection reasons
  const rejEl = el("rej-list");
  rejEl.innerHTML = "";
  const rejs = Object.entries(cov.rejection_reasons || {}).sort((a,b) => b[1]-a[1]);
  const rejMax = rejs[0]?.[1] || 1;
  rejs.forEach(([r, n]) => {
    rejEl.innerHTML += `<div class="cov-row">
      <span class="cov-lbl">${r.replace(/_/g, " ")}</span>
      <div class="cov-bar-wrap"><div class="cov-bar-fill" style="width:${(n/rejMax*100).toFixed(0)}%"></div></div>
      <span class="cov-pct">${n}</span>
    </div>`;
  });

  // Confidence distribution
  const confEl = el("conf-list");
  confEl.innerHTML = "";
  const confs = Object.entries(cov.confidence_distribution || {}).sort((a,b) => b[1]-a[1]);
  const confMax = confs[0]?.[1] || 1;
  confs.forEach(([c2, n]) => {
    confEl.innerHTML += `<div class="cov-row">
      <span class="cov-lbl">${c2}</span>
      <div class="cov-bar-wrap"><div class="cov-bar-fill" style="width:${(n/confMax*100).toFixed(0)}%"></div></div>
      <span class="cov-pct">${n}</span>
    </div>`;
  });

  // Charts
  buildDiagCharts(d);
}

function buildDiagCharts(d) {
  const cov = d.summary.coverage;

  // Market breakdown chart
  if (mktChart) mktChart.destroy();
  const mktCtx = el("mkt-chart");
  if (mktCtx) {
    mktChart = new Chart(mktCtx, {
      type: "bar",
      data: {
        labels: ["Batter hits","Pitcher Ks","NRFI/YRFI"],
        datasets: [
          { label: "Total", data: [cov.batter_hits.total, cov.pitcher_strikeouts.total, cov.nrfi_yrfi.total], backgroundColor: "#B5D4F4" },
          { label: "Qualified", data: [cov.batter_hits.qualified, cov.pitcher_strikeouts.qualified, cov.nrfi_yrfi.qualified], backgroundColor: "#378ADD" },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: "rgba(128,128,128,0.1)" }, ticks: { precision: 0 } }
        }
      }
    });
  }

  // Edge distribution for pitcher Ks
  if (edgeChart) edgeChart.destroy();
  const edgeCtx = el("edge-chart");
  if (edgeCtx) {
    const kCands = (d.qualified || []).filter(c => c.market === "pitcher_strikeouts")
      .sort((a,b) => b.edge_percentage_points - a.edge_percentage_points);
    const labels = kCands.map(c => c.player || c.label);
    const edges = kCands.map(c => parseFloat((c.edge_percentage_points || 0).toFixed(2)));
    edgeChart = new Chart(edgeCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: edges,
          backgroundColor: edges.map(e => e >= 0 ? "#3B6D11" : "#A32D2D"),
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: "rgba(128,128,128,0.1)" },
            ticks: { callback: v => v + "pp" }
          },
          y: { ticks: { font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }
}

// ── Audit page ───────────────────────────────────────────────────────────────

function renderAudit() {
  const a = STATE.audit;
  const page = el("page-audit");
  if (!page) return;
  if (!a) {
    page.innerHTML = '<p class="empty">No audit export found. Run <code>mlb-prop-edge export-model-lab-dashboard</code>.</p>';
    return;
  }

  const s = a.summary || {};
  const ds = s.dataset || {};
  el("audit-guardrail").textContent = a.guardrail?.text || "Audit data is diagnostic only.";
  el("audit-window").textContent = `${a.window?.start_date || "—"} → ${a.window?.end_date || "—"}`;
  el("audit-qualified").textContent = s.qualified ?? "—";
  el("audit-roi-eligible").textContent = `${s.roi_eligible ?? "—"} ROI eligible`;
  el("audit-win-rate").textContent = fmtPct(s.win_rate);
  el("audit-record").textContent = `${s.wins ?? 0}W / ${s.losses ?? 0}L`;
  el("audit-roi").textContent = fmtROI(s.roi);
  el("audit-roi").className = "stat-val " + ((s.roi || 0) >= 0 ? "pos" : "neg");
  el("audit-pl").textContent = fmtPL(s.profit_loss);
  el("audit-health").textContent = ds.has_warnings ? "Warnings" : "Clean";
  el("audit-health").className = "stat-val " + (ds.has_warnings ? "neg" : "pos");
  el("audit-settled").textContent = `${fmtPct(ds.settled_qualified_percentage)} settled qualified`;

  const marketBody = el("audit-market-body");
  marketBody.innerHTML = "";
  (a.markets || []).forEach(row => {
    const tr = document.createElement("tr");
    const roiCls = (row.roi || 0) >= 0 ? "pos" : "neg";
    const plCls = (row.profit_loss || 0) >= 0 ? "pos" : "neg";
    tr.innerHTML = `
      <td>${mktBadgeHTML(row.market)}</td>
      <td>${row.qualified ?? "—"}</td>
      <td>${row.wins ?? 0}-${row.losses ?? 0}</td>
      <td>${fmtPct(row.win_rate)}</td>
      <td class="${roiCls}">${fmtROI(row.roi)}</td>
      <td class="${plCls}">${fmtPL(row.profit_loss)}</td>
      <td>${signalBadge(row.signal_strength, row.insufficient_data)}</td>`;
    marketBody.appendChild(tr);
  });

  renderCalibrationList(el("audit-calibration-list"), a.calibration?.by_market || []);
  renderBucketList(el("audit-bucket-list"), a.calibration?.notable_buckets || []);
  renderKComparison(a.findings?.candidate_findings || []);
  renderFindingList(el("audit-confirmed-list"), a.findings?.confirmed_diagnostics || []);
  renderFindingList(el("audit-candidate-list"), a.findings?.candidate_findings || []);

  const v2 = a.v2_test_queue || {};
  el("audit-v2-summary").textContent = `${v2.public_summary || "Calibration improvements under investigation."} Details omitted from public export. Items under review: ${v2.count ?? 0}.`;
}

function signalBadge(signal, insufficient) {
  const cls = insufficient ? "audit-signal weak" : "audit-signal";
  return `<span class="${cls}">${text(signal).replace(/_/g, " ")}</span>`;
}

function renderCalibrationList(container, rows) {
  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = '<p class="empty">No calibration rows.</p>';
    return;
  }
  rows.forEach(row => {
    const gap = row.calibration_gap;
    const gapCls = Math.abs(gap || 0) <= 3 ? "pos" : "neg";
    container.innerHTML += `<div class="audit-row">
      <div><strong>${mktLabel(row.market)}</strong><span>${row.qualified ?? "—"} qualified · ${signalBadge(row.signal_strength, row.insufficient_data)}</span></div>
      <div class="${gapCls}">${gap == null ? "—" : (gap > 0 ? "+" : "") + fmt(gap, 1) + "pp"}</div>
    </div>`;
  });
}

function renderBucketList(container, rows) {
  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = '<p class="empty">No notable buckets.</p>';
    return;
  }
  rows.forEach(row => {
    const gap = row.calibration_gap;
    container.innerHTML += `<div class="audit-row">
      <div><strong>${mktLabel(row.market)} ${text(row.bucket)}</strong><span>${row.qualified ?? "—"} qualified · win ${fmtPct(row.win_rate)}</span></div>
      <div class="${Math.abs(gap || 0) <= 3 ? "pos" : "neg"}">${gap == null ? "—" : (gap > 0 ? "+" : "") + fmt(gap, 1) + "pp"}</div>
    </div>`;
  });
}

function renderKComparison(rows) {
  const container = el("audit-k-comparison");
  if (!container) return;
  const finding = rows.find(r => r.id === "pitcher_k_unders_structural_miscalibration");
  const over = finding?.evidence_summary?.overs;
  const under = finding?.evidence_summary?.unders;
  if (!finding || !over || !under) {
    container.innerHTML = '<p class="empty">K Over/Under comparison is unavailable in this export.</p>';
    return;
  }
  container.innerHTML = `<div class="finding-title">${text(finding.title)}</div>
    <div class="finding-summary">${text(finding.summary)}</div>
    <div class="audit-compare-grid">
      ${renderKCompareSide("K Overs", over)}
      ${renderKCompareSide("K Unders", under)}
    </div>`;
}

function renderKCompareSide(label, row) {
  const roiCls = (row.roi || 0) >= 0 ? "pos" : "neg";
  const gap = row.calibration_gap;
  return `<div class="audit-compare-side">
    <div class="audit-compare-title">${label}</div>
    <div class="audit-compare-main ${roiCls}">${fmtROI(row.roi)} ROI</div>
    <div class="audit-compare-row"><span>Record</span><strong>${row.wins ?? 0}-${row.losses ?? 0}</strong></div>
    <div class="audit-compare-row"><span>Win rate</span><strong>${fmtPct(row.actual_win_rate ?? row.win_rate)}</strong></div>
    <div class="audit-compare-row"><span>Model avg</span><strong>${fmtPct(row.avg_model_probability)}</strong></div>
    <div class="audit-compare-row"><span>Calibration gap</span><strong class="${Math.abs(gap || 0) <= 3 ? "pos" : "neg"}">${gap == null ? "—" : (gap > 0 ? "+" : "") + fmt(gap, 1) + "pp"}</strong></div>
    <div class="audit-compare-row"><span>P/L</span><strong class="${roiCls}">${fmtPL(row.profit_loss)}</strong></div>
  </div>`;
}

function renderFindingList(container, rows) {
  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = '<p class="empty">No findings in export.</p>';
    return;
  }
  rows.forEach(row => {
    const div = document.createElement("div");
    div.className = "finding-card";
    div.innerHTML = `<div class="finding-title">${text(row.title)}</div>
      <div class="finding-summary">${text(row.summary)}</div>
      <div class="finding-action">${text(row.actionability).replace(/_/g, " ")}</div>`;
    container.appendChild(div);
  });
}

// ── History page ─────────────────────────────────────────────────────────────

let plChart, wlChart;

function renderHistory() {
  const h = STATE.history;
  if (!h || !h.days || h.days.length === 0) {
    el("hist-content").innerHTML = '<p class="empty">No history data yet. Run <code>mlb-prop-edge export-dashboard-static</code> with multiple dates.</p>';
    return;
  }
  const boundary = h.model_version_boundary || {};
  const currentVersion = boundary.current_version || "v2";
  const scope = STATE.performanceScope || "v2";
  const currentDays = h.days.filter(d => d.model_version === currentVersion);
  const archiveDays = h.days.filter(d => d.model_version !== currentVersion);
  const scopeMap = {
    v2: {
      label: `${currentVersion} current`,
      picksLabel: `${currentVersion} picks`,
      plLabel: `${currentVersion} P/L`,
      totals: h.current_model_totals || {},
      days: currentDays,
      description: `${currentVersion} current baseline · starts ${boundary.effective_date || "2026-06-18"} · default view`,
      chartTitle: `${currentVersion} cumulative P/L`,
    },
    v1: {
      label: "v1 archive",
      picksLabel: "v1 picks",
      plLabel: "v1 P/L",
      totals: h.archive_totals || {},
      days: archiveDays,
      description: `v1 archive · ${dateRangeLabel(archiveDays)} · historical baseline`,
      chartTitle: "v1 cumulative P/L",
    },
    all: {
      label: "all time",
      picksLabel: "all-time picks",
      plLabel: "all-time P/L",
      totals: h.totals || {},
      days: h.days,
      description: `All time / v1 + ${currentVersion} · includes archived drawdown`,
      chartTitle: "All-time cumulative P/L",
    },
  };
  const selected = scopeMap[scope] || scopeMap.v2;
  const t = selected.totals;
  const archive = h.archive_totals || {};
  const current = h.current_model_totals || {};

  document.querySelectorAll("[data-history-scope]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.historyScope === scope);
  });
  el("hist-picks-label").textContent = selected.picksLabel;
  el("hist-picks").textContent = t.total_picks ?? "—";
  el("hist-wins").textContent = t.total_wins ?? "—";
  el("hist-losses").textContent = t.total_losses ?? "—";
  el("hist-wr").textContent = t.win_rate != null ? t.win_rate + "%" : "—";
  el("hist-pl-label").textContent = selected.plLabel;
  el("hist-pl").textContent = fmtPL(t.cumulative_pl);
  el("history-scope").textContent = selected.description;
  el("archive-summary").textContent =
    `${currentVersion}: ${current.total_picks ?? 0} picks, ${fmtPL(current.cumulative_pl || 0)} P/L. ` +
    `v1 archive: ${archive.total_picks ?? 0} picks, ${fmtPL(archive.cumulative_pl || 0)} P/L.`;
  el("pl-chart-title").textContent = selected.chartTitle;
  el("wl-chart-title").textContent = `${selected.label} daily wins / losses / pending`;

  buildHistoryCharts(selected.days);
}

function buildHistoryCharts(days) {
  let scopedCumulativePL = 0;
  const scopedDays = days.map(d => {
    if (d.settled) scopedCumulativePL = Math.round((scopedCumulativePL + (d.profit_loss || 0)) * 100) / 100;
    return { ...d, scoped_cumulative_pl: scopedCumulativePL };
  });
  const labels = scopedDays.map(d => d.date);

  if (plChart) plChart.destroy();
  const plCtx = el("pl-chart");
  if (plCtx) {
    plChart = new Chart(plCtx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Cumulative P/L",
          data: scopedDays.map(d => d.scoped_cumulative_pl),
          borderColor: "#378ADD",
          backgroundColor: "rgba(55,138,221,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
          y: { grid: { color: "rgba(128,128,128,0.1)" }, ticks: { callback: v => "$" + v } }
        }
      }
    });
  }

  if (wlChart) wlChart.destroy();
  const wlCtx = el("wl-chart");
  if (wlCtx) {
    wlChart = new Chart(wlCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Wins", data: scopedDays.map(d => d.wins), backgroundColor: "#3B6D11" },
          { label: "Losses", data: scopedDays.map(d => d.losses), backgroundColor: "#A32D2D" },
          { label: "Pending", data: scopedDays.map(d => d.pending), backgroundColor: "#B5D4F4" },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "bottom", labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } } },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, grid: { color: "rgba(128,128,128,0.1)" }, ticks: { precision: 0 } }
        }
      }
    });
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const pageEl = el("page-" + name);
  if (pageEl) pageEl.classList.add("active");
  document.querySelector(`.nav-btn[data-page="${name}"]`)?.classList.add("active");
  STATE.activePage = name;

  if (name === "explorer") renderExplorer();
  if (name === "diagnostics") renderDiagnostics();
  if (name === "audit") renderAudit();
  if (name === "history") renderHistory();
}

function setupHistoryScopeControls() {
  try {
    const savedScope = sessionStorage.getItem("mlbPropHistoryScope");
    if (["v2", "v1", "all"].includes(savedScope)) STATE.performanceScope = savedScope;
  } catch (e) {
    STATE.performanceScope = "v2";
  }

  document.querySelectorAll("[data-history-scope]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.performanceScope = btn.dataset.historyScope || "v2";
      try {
        sessionStorage.setItem("mlbPropHistoryScope", STATE.performanceScope);
      } catch (e) {
        // Session storage is a convenience only; v2 remains the fresh-load default.
      }
      renderHistory();
    });
  });
}

function renderAll() {
  renderMeta();
  renderVersionBanner();
  renderPicksPage();
  if (STATE.activePage === "explorer") renderExplorer();
  if (STATE.activePage === "diagnostics") renderDiagnostics();
  if (STATE.activePage === "audit") renderAudit();
  if (STATE.activePage === "history") renderHistory();
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  el("loading-msg").textContent = "Loading…";

  await loadManifest();
  await loadHistory();
  await loadAudit();

  const latestDate = STATE.manifest?.latest;
  if (!latestDate) {
    el("loading-msg").textContent = "No data found. Run export-dashboard-static first.";
    return;
  }

  STATE.currentDate = latestDate;
  STATE.dayData = await loadDay(latestDate);
  el("loading-msg").textContent = "";

  buildDatePicker();
  setupExplorerSort();
  setupHistoryScopeControls();

  document.querySelectorAll(".nav-btn[data-page]").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

  renderAll();
}

document.addEventListener("DOMContentLoaded", boot);
