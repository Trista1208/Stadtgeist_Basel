// The planner agent's deterministic core: discover -> verify -> query -> simulate -> book.
// The LLM layer (llm.js) drives these same steps as tools; without an API key the
// pipeline runs on its own, still talking to every storefront over real MCP.
import { call } from "./mcpClient.js";
import { verifyEnvelope } from "../crypto.js";
import { simulate, toHHMM, interestHits } from "./simulator.js";

const REGISTRY = () => `${process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`}/mcp/registry`;

/** Turn free text into constraints. Used when no LLM is available, and as a sanity default. */
export function parseRequest(text, defaults = {}) {
  const t = text.toLowerCase();
  const noDog = /\b(no|without( a| my| our)?)\s+dogs?\b/.test(t);
  const hasDog = !noDog && /\bdogs?\b|\bpuppy\b/.test(t);
  const num = (re) => { const m = t.match(re); return m ? Number(m[1]) : undefined; };
  const time = t.match(/(?:at|arriv\w*|land\w*)\s*(?:at\s*)?(\d{1,2})[:.h]?(\d{2})?/);
  const interests = [];
  const add = (cond, ...tags) => cond && interests.push(...tags);
  add(/art|gallery|museum|exhibit/.test(t), "art");
  add(/rhine|river|swim/.test(t), "rhine");
  add(/fish/.test(t), "fish");
  add(/vegan|plant/.test(t), "vegan");
  add(/quiet|calm/.test(t), "quiet");
  add(/coffee/.test(t), "coffee");
  add(/brunch|breakfast/.test(t), "brunch");
  add(/local|made in basel|souvenir/.test(t), "local-design", "made-in-basel");
  add(hasDog, "dog-friendly");
  add(/halloween|spooky|pumpkin|ghost/.test(t), "halloween");
  const include = ["cafe", "experience", "restaurant", "hotel"];
  const shopping = /t-?shirt|shirt|shop|souvenir|tote|buy|l[äa]e?ckerli|biscuit/.test(t);
  if (shopping) include.splice(2, 0, "shop");
  if (/no hotel|day trip|leave in the evening/.test(t)) include.splice(include.indexOf("hotel"), 1);
  return {
    date: defaults.date || "2026-10-31",
    arrival: { place: /badischer/.test(t) ? "badischer-bahnhof" : /airport/.test(t) ? "euroairport" : "basel-sbb",
      time: time ? `${time[1].padStart(2, "0")}:${time[2] || "00"}` : "10:00" },
    party_size: num(/(\d+)\s*(?:people|persons|adults|guests|of us)/) || (/\b(solo|alone|just me|by myself)\b/.test(t) ? 1 : /\b(we|us|our|partner|couple|friend|wife|husband|girlfriend|boyfriend)\b/.test(t) ? 2 : /\b(i|me|my)\b/.test(t) ? 1 : 2),
    dog: hasDog,
    budget: num(/(?:chf|budget|under|max)\s*(\d{2,4})/) || num(/(\d{2,4})\s*(?:chf|francs)/) || 400,
    interests,
    include,
    dinnerAfter: "18:30",
    shopWish: shopping ? { keyword: /l[äa]e?ckerli|biscuit/.test(t) ? "läckerli" : /tote/.test(t) ? "tote" : "t-shirt", size: (t.match(/size\s*(xs|s|m|l|xl)\b/) || [, "m"])[1].toUpperCase() } : undefined,
    nights: num(/(\d+)\s*nights?/) || 1,
    ...defaults,
  };
}

/** Step 1-3: discover via registry, verify provenance, inspect cards, pull live availability. */
export async function survey(request, emit) {
  const anchors = await call(REGISTRY(), "trust_anchors");
  emit("agent", { step: "trust", text: `Loaded ${anchors.length} trust anchors (registry, tourism desk, reviews, payments)` });
  const registryKey = anchors.find((a) => a.role === "registry").publicKey;
  const attestorKeys = new Set(anchors.filter((a) => a.role === "attestor" || a.role === "reviews").map((a) => a.publicKey));

  const cats = request.include;
  const found = (await Promise.all(cats.map((category) => call(REGISTRY(), "search", { category })))).flat();
  emit("agent", { step: "discover", text: `Registry returned ${found.length} storefronts across ${cats.join(", ")}`, ids: found.map((f) => f.id) });

  const catalog = new Map();
  const rejected = [];
  await Promise.all(found.map(async (f) => {
    const listingCheck = verifyEnvelope(f.listing, registryKey);
    if (!listingCheck.ok) {
      rejected.push({ id: f.id, name: f.name, reason: `Listing not signed by the Basel registry (${listingCheck.reason}). Treated as untrusted.` });
      emit("reject", { business: f.id, text: `Rejected "${f.name}": listing ${listingCheck.reason === "signed by an unexpected key" ? "is self-signed, not registry-verified" : listingCheck.reason}` });
      return;
    }
    const card = await call(f.mcpUrl, "get_business_card");
    const ownerKey = f.listing.payload.publicKey;
    const verifiedClaims = [], badClaims = [];
    for (const c of card.claims) (verifyEnvelope(c, ownerKey).ok ? verifiedClaims : badClaims).push(c.payload);
    const attested = card.attestations.filter((a) => attestorKeys.has(a.publicKey) && verifyEnvelope(a).ok).map((a) => a.payload);
    const review = attested.find((a) => a.rating);
    const enriched = {
      ...card, verifiedClaims, badClaims,
      attestedClaims: attested.filter((a) => a.claim),
      rating: review ? { value: review.rating, count: review.count } : null,
    };
    const availability = await call(f.mcpUrl, "check_availability", { date: request.date, party_size: request.party_size, dog: request.dog });
    catalog.set(f.id, { card: enriched, availability, mcpUrl: f.mcpUrl });
  }));
  emit("agent", { step: "verify", text: `Verified ${catalog.size} storefronts: owner signatures checked, ${[...catalog.values()].reduce((n, b) => n + b.card.attestedClaims.length, 0)} third-party attestations confirmed` });
  return { catalog, rejected };
}

/** Why was each business in the chosen plan picked over its alternatives? */
export function explain(request, plan, sim, catalog) {
  return plan.stops.filter((s) => s.business).map((s) => {
    const c = s.business;
    const why = [];
    const tagHits = interestHits(request.interests, c).filter((i) => i !== "dog-friendly");
    if (tagHits.length) why.push(`matches ${tagHits.join(", ")}`);
    if (request.dog) {
      const att = c.attestedClaims.find((a) => a.claim === "dog_friendly");
      const own = c.verifiedClaims.find((v) => v.key === "dog_friendly");
      if (att) why.push("dog-friendly, signed by owner and confirmed by on-site inspection");
      else if (own?.value) why.push("dog-friendly (owner-signed claim)");
    }
    if (s.kind === "hotel") { const lc = c.verifiedClaims.find((v) => v.key === "late_check_in"); if (lc) why.push(`check-in until ${lc.value}`); }
    if (c.rating) why.push(`${c.rating.value}★ from ${c.rating.count} verified guests`);
    if (s.leg) why.push(`${s.leg.minutes} min ${s.leg.mode} from previous stop`);
    if (s.remaining === 1) why.push("last free slot at this time");
    if (s.walkIn) why.push("owner allows agents to read but not book, so planned as a walk-in");
    const alternatives = [...catalog.values()].filter((b) => b.card.category === c.category && b.card.id !== c.id)
      .map((b) => ({ name: b.card.name, why: sim.rejected[b.card.id] || "scored lower in simulation" }));
    return { business: c.id, name: c.name, kind: s.kind, time: toHHMM(s.start), why, alternatives };
  });
}

/** The visitor approves exactly this plan: one intent per merchant, item and amount. */
export function intentsFor(plan) {
  return plan.stops.filter((s) => s.book).map((s) => ({ merchant: s.business.id, name: s.business.name, item: s.item, maxAmount: Math.ceil(s.cost) }));
}

/**
 * Two-phase booking across independent businesses, like one cart spanning the city: hold
 * everything, and only if every hold succeeds, confirm with one intent-bound mandate.
 * Any failure releases all holds.
 */
export async function bookPlan(request, plan, catalog, { wallet, passport, guestName = "Visitor", emit }) {
  const holds = [];
  const bookable = plan.stops.filter((x) => x.book);
  try {
    for (const s of bookable) {
      const url = catalog.get(s.business.id).mcpUrl;
      const h = await call(url, "hold", { date: request.date, item: s.item, party_size: request.party_size, dog: request.dog, nights: request.nights || 1, guest_name: guestName, agent_passport: passport });
      holds.push({ stop: s, url, hold: h });
      emit("agent", { step: "hold", business: s.business.id, text: `Hold ${h.hold_id} at ${s.business.name}: ${s.label} (CHF ${h.amount}${h.payment.due_now ? "" : ", pay on site"})` });
    }
  } catch (e) {
    const failed = bookable[holds.length];
    emit("agent", { step: "rollback", business: failed?.business.id, text: `Hold failed at ${failed?.business.name}: ${e.message}. Releasing ${holds.length} holds.` });
    await Promise.all(holds.map((h) => call(h.url, "cancel", { id: h.hold.hold_id, agent_passport: passport }).catch(() => {})));
    return { ok: false, failedAt: failed?.business.id, reason: e.message };
  }
  // Ask the wallet for a mandate bound to exactly what is held: merchant, item, amount, date.
  const prepaid = holds.filter((h) => h.hold.payment.due_now);
  const intents = prepaid.map((h) => ({ merchant: h.stop.business.id, item: h.stop.item, maxAmount: h.hold.amount }));
  let mandate;
  try { mandate = wallet({ intents, date: request.date, maxTotal: intents.reduce((a, i) => a + i.maxAmount, 0) }); }
  catch (e) {
    await Promise.all(holds.map((h) => call(h.url, "cancel", { id: h.hold.hold_id, agent_passport: passport }).catch(() => {})));
    emit("agent", { step: "rollback", text: `${e.message}. Released all holds.` });
    return { ok: false, reason: e.message };
  }
  emit("agent", { step: "mandate", text: `Visitor's wallet signed an intent mandate: ${intents.map((i) => `${catalog.get(i.merchant).card.name} CHF ${i.maxAmount}`).join(", ")} (total CHF ${mandate.payload.maxTotal}, ${request.date} only)`, mandate: mandate.payload });
  const receipts = [];
  for (const h of holds) {
    const r = await call(h.url, "confirm", { hold_id: h.hold.hold_id, mandate: h.hold.payment.due_now ? mandate : undefined, agent_passport: passport });
    receipts.push(r);
    emit("agent", { step: "confirm", business: h.stop.business.id, text: `Confirmed ${r.payload.booking_id} at ${h.stop.business.name}${r.payload.charged ? `, charged CHF ${r.payload.charged}` : ""}. Receipt signed by the business.` });
  }
  return { ok: true, receipts, mandate };
}

/** Full autonomous loop with replanning when bookings fail. */
export async function runPlanner(request, { emit, wallet, passport, maxAttempts = 3 }) {
  emit("agent", { step: "request", text: "Constraints", request });
  let { catalog, rejected } = await survey(request, emit);
  let attempt = 0, sim, chosen, booking, blocked = new Set();
  while (attempt++ < maxAttempts) {
    for (const id of blocked) catalog.delete(id);
    sim = simulate(request, catalog);
    emit("simulate", { simulated: sim.simulated, feasible: sim.feasible, plans: sim.plans.map(slim), rejected: sim.rejected });
    if (!sim.plans.length) return { ok: false, reason: "No feasible plan", sim, rejectedListings: rejected };
    chosen = sim.plans[0];
    emit("choose", { plan: slim(chosen), explanation: explain(request, chosen, sim, catalog) });
    booking = await bookPlan(request, chosen, catalog, { wallet, passport, emit });
    if (booking.ok) break;
    // Refresh the business that failed, then re-simulate with the city as it is now.
    const failed = catalog.get(booking.failedAt);
    if (failed) failed.availability = await call(failed.mcpUrl, "check_availability", { date: request.date, party_size: request.party_size, dog: request.dog });
    emit("agent", { step: "replan", text: `Re-simulating with fresh availability from ${failed?.card.name}` });
  }
  return { ok: booking?.ok, mandate: booking?.mandate?.payload, plan: slim(chosen), explanation: explain(request, chosen, sim, catalog), receipts: booking?.receipts, sim: { simulated: sim.simulated, feasible: sim.feasible, alternatives: sim.plans.slice(1).map(slim) }, rejectedListings: rejected };
}

export function slim(p) {
  return {
    id: p.id, cost: p.cost, fares: p.fares, travelMinutes: p.travelMinutes, waitMinutes: p.waitMinutes, endsAt: p.endsAt, robustness: p.robustness, score: p.score,
    stops: p.stops.map((s) => ({ kind: s.kind, id: s.business?.id, name: s.business?.name || s.name, geo: s.geo, time: toHHMM(s.start), until: toHHMM(s.end), label: s.label, cost: s.cost, leg: s.leg })),
  };
}
