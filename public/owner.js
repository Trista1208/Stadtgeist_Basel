// Same look as the city twin: ?theme=, then the saved choice, then Halloween on 31 Oct.
{
  const q = new URLSearchParams(location.search).get("theme");
  let saved = null; try { saved = localStorage.getItem("stadtgeist-theme"); } catch {}
  const d = new Date();
  const theme = q || saved || (d.getMonth() === 9 && d.getDate() === 31 ? "halloween" : "rally");
  const spooky = theme === "halloween";
  document.body.classList.toggle("halloween", spooky);
  document.getElementById("halloweenCss").disabled = !spooky;
  document.getElementById("logo").textContent = spooky ? "🎃" : "★";
}
// Owner console: the café owner's side of Stadtgeist.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const EXAMPLES = {
  restaurant: ["We're full at 19:00 and 19:30 tonight", "Today there's a vegan risotto", "Open again, back to normal"],
  cafe: ["No more tables today, we're fully booked", "Today we have a vegan carrot cake", "Dogs welcome inside"],
  hotel: ["We are fully booked tonight", "Dogs are not allowed anymore", "Open again, back to normal"],
  experience: ["Sold out at 12:00 and 13:00", "Dogs welcome on a leash", "Open again, back to normal"],
  shop: ["Pause, we are closed today for inventory", "Open again, back to normal"],
};
let id = location.hash.slice(1) || "goldener-fisch";
let data;

const city = await (await fetch("/api/city")).json();
$("pick").innerHTML = city.businesses.filter((b) => !b.spoof).map((b) => `<option value="${b.id}">${esc(b.name)} · ${b.category}</option>`).join("");
$("pick").value = id;
$("pick").onchange = () => { id = $("pick").value; location.hash = id; $("feed").innerHTML = ""; load(); };

async function load() {
  data = await (await fetch(`/api/owner/${id}`)).json();
  const p = data.profile, card = data.card;
  $("bizName").textContent = p.name; $("bizTag").textContent = p.tagline; $("human").href = `/b/${id}`;
  $("kQ").textContent = data.stats.queries; $("kH").textContent = data.stats.holds; $("kB").textContent = data.stats.bookings;
  const attested = new Set(card.attestations.filter((a) => a.payload.claim).map((a) => a.payload.claim));
  const rating = card.attestations.find((a) => a.payload.rating)?.payload;
  $("claims").innerHTML = card.claims.map((c) => `<div class="c"><span>${esc(c.payload.text)}</span><span><span class="tag sig" title="${esc(c.signature)}">signed ${esc(c.signer.slice(8, 16))}</span>${attested.has(c.payload.key) ? ' <span class="tag att">inspected</span>' : ""}</span></div>`).join("") +
    (rating ? `<div class="c"><span>${rating.rating}★ from ${rating.count} verified guests</span><span class="tag att">Basel Guest Reviews</span></div>` : "");
  const sold = new Set(data.overrides.soldOut);
  $("slots").innerHTML = data.availability.open
    ? data.availability.items.map((i) => `<span class="slot ${sold.has(i.item) || sold.has("*") ? "out" : ""}" data-item="${esc(i.item)}">${esc(i.label ? `${i.label}${i.size ? " " + i.size : ""}` : i.item)} · ${i.remaining} left</span>`).join("")
    : `<span class="muted">Closed for agents today.</span>`;
  document.querySelectorAll(".slot").forEach((el) => (el.onclick = () => {
    const item = el.dataset.item; const next = new Set(data.overrides.soldOut); next.delete("*");
    next.has(item) ? next.delete(item) : next.add(item);
    update({ soldOut: [...next] });
  }));
  $("pause").textContent = data.overrides.paused ? "Resume agent bookings" : "Pause agent bookings";
  $("pause").onclick = () => update({ paused: !data.overrides.paused });
  const pol = p.agentPolicy;
  const row = (k, label) => `<label>${label}<input type="checkbox" data-k="${k}" ${pol[k] ? "checked" : ""}></label>`;
  $("policy").innerHTML = row("read", "Read my offer and availability") + row("hold", "Place 10-minute holds") + row("book", "Confirm bookings") + row("cancel", "Cancel on the guest's behalf") +
    row("requireVerifiedAgent", "Only agents with a verified passport") +
    `<label>Largest party an agent may book<input type="number" min="1" max="20" value="${pol.maxPartySize}" id="maxParty" style="width:60px"></label>`;
  document.querySelectorAll("#policy input[type=checkbox]").forEach((el) => (el.onchange = () => update({ agentPolicy: { [el.dataset.k]: el.checked } })));
  $("maxParty").onchange = () => update({ agentPolicy: { maxPartySize: Number($("maxParty").value) } });
  $("examples").innerHTML = (EXAMPLES[p.category] || []).map((e) => `<button>${esc(e)}</button>`).join("");
  document.querySelectorAll("#examples button").forEach((b) => (b.onclick = () => { $("say").value = b.textContent; say(); }));
  $("raw").textContent = JSON.stringify({ listing: card.listing.payload, signer: card.listing.signer, offerSummary: card.offerSummary, agentPolicy: card.agentPolicy, claims: card.claims.map((c) => ({ ...c.payload, signature: c.signature.slice(0, 24) + "…" })) }, null, 2);
  loadForecast();
}

async function update(patch) {
  await fetch(`/api/owner/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  load();
}

async function say() {
  const text = $("say").value.trim(); if (!text) return;
  $("sayBtn").disabled = true; $("reply").textContent = "…";
  const r = await (await fetch(`/api/owner/${id}/say`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })).json();
  $("reply").textContent = r.error ? `Error: ${r.error}` : `✔ ${r.reply}`;
  $("sayBtn").disabled = false; $("say").value = "";
  load();
}
$("sayBtn").onclick = say;
$("say").onkeydown = (e) => e.key === "Enter" && say();

async function loadForecast() {
  const f = await (await fetch("/api/forecast")).json();
  const hours = f.demand?.[id];
  if (!hours) { $("bars").innerHTML = ""; return; }
  const max = Math.max(...Object.values(hours));
  const total = Object.values(hours).reduce((a, b) => a + b, 0);
  const [peak, n] = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
  $("fcHint").textContent = `${total} people across ${f.planned} visitor agents plan to come. Peak at ${peak}:00 with ${n} people.`;
  $("bars").innerHTML = Array.from({ length: 15 }, (_, i) => i + 8).map((h) => `<div style="height:${((hours[h] || 0) / max) * 100}%" title="${hours[h] || 0} people"><span>${h}</span></div>`).join("");
}

const es = new EventSource("/api/events");
es.onmessage = (m) => {
  const e = JSON.parse(m.data);
  if (e.type === "forecast") loadForecast();
  if (e.business !== id) return;
  const text = { query: `Agent called <b>${esc(e.tool)}</b>`, hold: `Hold on ${esc(e.item)} (CHF ${e.amount})`, booked: `<b>Booked</b> ${esc(e.item)} (CHF ${e.amount})`, released: `Hold released on ${esc(e.item)}`,
    payment_declined: `Payment declined: ${esc(e.reason)}`, agent_refused: `Refused an unverified agent (${esc(e.action)})`, owner_update: `You updated: ${esc(e.patch?.join(", "))}` }[e.type];
  if (!text) return;
  if ($("feed").querySelector(".muted")) $("feed").innerHTML = "";
  $("feed").insertAdjacentHTML("afterbegin", `<li><span class="muted">${new Date(e.at).toLocaleTimeString()}</span> ${text}</li>`);
  if (["hold", "booked", "released"].includes(e.type)) load();
  else if (e.type === "query") $("kQ").textContent = Number($("kQ").textContent) + 1;
};

load();
