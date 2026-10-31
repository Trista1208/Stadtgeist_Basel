// The simulated city: every business's live state (inventory, holds, bookings), the
// trust infrastructure (registry, attestors, payment network) and an event bus that the
// UI listens to so judges can watch agents move through the city.
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { businesses as seed, spoofListing } from "../data/businesses.js";
import { newIdentity, signEnvelope, verifyEnvelope } from "./crypto.js";

export const bus = new EventEmitter();
bus.setMaxListeners(100);
export const emit = (type, data) => bus.emit("event", { type, at: new Date().toISOString(), ...data });

export const BASE_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;
const YEAR = 365 * 24 * 3600 * 1000;

// ---- Trust anchors -------------------------------------------------------
export const registryId = newIdentity("Basel Business Registry (demo)");
export const tourismId = newIdentity("Basel Tourism Quality Desk (demo)");
export const reviewsId = newIdentity("Basel Guest Reviews (demo)");
export const paymentNetworkId = newIdentity("Demo Payment Network");
export const agentNetworkId = newIdentity("Basel Agent Trust Network (demo)");

export const trustAnchors = [
  { role: "registry", name: registryId.label, publicKey: registryId.publicKey, fingerprint: registryId.fingerprint },
  { role: "attestor", name: tourismId.label, publicKey: tourismId.publicKey, fingerprint: tourismId.fingerprint },
  { role: "reviews", name: reviewsId.label, publicKey: reviewsId.publicKey, fingerprint: reviewsId.fingerprint },
  { role: "payments", name: paymentNetworkId.label, publicKey: paymentNetworkId.publicKey, fingerprint: paymentNetworkId.fingerprint },
  { role: "agent-network", name: agentNetworkId.label, publicKey: agentNetworkId.publicKey, fingerprint: agentNetworkId.fingerprint },
];

// ---- Agent identity --------------------------------------------------------
// One shared passport: once the network has verified an agent, every storefront recognises it.
export function issueAgentPassport({ agent, operator, onBehalfOf }) {
  return signEnvelope(agentNetworkId, {
    agentId: "agt_" + randomUUID().slice(0, 8), agent, operator, onBehalfOf,
    verifiedAt: new Date().toISOString(), level: "verified-operator",
    expires: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  });
}

// What agents may do here. The owner decides; storefronts enforce it on every call.
export const defaultAgentPolicy = { read: true, hold: true, book: true, cancel: true, requireVerifiedAgent: true, maxPartySize: 8 };

function checkAgent(store, action, passport, party_size) {
  const pol = store.profile.agentPolicy;
  if (!pol[action]) throw new Error(`Policy: ${store.profile.name} does not let agents ${action}. Ask the human to contact the business.`);
  if (pol.requireVerifiedAgent && action !== "read") {
    const v = verifyEnvelope(passport, agentNetworkId.publicKey);
    if (!v.ok) {
      emit("agent_refused", { business: store.id, action, reason: "unverified agent" });
      throw new Error(`Policy: ${store.profile.name} only accepts ${action} requests from verified agents (${v.reason})`);
    }
  }
  if (party_size && party_size > pol.maxPartySize) throw new Error(`Policy: agents may book at most ${pol.maxPartySize} people here; larger groups go to a human`);
  return passport?.payload;
}

// Third parties vouch for a few claims after inspecting them (the "verified" layer).
const inspected = {
  "hotel-rheinblick": ["dog_friendly", "late_check_in"],
  "cafe-kleinbasel": ["vegan_options"],
  "goldener-fisch": ["rhine_view"],
  "galerie-rheinsprung": ["rhine_view"],
  "basler-faden": ["made_in_basel"],
  "spalen-loft": ["dog_friendly"],
};
// Trois Rois (9.4/10, 200 reviews) and tibits (4.5, 114 reviews) are public ratings; the rest are demo values.
const reviews = {
  "hotel-rheinblick": [4.4, 380], "hotel-gare": [4.0, 900], "spalen-loft": [4.7, 200],
  "cafe-kleinbasel": [4.5, 610], "roesterei-muensterberg": [4.7, 240],
  "kunstmuseum": [4.7, 1500], "galerie-rheinsprung": [4.6, 1100],
  "basler-faden": [4.6, 420], "rhywelle": [4.4, 150],
  "goldener-fisch": [4.5, 300], "brasserie-steinen": [4.5, 114], "osteria-pfalz": [4.3, 260],
};

// ---- Businesses ------------------------------------------------------------
export const stores = new Map(); // id -> store

function makeStore(profile, { spoof = false } = {}) {
  const identity = newIdentity(profile.name);
  const store = {
    id: profile.id,
    profile: { agentPolicy: { ...defaultAgentPolicy }, ...structuredClone(profile) },
    identity,
    spoof,
    mcpUrl: `${BASE_URL}/mcp/${profile.id}`,
    occupancy: new Map(), // `${date}|${itemKey}` -> used units
    holds: new Map(),
    bookings: new Map(),
    overrides: { soldOut: new Set(), paused: false }, // owner controls
    stats: { queries: 0, holds: 0, bookings: 0, lostTo: {} },
  };
  signAll(store);
  stores.set(store.id, store);
  return store;
}

/** (Re)sign everything the business publishes. Called again whenever the owner edits. */
export function signAll(store) {
  const p = store.profile;
  const now = new Date();
  store.signedClaims = p.claims.map((c) =>
    signEnvelope(store.identity, { business: p.id, ...c, issuedAt: now.toISOString(), expires: new Date(+now + YEAR).toISOString() }),
  );
  if (store.spoof) {
    // Spoofer self-signs a "listing"; the registry never signed it.
    store.listing = signEnvelope(store.identity, listingPayload(store));
    store.attestations = [];
    return;
  }
  store.listing = signEnvelope(registryId, listingPayload(store));
  store.attestations = [
    ...(inspected[p.id] || [])
      .filter((key) => p.claims.some((c) => c.key === key))
      .map((key) => signEnvelope(tourismId, {
        business: p.id, claim: key, value: p.claims.find((c) => c.key === key).value,
        statement: "Inspected on site", inspectedOn: "2026-09-18",
      })),
    ...(reviews[p.id] ? [signEnvelope(reviewsId, { business: p.id, rating: reviews[p.id][0], count: reviews[p.id][1], window: "last 24 months", verifiedStaysOnly: true })] : []),
  ];
}

function listingPayload(store) {
  const p = store.profile;
  return {
    business: p.id, name: p.name, category: p.category, address: p.address, geo: p.geo,
    mcpUrl: store.mcpUrl, humanUrl: `${BASE_URL}/b/${p.id}`,
    publicKey: store.identity.publicKey,
    legalEntity: store.spoof ? "unknown" : `CHE-${(hash(p.id) % 900 + 100)}.${(hash(p.name) % 900 + 100)}.${(hash(p.address) % 900 + 100)} (demo)`,
  };
}

function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; }
function rand(seedStr) { return (hash(seedStr) % 10000) / 10000; }

for (const b of seed) makeStore(b);
makeStore(spoofListing, { spoof: true });

// ---- Time helpers -----------------------------------------------------------
export const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const toHHMM = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const weekday = (date) => DAYS[new Date(date + "T12:00:00Z").getUTCDay()];

// ---- Inventory ---------------------------------------------------------------
function capacityOf(store, itemKey) {
  const o = store.profile.offer;
  if (o.kind === "rooms") return o.rooms.find((r) => r.type === itemKey)?.count ?? 0;
  if (o.kind === "tables") return o.tables;
  if (o.kind === "tickets") return o.capacityPerSlot;
  if (o.kind === "products") { const [sku, size] = itemKey.split(":"); return o.products.find((p) => p.sku === sku)?.stock?.[size] ?? 0; }
  return 0;
}

/** Seeded "other guests" so the city feels busy, plus confirmed bookings and live holds. */
function used(store, date, itemKey) {
  const k = `${date}|${itemKey}`;
  if (!store.occupancy.has(k)) {
    const cap = capacityOf(store, itemKey);
    let base = Math.floor(rand(k) * cap * 0.75);
    // Make the 19:00/19:30 fish dinner scarce on purpose: a good demo needs contention.
    if (store.id === "goldener-fisch" && /\|(19:00|19:30)$/.test(k)) base = cap - 1;
    if (store.profile.offer.kind === "products") base = 0;
    store.occupancy.set(k, base);
  }
  let n = store.occupancy.get(k);
  for (const h of store.holds.values()) if (h.status === "held" && h.date === date && h.itemKey === itemKey && h.expiresAt > Date.now()) n += h.units;
  return n;
}

function slotsFor(store, date) {
  const o = store.profile.offer;
  const out = [];
  for (let t = toMin(o.first); t <= toMin(o.last); t += o.slotMinutes) out.push(toHHMM(t));
  return out;
}

export function availability(store, { date, party_size = 2, dog = false }) {
  const p = store.profile;
  const o = p.offer;
  const closedToday = p.hours.closed.includes(weekday(date)) || store.overrides.paused;
  const base = {
    business: p.id, date, weekday: weekday(date), open: !closedToday,
    hours: `${p.hours.open}-${p.hours.close}`, dogs: p.dogs,
    dogWarning: dog && p.dogs === "not_allowed" ? "Dogs are not allowed here" : undefined,
  };
  if (closedToday) return { ...base, items: [] };
  const soldOut = (key) => store.overrides.soldOut.has(key) || store.overrides.soldOut.has("*");
  if (o.kind === "rooms") {
    return { ...base, checkInFrom: o.checkInFrom, checkInUntil: o.checkInUntil, items: o.rooms
      .filter((r) => r.capacity >= Math.min(party_size, 2) || party_size === 1)
      .map((r) => ({ item: r.type, label: r.label, capacity: r.capacity, pricePerNight: r.price + (dog ? p.extraFees?.dog || 0 : 0), remaining: soldOut(r.type) ? 0 : Math.max(0, r.count - used(store, date, r.type)) })) };
  }
  if (o.kind === "tables" || o.kind === "tickets") {
    const tablesNeeded = o.kind === "tables" ? Math.ceil(party_size / 4) : party_size;
    return { ...base, durationMinutes: o.durationMinutes,
      price: o.kind === "tables" ? { perPersonEstimate: o.perPerson } : { perTicket: o.price },
      items: slotsFor(store, date).map((slot) => {
        const left = soldOut(slot) ? 0 : capacityOf(store, slot) - used(store, date, slot);
        return { item: slot, slot, remaining: Math.max(0, left), bookable: left >= tablesNeeded };
      }) };
  }
  if (o.kind === "products") {
    return { ...base, durationMinutes: o.durationMinutes, items: o.products.flatMap((pr) => Object.keys(pr.stock).map((size) => {
      const key = `${pr.sku}:${size}`;
      return { item: key, label: pr.label, size, price: pr.price, remaining: soldOut(pr.sku) ? 0 : Math.max(0, pr.stock[size] - used(store, date, key)) };
    })) };
  }
}

function priceFor(store, { itemKey, party_size, dog, nights = 1 }) {
  const p = store.profile; const o = p.offer;
  if (o.kind === "rooms") return (o.rooms.find((r) => r.type === itemKey).price + (dog ? p.extraFees?.dog || 0 : 0)) * nights;
  if (o.kind === "tables") return o.perPerson * party_size; // estimate, paid on site
  if (o.kind === "tickets") return o.price * party_size;
  if (o.kind === "products") { const [sku] = itemKey.split(":"); return o.products.find((x) => x.sku === sku).price; }
}

const HOLD_MS = 10 * 60 * 1000;

export function placeHold(store, { date, item, party_size = 2, dog = false, guest_name = "Guest", nights = 1, agent_passport }) {
  const p = store.profile; const o = p.offer;
  const agent = checkAgent(store, "hold", agent_passport, party_size);
  if (store.overrides.paused) throw new Error(`${p.name} is not taking bookings right now`);
  if (dog && p.dogs === "not_allowed") throw new Error(`${p.name} does not allow dogs`);
  const av = availability(store, { date, party_size, dog });
  if (!av.open) throw new Error(`${p.name} is closed on ${date}`);
  const row = av.items.find((i) => i.item === item);
  if (!row) throw new Error(`Unknown item '${item}'`);
  const units = o.kind === "tables" ? Math.ceil(party_size / 4) : o.kind === "tickets" ? party_size : 1;
  if (row.remaining < units) {
    emit("hold_failed", { business: p.id, item, reason: "sold out" });
    throw new Error(`Sold out: ${item} on ${date} at ${p.name}`);
  }
  const hold = {
    id: "hold_" + randomUUID().slice(0, 8), business: p.id, category: p.category, agent: agent?.agentId, date, itemKey: item, units, party_size, dog, guest_name, nights,
    amount: priceFor(store, { itemKey: item, party_size, dog, nights }),
    payOnSite: o.kind === "tables",
    status: "held", expiresAt: Date.now() + HOLD_MS,
  };
  store.holds.set(hold.id, hold);
  store.stats.holds++;
  emit("hold", { business: p.id, item, holdId: hold.id, amount: hold.amount });
  return {
    hold_id: hold.id, expires_in_seconds: HOLD_MS / 1000, item, date,
    amount: hold.amount, currency: "CHF",
    payment: hold.payOnSite
      ? { due_now: 0, note: "Estimate only, pay at the table. No mandate needed to confirm." }
      : { due_now: hold.amount, accepts: ["intent-mandate"], note: "Confirm with an intent mandate naming this merchant, this item and an amount at least this high." },
    cancellation: p.policies.cancellation,
  };
}

// The payment network tracks how much of each mandate has been spent, across all merchants.
const mandateSpend = new Map();

/**
 * Intent mandate: the payment credential is bound to what the visitor approved, i.e. which
 * merchants, which items, how much and on which date. Anything else is declined before it clears.
 * intents: [{ merchant, item?, maxAmount }]
 */
export function issueMandate({ holder, maxTotal, purpose, date, intents }) {
  return signEnvelope(paymentNetworkId, {
    mandate: "mdt_" + randomUUID().slice(0, 8), type: intents ? "intent" : "budget", holder, maxTotal, currency: "CHF", purpose, date,
    intents: intents || null,
    expires: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
  });
}

function checkIntent(store, hold, mandate) {
  const v = verifyEnvelope(mandate, paymentNetworkId.publicKey);
  if (!v.ok) throw new Error(`Payment declined: mandate ${v.reason}`);
  const m = mandate.payload;
  if (m.date && m.date !== hold.date) throw new Error(`Payment declined: mandate is for ${m.date}, booking is for ${hold.date}`);
  if (m.intents) {
    const intent = m.intents.find((i) => i.merchant === store.id);
    if (!intent) throw new Error(`Payment declined: the visitor never approved buying from ${store.profile.name}`);
    if (intent.item && intent.item !== hold.itemKey) throw new Error(`Payment declined: approved item was '${intent.item}', not '${hold.itemKey}'`);
    if (hold.amount > intent.maxAmount) throw new Error(`Payment declined: CHF ${hold.amount} exceeds the approved CHF ${intent.maxAmount} for ${store.profile.name}`);
  }
  const spent = mandateSpend.get(m.mandate) || 0;
  if (spent + hold.amount > m.maxTotal) throw new Error(`Payment declined: mandate limit exceeded (CHF ${spent} of ${m.maxTotal} used)`);
  return m;
}

export function confirmHold(store, { hold_id, mandate, agent_passport }) {
  checkAgent(store, "book", agent_passport);
  const hold = store.holds.get(hold_id);
  if (!hold) throw new Error(`Unknown hold ${hold_id}`);
  if (hold.status !== "held") throw new Error(`Hold ${hold_id} is ${hold.status}`);
  if (hold.expiresAt < Date.now()) { hold.status = "expired"; throw new Error("Hold expired"); }
  let charged = 0;
  if (!hold.payOnSite) {
    let m;
    try { m = checkIntent(store, hold, mandate); }
    catch (e) { emit("payment_declined", { business: store.id, reason: e.message }); throw e; }
    mandateSpend.set(m.mandate, (mandateSpend.get(m.mandate) || 0) + hold.amount);
    charged = hold.amount;
  }
  hold.status = "confirmed";
  store.occupancy.set(`${hold.date}|${hold.itemKey}`, (store.occupancy.get(`${hold.date}|${hold.itemKey}`) || 0) + hold.units);
  const booking = { booking_id: "bk_" + randomUUID().slice(0, 8), business: store.id, name: store.profile.name, date: hold.date, item: hold.itemKey, party_size: hold.party_size, dog: hold.dog, guest_name: hold.guest_name, amount: hold.amount, charged, payOnSite: hold.payOnSite, status: "confirmed" };
  store.bookings.set(booking.booking_id, { ...booking, holdId: hold_id });
  store.stats.bookings++;
  emit("booked", { business: store.id, item: hold.itemKey, bookingId: booking.booking_id, amount: hold.amount });
  // The receipt is signed by the business, so the guest holds proof of the booking.
  return signEnvelope(store.identity, booking);
}

export function cancel(store, { id, agent_passport }) {
  checkAgent(store, "cancel", agent_passport);
  const hold = store.holds.get(id);
  if (hold) {
    if (hold.status === "confirmed") throw new Error("Already confirmed; cancel the booking id instead");
    hold.status = "released";
    emit("released", { business: store.id, item: hold.itemKey, holdId: id });
    return { released: id };
  }
  const b = store.bookings.get(id);
  if (!b) throw new Error(`Unknown id ${id}`);
  if (b.status === "cancelled") return { cancelled: id };
  b.status = "cancelled";
  const k = `${b.date}|${b.item}`;
  store.occupancy.set(k, Math.max(0, (store.occupancy.get(k) || 0) - (store.holds.get(b.holdId)?.units || 1)));
  emit("cancelled", { business: store.id, bookingId: id });
  return { cancelled: id, refund: b.charged, policy: store.profile.policies.cancellation };
}

export function businessCard(store) {
  const p = store.profile;
  return {
    id: p.id, name: p.name, category: p.category, tagline: p.tagline, story: p.story,
    address: p.address, geo: p.geo, hours: p.hours, dogs: p.dogs, tags: p.tags,
    offerSummary: summarizeOffer(p.offer), policies: p.policies, agentPolicy: p.agentPolicy,
    listing: store.listing, claims: store.signedClaims, attestations: store.attestations,
    humanPage: `${BASE_URL}/b/${p.id}`,
    source: p.source || [], simulated: p.simulated || [],
  };
}

function summarizeOffer(o) {
  if (o.kind === "rooms") return { kind: "rooms", checkInFrom: o.checkInFrom, checkInUntil: o.checkInUntil, rooms: o.rooms.map(({ type, label, price, capacity }) => ({ type, label, price, capacity })) };
  if (o.kind === "tables") return { kind: "tables", perPersonEstimate: o.perPerson, durationMinutes: o.durationMinutes, firstSeating: o.first, lastSeating: o.last };
  if (o.kind === "tickets") return { kind: "tickets", price: o.price, durationMinutes: o.durationMinutes, firstEntry: o.first, lastEntry: o.last };
  if (o.kind === "products") return { kind: "products", reserveForPickup: true, products: o.products.map(({ sku, label, price, stock }) => ({ sku, label, price, sizes: Object.keys(stock) })) };
}

/** Owner edits: update the profile, then re-sign so agents see the new truth immediately. */
export function ownerUpdate(store, patch) {
  const p = store.profile;
  if (patch.tagline !== undefined) p.tagline = patch.tagline;
  if (patch.story !== undefined) p.story = patch.story;
  if (patch.dogs !== undefined) p.dogs = patch.dogs;
  if (patch.tags !== undefined) p.tags = patch.tags;
  if (patch.claims !== undefined) p.claims = patch.claims;
  if (patch.price !== undefined) {
    const o = p.offer;
    if (o.kind === "rooms") o.rooms[0].price = Number(patch.price);
    if (o.kind === "tables") o.perPerson = Number(patch.price);
    if (o.kind === "tickets") o.price = Number(patch.price);
  }
  if (patch.agentPolicy !== undefined) p.agentPolicy = { ...p.agentPolicy, ...patch.agentPolicy };
  if (patch.paused !== undefined) store.overrides.paused = !!patch.paused;
  if (patch.soldOut !== undefined) store.overrides.soldOut = new Set(patch.soldOut);
  signAll(store);
  emit("owner_update", { business: p.id, patch: Object.keys(patch) });
  return businessCard(store);
}
