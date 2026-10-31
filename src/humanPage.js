// The human fallback: the very same signed business object, rendered as a plain page with
// schema.org JSON-LD. One source of truth serves agents and people; nothing is maintained twice.
import { businessCard } from "./world.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const schemaType = { hotel: "Hotel", restaurant: "Restaurant", cafe: "CafeOrCoffeeShop", experience: "ArtGallery", shop: "Store" };

export function humanPage(store) {
  const c = businessCard(store);
  const ld = { "@context": "https://schema.org", "@type": schemaType[c.category] || "LocalBusiness", name: c.name, description: c.tagline, address: c.address,
    geo: { "@type": "GeoCoordinates", latitude: c.geo.lat, longitude: c.geo.lon }, petsAllowed: c.dogs !== "not_allowed",
    potentialAction: { "@type": "ReserveAction", target: { "@type": "EntryPoint", urlTemplate: store.mcpUrl, encodingType: "application/mcp" } } };
  const att = new Set(c.attestations.filter((a) => a.payload.claim).map((a) => a.payload.claim));
  const rating = c.attestations.find((a) => a.payload.rating)?.payload;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.name)}</title><link rel="alternate" type="application/mcp" href="${esc(store.mcpUrl)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;color:#1d1d1f;background:#faf8f5}
h1{margin:0 0 4px}small,.muted{color:#6b6b6b}.claim{padding:8px 12px;border-left:3px solid #c0392b;background:#fff;margin:6px 0;border-radius:4px}
.badge{font-size:12px;padding:2px 6px;border-radius:10px;background:#e8f5ec;color:#1e6b3a;margin-left:6px}.warn{background:#fdecea;color:#a12}
code{font-size:12px;word-break:break-all}</style></head><body>
${store.spoof ? `<p class="claim"><b>Warning:</b> this listing is not verified by the Basel registry.</p>` : ""}
<h1>${esc(c.name)}</h1><div class="muted">${esc(c.address)}${rating ? ` · ${rating.rating}★ (${rating.count} verified guests)` : ""}</div>
<p><b>${esc(c.tagline)}</b></p><p>${esc(c.story)}</p>
${c.source.length ? `<p class="claim" style="font-size:13px">Real place. Public info from ${c.source.map((u) => `<a href="${esc(u)}">${esc(new URL(u).hostname)}</a>`).join(", ")}. Simulated for this demo: ${esc(c.simulated.join(", "))}. Claims marked (demo) are invented scenarios. Not affiliated with Stadtgeist.</p>` : ""}
<h3>What we promise</h3>
${c.claims.map((x) => `<div class="claim">${esc(x.payload.text)}<span class="badge">signed by owner</span>${att.has(x.payload.key) ? `<span class="badge">inspected</span>` : ""}</div>`).join("")}
<h3>Policies</h3><ul>${Object.entries(c.policies).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("")}</ul>
<p class="muted">Hours ${esc(c.hours.open)}–${esc(c.hours.close)}${c.hours.closed.length ? `, closed ${c.hours.closed.join(", ")}` : ""}</p>
<hr><small>This page and our agent storefront are generated from the same signed record.<br>Agents: <code>${esc(store.mcpUrl)}</code><br>Key: <code>${esc(store.identity.fingerprint)}</code></small>
</body></html>`;
}
