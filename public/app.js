// Stadtgeist city twin: a 3D Basel where business beacons pulse when agents query them,
// your agent rehearses the planned day, and a swarm of visitor agents forecasts demand.
// Two looks for the same city: the everyday kart rally, and a Halloween night rally.
const THEMES = {
  rally: {
    cat: { hotel: "#9b5cff", restaurant: "#ff8a1f", cafe: "#ffd23f", experience: "#2f8cff", shop: "#ff5fb4" },
    map: { bg: "#9be37f", water: "#36b6ff", park: "#5fd16b", building: "#ffe9b8", land: "#b6ec95", rail: "#9b5cff", road: "#fffdf5", casing: "#1b1530",
      ext: [0, "#ffd36e", 15, "#ff9fbf", 30, "#b9a2ff", 60, "#7fd8ff"], text: "#1b1530", halo: "#ffffff", bank: "#fff3c4", bankBlur: 0,
      glow: "#1b1530", glowW: 16, glowBlur: 0, glowOp: 1, base: "#ffffff", walk: "#ff3b3b", tram: "#9b5cff", ghost: "#ffd23f", ghostOp: 0.7, swarm: "#9b5cff" },
    logo: "★", sub: "Rhine Rally · Basel's agent-native layer", h2: "🏁 Tell your agent about your day", go: "GO!", finish: "FINISH!", confetti: null,
    trick: "🚫 Fake hotel blocked", trickStep: "1 fake blocked 🚫", misuse: "🚫 Sneaky charge blocked", treat: "🏁 Day booked:",
    swarm: "🏎️ Add 60 visitors' agents", swarmBusy: "Agents on the grid…", crowd: "🏁 Tomorrow's grid", spoof: "⚠ unverified listing", toggle: "🎃",
  },
  halloween: {
    cat: { hotel: "#b26bff", restaurant: "#ff4f4f", cafe: "#ffd23f", experience: "#4fd2ff", shop: "#7cff4f" },
    map: { bg: "#1b1033", water: "#3b2a9a", park: "#14301f", building: "#2a1746", land: "#211339", rail: "#7a2bd6", road: "#4a3470", casing: "#0d0618",
      ext: [0, "#3a2160", 20, "#5a2f8a", 40, "#ff7a1a"], text: "#c7b3e6", halo: "#0d0618", bank: "#7a2bd6", bankBlur: 8,
      glow: "#ff7a1a", glowW: 20, glowBlur: 10, glowOp: 0.6, base: "#0d0618", walk: "#ffb21a", tram: "#7cff4f", ghost: "#e8e0ff", ghostOp: 0.35, swarm: "#b26bff" },
    logo: "🎃", sub: "Halloween Night Rally · Basel's agent-native layer", h2: "🎃 Tell your agent about your night", go: "BOO!", finish: "TREAT!", confetti: ["🍬", "🍭", "🍫", "🎃", "👻", "🦇"],
    trick: "💀 Trick! Fake hotel blocked", trickStep: "1 trick blocked 💀", misuse: "💀 Trick! Sneaky charge blocked", treat: "🍬 Treat!",
    swarm: "👻 Summon 60 visitors' agents", swarmBusy: "Summoning…", crowd: "👻 Tomorrow's crowd", spoof: "💀 trick: unverified", toggle: "🏁",
  },
};
const pickTheme = () => {
  const q = new URLSearchParams(location.search).get("theme");
  let saved = null; try { saved = localStorage.getItem("stadtgeist-theme"); } catch {}
  const d = new Date();
  return THEMES[q] ? q : THEMES[saved] ? saved : d.getMonth() === 9 && d.getDate() === 31 ? "halloween" : "rally";
};
let themeName = pickTheme();
let T = THEMES[themeName];
let CAT = T.cat;
const $ = (id) => document.getElementById(id);
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = { biz: new Map(), markers: new Map(), queries: {}, demand: {}, plan: null, planning: false, t: 600, playing: false, totals: { q: 0, b: 0 } };

// Basel's Rhine, roughly, for the offline twin (the online map has the real one).
const RHINE = [[7.6235, 47.5562], [7.6125, 47.5572], [7.6055, 47.5547], [7.5990, 47.5560], [7.5955, 47.5577], [7.5893, 47.5603], [7.5855, 47.5625], [7.5832, 47.5650], [7.5840, 47.5680], [7.5857, 47.5703], [7.5875, 47.5745], [7.5895, 47.5795]];
const LANDMARKS = [["Basel SBB", 7.5897, 47.5476], ["Badischer Bahnhof", 7.6075, 47.5672], ["Münster", 7.5925, 47.5563], ["Mittlere Brücke", 7.5893, 47.5603]];

async function pickStyle() {
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 3500);
    const r = await fetch("https://tiles.openfreemap.org/styles/liberty", { signal: ctl.signal });
    if (r.ok) return { style: await r.json(), online: true };
  } catch {}
  return { style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#1b1033" } }] }, online: false };
}

// Re-skin the street map in the current theme's colours.
function toonify(map) {
  const m = T.map;
  for (const l of map.getStyle().layers) {
    const id = l.id;
    if (/^(rhine|rhine-bank|swarm|ghosts|route-.*|pillars)$/.test(id)) continue;
    try {
      if (l.type === "background") map.setPaintProperty(id, "background-color", m.bg);
      else if (l.type === "fill") map.setPaintProperty(id, "fill-color", /water/.test(id) ? m.water : /park|grass|wood|green|forest/.test(id) ? m.park : /building/.test(id) ? m.building : m.land);
      else if (l.type === "line") {
        if (/water|river/.test(id)) map.setPaintProperty(id, "line-color", m.water);
        else if (/rail|transit/.test(id)) map.setPaintProperty(id, "line-color", m.rail);
        else if (/boundary/.test(id)) map.setLayoutProperty(id, "visibility", "none");
        else map.setPaintProperty(id, "line-color", /casing/.test(id) ? m.casing : m.road);
      } else if (l.type === "fill-extrusion") {
        map.setPaintProperty(id, "fill-extrusion-color", ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 10], ...m.ext]);
        map.setPaintProperty(id, "fill-extrusion-opacity", 0.92);
      } else if (l.type === "symbol") {
        if (/poi|housenumber/.test(id)) map.setLayoutProperty(id, "visibility", "none");
        else { map.setPaintProperty(id, "text-color", m.text); map.setPaintProperty(id, "text-halo-color", m.halo); map.setPaintProperty(id, "text-halo-width", 2); }
      }
    } catch {}
  }
}

// Colours of our own layers (river, route, ghosts, swarm).
function paintOverlays() {
  const m = T.map, set = (id, k, v) => map.getLayer(id) && map.setPaintProperty(id, k, v);
  if (!online) set("bg", "background-color", m.bg);
  set("rhine-bank", "line-color", m.bank); set("rhine-bank", "line-blur", m.bankBlur); set("rhine", "line-color", m.water);
  set("swarm", "line-color", m.swarm); set("ghosts", "line-color", m.ghost); set("ghosts", "line-opacity", m.ghostOp);
  set("route-glow", "line-color", m.glow); set("route-glow", "line-width", m.glowW); set("route-glow", "line-blur", m.glowBlur); set("route-glow", "line-opacity", m.glowOp);
  set("route-base", "line-color", m.base); set("route-walk", "line-color", m.walk); set("route-tram", "line-color", m.tram);
}

// Swap the whole look: stylesheet, map colours, words and decorations.
function applyTheme(name) {
  themeName = name; T = THEMES[name]; CAT = T.cat;
  try { localStorage.setItem("stadtgeist-theme", name); } catch {}
  $("halloweenCss").disabled = name !== "halloween";
  document.querySelector(".brand .logo").textContent = T.logo;
  document.querySelector(".brand .sub").textContent = T.sub;
  document.querySelector(".panel.left h2").textContent = T.h2;
  $("swarm").textContent = T.swarm; $("themeBtn").textContent = T.toggle;
  $("themeBtn").title = name === "halloween" ? "Switch to the everyday Kart Rally look" : "Switch to the Halloween look";
  document.querySelectorAll(".spooky").forEach((el) => (el.hidden = name !== "halloween"));
  if (typeof map !== "undefined") {
    if (online) toonify(map);
if (!online) map.setPaintProperty("bg", "background-color", T.map.bg);
    paintOverlays();
    for (const [id, m] of state.markers) {
      const b = state.biz.get(id);
      m.el.style.setProperty("--c", CAT[b.category] || "#fff");
      if (b.spoof) m.el.querySelector(".lbl small").textContent = T.spoof;
    }
    drawPillars();
  }
}
$("themeBtn").onclick = () => applyTheme(themeName === "halloween" ? "rally" : "halloween");

const { style, online } = await pickStyle();
const map = new maplibregl.Map({ container: "map", style, center: [7.5915, 47.5572], zoom: 14.4, pitch: 60, bearing: -24, antialias: true, attributionControl: { compact: true } });
await new Promise((r) => map.on("load", r));
if (online) toonify(map);
if (!online) map.setPaintProperty("bg", "background-color", T.map.bg);

const square = (lon, lat, s = 1) => { const dy = 0.00004 * s, dx = 0.00006 * s; return [[[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]]]; };
const fc = (features) => ({ type: "FeatureCollection", features });

if (!online) {
  map.addSource("rhine", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: RHINE } } });
  map.addLayer({ id: "rhine-bank", type: "line", source: "rhine", paint: { "line-color": "#7a2bd6", "line-blur": 8, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 16, 16, 90] }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "rhine", type: "line", source: "rhine", paint: { "line-color": "#3b2a9a", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 70] }, layout: { "line-cap": "round", "line-join": "round" } });
}
for (const [name, lon, lat] of LANDMARKS) { const el = document.createElement("div"); el.className = "landmark"; el.textContent = name; new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map); }

map.addSource("swarm", { type: "geojson", data: fc([]) });
map.addLayer({ id: "swarm", type: "line", source: "swarm", paint: { "line-color": "#b26bff", "line-width": 2, "line-opacity": 0.45 } });
map.addSource("ghosts", { type: "geojson", data: fc([]) });
map.addLayer({ id: "ghosts", type: "line", source: "ghosts", paint: { "line-color": "#e8e0ff", "line-width": 5, "line-opacity": 0.35, "line-blur": 3 } }); // ghost days
map.addSource("route", { type: "geojson", data: fc([]) });
// The chosen day is drawn as a race track: dark kerb, white track, red-and-white racing line.
map.addLayer({ id: "route-glow", type: "line", source: "route", paint: { "line-color": "#ff7a1a", "line-width": 20, "line-blur": 10, "line-opacity": 0.6 }, layout: { "line-cap": "round", "line-join": "round" } });
map.addLayer({ id: "route-base", type: "line", source: "route", paint: { "line-color": "#0d0618", "line-width": 11 }, layout: { "line-cap": "round", "line-join": "round" } });
map.addLayer({ id: "route-walk", type: "line", source: "route", filter: ["==", ["get", "mode"], "walk"], paint: { "line-color": "#ffb21a", "line-width": 5, "line-dasharray": [2, 2] } });
map.addLayer({ id: "route-tram", type: "line", source: "route", filter: ["==", ["get", "mode"], "tram"], paint: { "line-color": "#7cff4f", "line-width": 5, "line-dasharray": [1, 1] } });
map.addSource("pillars", { type: "geojson", data: fc([]) });
map.addLayer({ id: "pillars", type: "fill-extrusion", source: "pillars", paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.9 } });

// ---------- City state ----------
async function loadCity() {
  const city = await (await fetch("/api/city")).json();
  $("modeBadge").textContent = city.llm ? `🤖 ${city.llmModel}` : "🧭 Rule-based driver";
  $("modeBadge").classList.toggle("on", city.llm);
  if (!city.llm) { $("useLlm").checked = false; $("useLlm").disabled = true; }
  $("statBiz").textContent = city.businesses.filter((b) => !b.spoof).length;
  for (const b of city.businesses) {
    state.biz.set(b.id, b);
    state.queries[b.id] = b.stats.queries;
    if (!state.markers.has(b.id)) addBeacon(b);
  }
  state.totals.q = city.businesses.reduce((a, b) => a + b.stats.queries, 0);
  state.totals.b = city.businesses.reduce((a, b) => a + b.stats.bookings, 0);
  $("statQueries").textContent = state.totals.q; $("statBookings").textContent = state.totals.b;
  drawPillars();
}

function addBeacon(b) {
  const el = document.createElement("div");
  el.className = "beacon" + (b.spoof ? " spoof" : "");
  el.style.setProperty("--c", CAT[b.category] || "#fff");
  el.innerHTML = `<div class="ring"></div><div class="stem"></div><div class="core"></div><div class="tag"></div><div class="lbl">${esc(b.name)}<small>${b.spoof ? T.spoof : b.category}</small></div>`;
  const popup = new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${esc(b.name)}</b><br>${esc(b.tagline)}<br><br>
    ${b.spoof ? '<span style="color:#fb7185">Not signed by the Basel registry</span><br>' : ""}
    Agents: <code>${esc(b.mcpUrl.replace(/^https?:\/\/[^/]+/, ""))}</code><br>
    <a class="link" href="/b/${b.id}" target="_blank">Human page ↗</a> · <a class="link" href="/owner.html#${b.id}" target="_blank">Owner view ↗</a>`);
  const m = new maplibregl.Marker({ element: el }).setLngLat([b.geo.lon, b.geo.lat]).setPopup(popup).addTo(map);
  state.markers.set(b.id, { marker: m, el });
}

function drawPillars() {
  map.getSource("pillars").setData(fc([...state.biz.values()].filter((b) => !b.spoof).map((b) => {
    const demand = Object.values(state.demand[b.id] || {}).reduce((a, x) => a + x, 0);
    return { type: "Feature", properties: { color: CAT[b.category], h: 40 + Math.min(state.queries[b.id] || 0, 60) * 2 + Math.sqrt(demand) * 22 }, geometry: { type: "Polygon", coordinates: square(b.geo.lon, b.geo.lat, 1 + Math.min(demand, 30) / 30) } };
  })));
}

function ping(id) {
  const m = state.markers.get(id); if (!m) return;
  m.el.classList.remove("ping"); void m.el.offsetWidth; m.el.classList.add("ping");
}

function toast(html, good = false) {
  const t = $("toast"); t.innerHTML = html; t.className = "toast" + (good ? " good" : ""); t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 6000);
}

// ---------- Trace ----------
let traceN = 0;
function trace(text, cls = "") {
  const li = document.createElement("li"); li.className = cls;
  li.innerHTML = `<span class="t">${new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}</span>${text}`;
  $("trace").append(li); $("traceCount").textContent = `(${++traceN})`;
  li.scrollIntoView({ block: "nearest" });
}

// The five agent phases, shown as big icons instead of a wall of text.
const STEP_OF = { passport: "find", trust: "find", discover: "find", request: "find", verify: "check", hold: "book", rollback: "book", replan: "sim", confirm: "book", mandate: "pay" };
function step(name, status, bad = false) {
  const order = ["find", "check", "sim", "book", "pay"];
  const i = order.indexOf(name);
  document.querySelectorAll("#steps div").forEach((el, j) => { el.classList.toggle("done", j < i); el.classList.toggle("on", j === i); });
  const el = document.querySelector(`#steps [data-s="${name}"]`);
  if (status && el) { el.querySelector("small").textContent = status; el.classList.toggle("bad", bad); }
}
function say(text) { $("status").hidden = false; $("status").textContent = text; }
const resetSteps = () => document.querySelectorAll("#steps div").forEach((el) => { el.className = ""; el.querySelector("small").textContent = { find: "storefronts", check: "signatures", sim: "your day", book: "all at once", pay: "only what you OK'd" }[el.dataset.s]; });

// Live city events: every MCP call from any agent, including ones not started from this page.
const es = new EventSource("/api/events");
es.onmessage = (m) => {
  const e = JSON.parse(m.data);
  if (e.business) ping(e.business);
  if (e.type === "query") {
    state.queries[e.business] = (state.queries[e.business] || 0) + 1; $("statQueries").textContent = ++state.totals.q;
    if (state.planning && e.tool !== "get_business_card") trace(`MCP → <b>${esc(state.biz.get(e.business)?.name)}</b>.${e.tool}`, "mcp");
    drawPillarsSoon();
  }
  if (e.type === "booked") $("statBookings").textContent = ++state.totals.b;
  if (e.type === "payment_declined") toast(`💳 <b>Payment declined</b> at ${esc(state.biz.get(e.business)?.name)}<br>${esc(e.reason)}`);
  if (e.type === "agent_refused") trace(`⛔ ${esc(state.biz.get(e.business)?.name)} refused an unverified agent (${e.action})`, "declined");
  if (e.type === "owner_update") { trace(`✎ Owner of <b>${esc(state.biz.get(e.business)?.name)}</b> updated: ${e.patch.join(", ")}. Claims re-signed.`, "choose"); loadCity(); }
};
let pillarTimer; function drawPillarsSoon() { clearTimeout(pillarTimer); pillarTimer = setTimeout(drawPillars, 150); }

// ---------- Race moments ----------
function banner(text, cls = "", ms = 650) {
  const b = document.createElement("div"); b.className = "banner"; b.innerHTML = `<span class="${cls}">${text}</span>`;
  document.body.append(b); setTimeout(() => b.remove(), ms);
}
async function countdown() {
  for (const n of ["3", "2", "1"]) { banner(n); await new Promise((r) => setTimeout(r, 520)); }
  banner(T.go, "go", 800);
}
function confetti() {
  const colors = ["#ff3b3b", "#ffd23f", "#2fd36b", "#2f8cff", "#9b5cff", "#ff5fb4"];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement("div");
    if (T.confetti) { c.className = "confetti candy"; c.textContent = T.confetti[i % T.confetti.length]; }
    else { c.className = "confetti"; c.style.background = colors[i % colors.length]; }
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDuration = 1.6 + Math.random() * 1.8 + "s"; c.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.append(c); setTimeout(() => c.remove(), 4200);
  }
}

// ---------- Planning ----------
document.querySelectorAll("[data-wish]").forEach((b) => (b.onclick = () => ($("wish").value = b.dataset.wish)));
$("run").onclick = runPlan;

async function runPlan() {
  stop(); state.planning = true; $("run").disabled = true; $("trace").innerHTML = ""; traceN = 0;
  $("planPanel").hidden = true; $("summary").hidden = true; $("receipts").innerHTML = ""; $("rehearse").disabled = true; $("misuse").disabled = true;
  map.getSource("ghosts").setData(fc([])); map.getSource("route").setData(fc([]));
  resetSteps(); counts = {}; $("status").hidden = true;
  await countdown();
  const budget = Number(($("wish").value.match(/chf\s*(\d+)/i) || [])[1]) || 600;
  const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: $("wish").value, mode: $("useLlm").checked ? "auto" : "deterministic", budget }) });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n\n")) >= 0) { onPlanEvent(JSON.parse(buf.slice(6, i))); buf = buf.slice(i + 2); }
  }
  state.planning = false; $("run").disabled = false;
}

let counts = {};
function onPlanEvent(e) {
  if (e.type === "agent") {
    const sname = STEP_OF[e.step];
    if (e.step === "discover") { step("find", `${e.ids.length} found`); say(`🔍 Asking ${e.ids.length} storefronts…`); }
    else if (e.step === "verify") { step("check", "verified ✔"); say("🛡 Checking who is real…"); }
    else if (e.step === "hold") { counts.hold = (counts.hold || 0) + 1; step("book", `${counts.hold} held`); say(`🏁 Holding spot ${counts.hold}…`); }
    else if (e.step === "confirm") { counts.conf = (counts.conf || 0) + 1; step("book", `${counts.conf} booked`); }
    else if (e.step === "mandate") { step("pay", `CHF ${e.mandate?.maxTotal ?? ""} approved`); say("💳 Paying only what you approved"); }
    else if (e.step === "rollback") { step("book", "retrying", true); say("↩️ One spot was gone, replanning…"); }
    else if (sname) step(sname);
    if (e.step === "request") return trace(`Constraints: ${e.request.party_size} ${e.request.party_size > 1 ? "people" : "person"}${e.request.dog ? " + dog" : ""}, ${e.request.arrival.time} at ${e.request.arrival.place}, CHF ${e.request.budget}, likes ${e.request.interests.join(", ") || "anything"}`, "step");
    return trace(esc(e.text), e.step);
  }
  if (e.type === "reject") { step("check", T.trickStep, true); say(T.trick); return trace(`🛡 ${esc(e.text)}`, "reject"); }
  if (e.type === "llm_tool") return trace(`LLM → <b>${e.tool}</b>`, "thought");
  if (e.type === "thought") return trace(esc(e.text).slice(0, 400), "thought");
  if (e.type === "simulate") {
    step("sim", `${e.simulated} days tried`); say(`🔮 Tried ${e.simulated} versions of your day, ${e.feasible} work`);
    trace(`🔮 Simulated <b>${e.simulated}</b> versions of your day, ${e.feasible} survive. ${e.plans.map((p) => `${p.id}: ${p.score.total} pts, ${Math.round(p.robustness.onTime * 100)}% on time`).join(" · ")}`, "sim");
    const rej = Object.entries(e.rejected || {}); if (rej.length) trace(`Ruled out: ${rej.map(([id, r]) => esc(r)).join("; ")}`, "sim");
    state.podium = e.plans.slice(0, 3);
    map.getSource("ghosts").setData(fc(e.plans.slice(1).map((p) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: p.stops.map((s) => [s.geo.lon, s.geo.lat]) } }))));
    dimExcept(new Set(e.plans.flatMap((p) => p.stops.map((s) => s.id))));
    return;
  }
  if (e.type === "choose") { trace(`★ Chose <b>${e.plan.id}</b>: CHF ${e.plan.cost}, ${Math.round(e.plan.robustness.onTime * 100)}% on time in ${e.plan.robustness.rollouts} rollouts`, "choose"); return showPlan(e.plan, e.explanation); }
  if (e.type === "done") return finish(e.result, e.mode);
  if (e.type === "error") { trace(`Error: ${esc(e.message)}`, "reject"); }
}

function dimExcept(ids) { for (const [id, m] of state.markers) m.el.classList.toggle("dim", !ids.has(id)); }

// Turn a sentence of reasoning into a tiny badge.
function chip(x) {
  if (/^matches/.test(x)) return ["", "♥ " + x.replace("matches ", "").replace("halloween", "🎃")];
  if (/confirmed by on-site/.test(x)) return ["trust", "🐕 verified"];
  if (/dog-friendly/.test(x)) return ["trust", "🐕 ok"];
  if (/★/.test(x)) return ["trust", "★ " + x.match(/[\d.]+★/)[0].replace("★", "")];
  if (/check-in until/.test(x)) return ["", "🌙 " + x.replace("check-in until ", "")];
  if (/last free slot/.test(x)) return ["", "🔥 last slot"];
  if (/walk-in/.test(x)) return ["", "🚶 walk-in"];
  return null;
}

function showPlan(plan, explanation) {
  state.plan = plan;
  const why = new Map((explanation || []).map((x) => [x.business, x]));
  $("planPanel").hidden = false;
  $("planTitle").textContent = `🏆 Winning day · ${plan.id}`;
  $("kpis").innerHTML = [[`🪙 ${plan.cost}`, "CHF"], [`${plan.travelMinutes}′`, "moving"], [`${Math.round(plan.robustness.onTime * 100)}%`, "on time"], [plan.score.total, "points"]].map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join("");
  $("podium").hidden = (state.podium?.length || 0) < 2;
  $("podium").innerHTML = [1, 0, 2].map((i) => state.podium?.[i] ? `<div class="step p${i + 1}"><div>${state.podium[i].id}<br>${state.podium[i].score.total} pts</div><div class="block">${i + 1}</div></div>` : "").join("");
  $("timeline").innerHTML = plan.stops.map((s, i) => {
    const w = why.get(s.id);
    const b = state.biz.get(s.id);
    return `<li data-i="${i}"><span class="time">${s.time}</span>
      <div class="name">${b ? `<span class="dot" style="background:${CAT[b.category]}"></span>` : ""}${esc(s.name)}</div>
      ${s.label ? `<div class="label">${esc(s.label)}${s.cost ? ` · CHF ${Math.round(s.cost)}` : ""}</div>` : ""}
      ${s.leg ? `<div class="leg">${s.leg.mode === "tram" ? "🚋" : "🚶"} ${s.leg.minutes} min ${s.leg.mode}</div>` : ""}
      ${w ? `<div class="why">${w.why.map(chip).filter(Boolean).map(([c, t]) => `<span class="${c}">${esc(t)}</span>`).join("")}</div>
      <details><summary>Why this one?</summary>${w.why.map(esc).join("<br>")}${w.alternatives.length ? `<br><br><b>Not chosen:</b><br>${w.alternatives.map((a) => `${esc(a.name)}: ${esc(a.why)}`).join("<br>")}` : ""}</details>` : ""}
    </li>`;
  }).join("");
  // Draw the route with walk/tram styling.
  const feats = [];
  for (let i = 1; i < plan.stops.length; i++) {
    const a = plan.stops[i - 1], b = plan.stops[i];
    feats.push({ type: "Feature", properties: { mode: b.leg?.mode || "walk" }, geometry: { type: "LineString", coordinates: [[a.geo.lon, a.geo.lat], [b.geo.lon, b.geo.lat]] } });
  }
  map.getSource("route").setData(fc(feats));
  const bounds = new maplibregl.LngLatBounds(); plan.stops.forEach((s) => bounds.extend([s.geo.lon, s.geo.lat]));
  map.fitBounds(bounds, { padding: { top: 90, bottom: 120, left: 400, right: 430 }, pitch: 60, bearing: -24, duration: 1500 });
  state.t = toMin(plan.stops[0].time); setClock();
}

function finish(result, mode) {
  if (!result.ok) { trace(`Could not book a full plan: ${esc(result.reason || "")}`, "reject"); return; }
  if (result.summary) { $("summary").hidden = false; $("summary").textContent = result.summary.slice(0, 400); }
  const charged = result.receipts.reduce((a, r) => a + (r.payload.charged || 0), 0);
  $("receipts").innerHTML = `<div class="receiptLine">✔ ${result.receipts.length} bookings · 🪙 CHF ${charged} paid · rest on site</div>
    <details class="more"><summary>Signed receipts &amp; payment approval</summary>` +
    result.receipts.map((r) => `<div class="receipt">✔ <b>${esc(r.payload.name)}</b> · ${r.payload.payOnSite ? "pay on site" : `CHF ${r.payload.charged}`}<br><code>signed ${esc(r.signer)} · ${esc(r.signature.slice(0, 24))}…</code></div>`).join("") +
    (result.mandate ? `<div class="receipt" style="background:#fff6cf">💳 You approved: ${result.mandate.intents.map((i) => `${esc(state.biz.get(i.merchant)?.name)} ≤ CHF ${i.maxAmount}`).join(", ")}, ${esc(result.mandate.date)} only</div>` : "") +
    `</details>` +
    (result.sim?.alternatives?.length ? `<details class="more"><summary>Other days it simulated</summary>${result.sim.alternatives.map((p) => `<div class="alt">${p.id}: ${p.stops.filter((s) => s.id).map((s) => esc(s.name)).join(" → ")} · CHF ${p.cost}</div>`).join("")}</details>` : "");
  step("pay", `CHF ${charged} paid ✔`); document.querySelectorAll("#steps div").forEach((el) => { el.classList.remove("on"); el.classList.add("done"); });
  say(`${T.treat} ${result.receipts.length} places booked, CHF ${result.plan.cost}`);
  banner(T.finish, "go", 1600); confetti();
  trace(`🏁 Day booked by the ${mode === "llm" ? (result.model || "LLM") : "deterministic"} planner: ${result.receipts.length} signed receipts`, "confirm");
  $("rehearse").disabled = false; $("misuse").disabled = false;
  for (const m of state.markers.values()) m.el.classList.remove("dim");
}

// ---------- Rehearsal: the avatar lives the day in the twin ----------
const avatarEl = document.createElement("div"); avatarEl.className = "avatar"; avatarEl.textContent = "🏎️";
const avatar = new maplibregl.Marker({ element: avatarEl });

function positionAt(t) {
  const st = state.plan.stops;
  let active = 0;
  for (let i = 0; i < st.length; i++) {
    const s = st[i];
    const arrive = toMin(s.time);
    const depart = i === 0 ? arrive : toMin(st[i - 1].until);
    const legEnd = i === 0 ? arrive : depart + (s.leg?.minutes || 0);
    if (i > 0 && t >= depart && t < legEnd) {
      const p = (t - depart) / Math.max(1, legEnd - depart); const a = st[i - 1].geo;
      return { lon: a.lon + (s.geo.lon - a.lon) * p, lat: a.lat + (s.geo.lat - a.lat) * p, active: i, moving: true };
    }
    if (t >= legEnd) active = i;
  }
  return { ...st[active].geo, active, moving: false };
}

function setClock() {
  $("clock").textContent = hhmm(state.t); $("scrub").value = state.t;
  if (!state.plan) return;
  const p = positionAt(state.t);
  avatar.setLngLat([p.lon, p.lat]).addTo(map);
  document.querySelectorAll("#timeline li").forEach((li) => li.classList.toggle("active", Number(li.dataset.i) === p.active));
  return p;
}

let raf, lastTs, camTick = 0;
function play() {
  if (!state.plan) return;
  const end = toMin(state.plan.stops.at(-1).until) + 15;
  if (state.t >= end) state.t = toMin(state.plan.stops[0].time);
  state.playing = true; $("rehearse").textContent = "❚❚ Pause"; lastTs = null;
  const step = (ts) => {
    if (!state.playing) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
    const p = positionAt(state.t);
    state.t += dt * (p.moving ? 6 : 45); // slow down while travelling so the movement is visible
    const pos = setClock();
    if ((camTick += dt) > 0.6 && pos) { camTick = 0; map.easeTo({ center: [pos.lon, pos.lat], zoom: 15.6, pitch: 64, bearing: map.getBearing() + 4, duration: 900 }); }
    if (state.t >= end) return stop();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function stop() { state.playing = false; cancelAnimationFrame(raf); $("rehearse").textContent = "▶ Drive the day"; }
$("rehearse").onclick = () => (state.playing ? stop() : play());
$("scrub").oninput = () => { stop(); state.t = Number($("scrub").value); setClock(); };

// ---------- Trust demo ----------
$("misuse").onclick = async () => {
  const r = await (await fetch("/api/misuse", { method: "POST" })).json();
  if (r.declined) say(T.misuse);
  trace(`🕵 An upsell agent tried to charge the visitor's mandate at Basel Tourist Information: <b>${r.declined ? "declined" : "accepted"}</b>. ${esc(r.reason || "")}`, r.declined ? "declined" : "reject");
};

// ---------- City of agents ----------
$("swarm").onclick = async () => {
  $("swarm").disabled = true; $("swarm").textContent = T.swarmBusy;
  const r = await (await fetch("/api/swarm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: 60 }) })).json();
  state.demand = r.demand;
  map.getSource("swarm").setData(fc(r.trails.map((t) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: t.coords } }))));
  drawPillars();
  const rows = Object.entries(r.demand).map(([id, hours]) => {
    const total = Object.values(hours).reduce((a, b) => a + b, 0);
    const [peak, n] = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
    return { id, total, peak, n };
  }).sort((a, b) => b.total - a.total);
  const max = rows[0]?.total || 1;
  $("forecast").hidden = false;
  $("forecast").innerHTML = `<div style="grid-column:1/-1"><b>${T.crowd}</b> from ${r.planned} of ${r.agents} visitor agents planning their day. <span class="muted">Owners see this in their console.</span> <a href="#" id="closeF" class="link">close</a></div>` +
    rows.map((x) => `<div><div class="f"><span><span class="dot" style="background:${CAT[state.biz.get(x.id)?.category]}"></span>${esc(state.biz.get(x.id)?.name)}</span><b>${x.total}</b></div><div class="muted">peak ${x.peak}:00 (${x.n} people)</div><div class="bar" style="width:${(x.total / max) * 100}%"></div></div>`).join("");
  $("closeF").onclick = (ev) => { ev.preventDefault(); $("forecast").hidden = true; };
  $("swarm").disabled = false; $("swarm").textContent = T.swarm;
};

// Halloween night: a moon, drifting fog and a few bats.
document.body.insertAdjacentHTML("beforeend", `<div class="moon spooky"></div><div class="fog spooky"></div>` +
  [0, 1, 2, 3].map((i) => `<div class="bat spooky" style="top:${12 + i * 17}vh;animation-duration:${18 + i * 7}s;animation-delay:-${i * 5}s">🦇</div>`).join(""));

await loadCity();
applyTheme(themeName);
setClock();
