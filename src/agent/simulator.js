// "Simulate the city": build every combination of verified businesses into a day,
// schedule it against live availability, then stress-test each schedule with Monte Carlo
// rollouts (late trams, long lunches) to see which plans actually survive a real day.
import { leg, places } from "./city.js";

const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const toHHMM = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;
// Check-in "until 02:00" means 26:00 on the arrival day.
const untilMin = (s) => { const m = toMin(s); return m < 12 * 60 ? m + 24 * 60 : m; };

export const STAGES = ["cafe", "experience", "shop", "walk", "restaurant", "hotel"];

/**
 * @param request { date, arrival:{place,time}, party_size, dog, budget, interests[], include[], dinnerAfter, shopWish:{keyword,size}, nights }
 * @param catalog  Map id -> { card, availability, verification } for verified businesses only
 */
export function simulate(request, catalog, { topN = 4, rollouts = 400 } = {}) {
  const include = new Set(request.include);
  const byCat = (cat) => [...catalog.values()].filter((b) => b.card.category === cat);
  const options = {
    cafe: include.has("cafe") ? byCat("cafe") : [null],
    experience: include.has("experience") ? byCat("experience") : [null],
    shop: include.has("shop") ? byCat("shop") : [null],
    restaurant: include.has("restaurant") ? byCat("restaurant") : [null],
    hotel: include.has("hotel") ? byCat("hotel") : [null],
  };

  const plans = [];
  const rejected = new Map(); // business -> reason (first seen)
  let tried = 0;
  for (const cafe of options.cafe) for (const exp of options.experience) for (const shop of options.shop)
    for (const rest of options.restaurant) for (const hotel of options.hotel) {
      tried++;
      const r = schedule(request, { cafe, experience: exp, shop, restaurant: rest, hotel });
      if (r.ok) plans.push(r.plan);
      else if (r.blame && !rejected.has(r.blame)) rejected.set(r.blame, r.reason);
    }

  for (const p of plans) {
    p.robustness = monteCarlo(request, p, rollouts);
    p.score = scorePlan(request, p);
  }
  plans.sort((a, b) => b.score.total - a.score.total);

  // Keep the top plans but make them meaningfully different (not the same day with another café).
  const picked = [];
  for (const p of plans) {
    const sig = p.stops.filter((s) => s.business).map((s) => s.business.id);
    if (picked.every((q) => diff(q.sig, sig) >= 2)) picked.push({ ...p, sig });
    if (picked.length >= topN) break;
  }
  picked.forEach((p, i) => (p.id = `plan-${String.fromCharCode(65 + i)}`));
  return { simulated: tried, feasible: plans.length, plans: picked, rejected: Object.fromEntries(rejected) };
}

const diff = (a, b) => a.filter((x, i) => x !== b[i]).length;

function schedule(req, pick) {
  const party = req.party_size;
  let here = places[req.arrival.place]?.geo || places["basel-sbb"].geo;
  let t = toMin(req.arrival.time) + (places[req.arrival.place]?.extraMinutes || 0);
  const stops = [{ kind: "arrival", name: places[req.arrival.place]?.name || "Basel SBB", geo: here, start: t, end: t }];
  let cost = 0, travel = 0, wait = 0, fares = 0;

  const go = (geo) => {
    const l = leg(here, geo);
    t += l.minutes; travel += l.minutes; fares += l.fare * party; here = geo;
    return l;
  };

  for (const stage of STAGES) {
    if (stage === "walk") {
      if (!req.interests.includes("rhine")) continue;
      const l = go(places["rhine-walk"].geo);
      stops.push({ kind: "walk", name: "Rhine promenade walk", geo: here, leg: l, start: t, end: t + 45, cost: 0 });
      t += 45; continue;
    }
    const b = pick[stage];
    if (!b) continue;
    const { card, availability: av } = b;
    const walkIn = card.agentPolicy && (!card.agentPolicy.hold || !card.agentPolicy.book);
    if (card.agentPolicy && req.party_size > card.agentPolicy.maxPartySize) return { ok: false, blame: card.id, reason: `${card.name} takes agent bookings for up to ${card.agentPolicy.maxPartySize} people` };
    if (req.dog && card.dogs === "not_allowed") return { ok: false, blame: card.id, reason: `${card.name} does not allow dogs` };
    if (!av.open) return { ok: false, blame: card.id, reason: `${card.name} is closed on ${req.date} (${av.weekday})` };
    const l = go(card.geo);

    if (stage === "hotel") {
      const room = av.items.filter((i) => i.remaining > 0 && (i.capacity ?? 2) >= party).sort((a, b) => a.pricePerNight - b.pricePerNight)[0];
      if (!room) return { ok: false, blame: card.id, reason: `${card.name} has no rooms left` };
      const deadline = untilMin(av.checkInUntil);
      if (t > deadline) return { ok: false, blame: card.id, reason: `Arrival ${toHHMM(t)} is after ${card.name}'s last check-in (${av.checkInUntil})` };
      const price = room.pricePerNight * (req.nights || 1);
      cost += price;
      stops.push({ kind: stage, business: card, geo: card.geo, leg: l, start: t, end: t, item: room.item, label: room.label, cost: price, deadline, book: true });
      continue;
    }

    if (stage === "shop") {
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const kw = norm(req.shopWish?.keyword || "t-shirt");
      const size = req.shopWish?.size || "M";
      const match = av.items.find((i) => i.remaining > 0 && norm(i.label).includes(kw) && (i.size === size || i.size === "one"));
      if (!match) return { ok: false, blame: card.id, reason: `${card.name} has no ${req.shopWish?.keyword || "t-shirt"} in size ${size}` };
      const open = toMin(card.hours.open), close = toMin(card.hours.close);
      if (t < open) { wait += open - t; t = open; }
      if (t + av.durationMinutes > close) return { ok: false, blame: card.id, reason: `${card.name} closes at ${card.hours.close}` };
      cost += match.price;
      stops.push({ kind: stage, business: card, geo: card.geo, leg: l, start: t, end: t + av.durationMinutes, item: match.item, label: `${match.label} (${match.size})`, cost: match.price, book: true });
      t += av.durationMinutes; continue;
    }

    // Slot-based: café tables, experience tickets, restaurant tables.
    const earliest = stage === "restaurant" ? Math.max(t, toMin(req.dinnerAfter || "18:30")) : t;
    if (walkIn) {
      // The owner lets agents read but not book: plan it as a walk-in and don't reserve anything.
      const start = Math.max(earliest, toMin(card.hours.open));
      if (start + av.durationMinutes > toMin(card.hours.close)) return { ok: false, blame: card.id, reason: `${card.name} is closed by then` };
      const price = (av.price.perPersonEstimate || av.price.perTicket) * party;
      cost += price; wait += stage === "restaurant" ? 0 : start - t;
      stops.push({ kind: stage, business: card, geo: card.geo, leg: l, start, end: start + av.durationMinutes, label: "Walk-in (owner takes no agent bookings)", cost: price, book: false, walkIn: true });
      t = start + av.durationMinutes; continue;
    }
    const slot = av.items.find((i) => i.bookable && toMin(i.slot) >= earliest);
    if (!slot) return { ok: false, blame: card.id, reason: `${card.name} has no free slot after ${toHHMM(earliest)}` };
    const start = toMin(slot.slot);
    wait += stage === "restaurant" ? 0 : start - t; // waiting for dinner is just the afternoon
    const price = stage === "experience" ? av.price.perTicket * party : av.price.perPersonEstimate * party;
    cost += price;
    stops.push({ kind: stage, business: card, geo: card.geo, leg: l, start, end: start + av.durationMinutes, item: slot.item, label: stage === "experience" ? `${party} tickets, ${slot.slot}` : `Table for ${party}, ${slot.slot}`, cost: price, remaining: slot.remaining, book: true });
    t = start + av.durationMinutes;
  }

  cost += fares;
  if (cost > req.budget) return { ok: false, reason: `over budget (CHF ${Math.round(cost)})` };
  return { ok: true, plan: { stops, cost: Math.round(cost), fares: +fares.toFixed(2), travelMinutes: travel, waitMinutes: wait, endsAt: toHHMM(t) } };
}

// Box-Muller normal sample.
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** Re-run the day with noisy travel and stay times. A plan "survives" if every booking is met within 10 minutes. */
function monteCarlo(req, plan, n) {
  let ok = 0; const misses = {};
  for (let i = 0; i < n; i++) {
    let t = plan.stops[0].start; let survived = true;
    for (const s of plan.stops.slice(1)) {
      if (s.leg) t += s.leg.minutes * Math.exp(0.25 * gauss()) + (s.leg.mode === "tram" ? Math.random() * 8 : 0);
      const fixed = !s.walkIn && (s.kind === "cafe" || s.kind === "experience" || s.kind === "restaurant");
      if (fixed && t > s.start + 10) { survived = false; misses[s.business.name] = (misses[s.business.name] || 0) + 1; break; }
      if (s.kind === "hotel" && t > s.deadline) { survived = false; misses[s.business.name] = (misses[s.business.name] || 0) + 1; break; }
      const begin = fixed ? Math.max(t, s.start) : t;
      t = begin + (s.end - s.start) * (1 + 0.12 * gauss());
    }
    if (survived) ok++;
  }
  const weakest = Object.entries(misses).sort((a, b) => b[1] - a[1])[0];
  return { onTime: +(ok / n).toFixed(2), rollouts: n, weakestLink: weakest ? `${weakest[0]} (${Math.round((weakest[1] / n) * 100)}% of runs late)` : null };
}

function scorePlan(req, plan) {
  const biz = plan.stops.filter((s) => s.business);
  const interests = req.interests;
  let interest = 0, trust = 0, rating = 0;
  for (const s of biz) {
    const c = s.business;
    interest += interestHits(interests, c).length;
    trust += c.verifiedClaims.length * 0.5 + c.attestedClaims.length;
    rating += c.rating ? c.rating.value - 4 : 0;
  }
  // Food wishes are hard preferences for dinner: a vegan should not be sent to a fish house.
  const food = interests.filter((i) => ["vegan", "fish", "italian"].includes(i));
  const dinner = biz.find((x) => x.kind === "restaurant");
  if (food.length && dinner && !interestHits(food, dinner.business).length) interest -= 6;
  const s = {
    fit: Math.max(0, Math.min(30, interest * 4)),
    trust: Math.min(20, trust * 1.5),
    reputation: Math.max(0, Math.min(10, rating * 4)),
    budget: Math.round(15 * Math.max(0, 1 - plan.cost / req.budget) + 5),
    ease: Math.max(0, 10 - plan.travelMinutes / 8 - plan.waitMinutes / 15),
    robustness: 15 * plan.robustness.onTime,
  };
  for (const k in s) s[k] = +s[k].toFixed(1);
  return { ...s, total: +Object.values(s).reduce((a, b) => a + b, 0).toFixed(1) };
}

// An interest matches a business tag, or a verified claim about it (e.g. vegan -> vegan_options).
export function interestHits(interests, card) {
  const claimKeys = (card.verifiedClaims || []).filter((c) => c.value !== false).map((c) => c.key);
  return interests.filter((i) => card.tags.includes(i) || claimKeys.some((k) => k.startsWith(i) || k.includes(i.replace("-friendly", ""))));
}

export function fmt(plan) {
  return plan.stops.map((s) => `${toHHMM(s.start)} ${s.business?.name || s.name}${s.label ? " - " + s.label : ""}${s.leg ? ` (${s.leg.mode} ${s.leg.minutes} min)` : ""}`).join("\n");
}
export { toHHMM };
