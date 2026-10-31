// A city of agents: many visitors' agents plan the same day at once. Each one surveys the
// storefronts over MCP and simulates its own day; their combined plans form tomorrow's
// demand forecast, which owners can see before the crowd arrives.
import { survey } from "./planner.js";
import { simulate, toHHMM } from "./simulator.js";

const INTERESTS = ["art", "rhine", "fish", "vegan", "coffee", "brunch", "quiet", "local-design"];
const ARRIVALS = ["basel-sbb", "basel-sbb", "badischer-bahnhof", "euroairport"];

function rng(seed) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296; }

export function personas(n, seed = 7) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  return Array.from({ length: n }, (_, i) => {
    const interests = [...new Set([pick(INTERESTS), pick(INTERESTS), ...(r() < 0.4 ? [pick(INTERESTS)] : [])])];
    const dog = r() < 0.25;
    if (dog) interests.push("dog-friendly");
    const include = ["cafe", "experience", ...(r() < 0.4 ? ["shop"] : []), "restaurant", ...(r() < 0.7 ? ["hotel"] : [])];
    return {
      id: `visitor-${i + 1}`, date: "2026-10-31",
      arrival: { place: pick(ARRIVALS), time: toHHMM(8 * 60 + Math.floor(r() * 16) * 15) },
      party_size: r() < 0.3 ? 1 : r() < 0.85 ? 2 : 4, dog, budget: 250 + Math.floor(r() * 10) * 50,
      interests, include, dinnerAfter: pick(["18:00", "18:30", "19:00", "19:30"]),
      shopWish: { keyword: r() < 0.7 ? "t-shirt" : "tote", size: pick(["S", "M", "L"]) }, nights: 1,
    };
  });
}

export async function runSwarm({ n = 40, date = "2026-10-31", emit }) {
  const quiet = () => {};
  const people = personas(n).map((p) => ({ ...p, date }));
  // One survey per agent kind would be realistic; all agents share the same public city data.
  const { catalog } = await survey({ ...people[0], include: ["cafe", "experience", "shop", "restaurant", "hotel"] }, quiet);
  const demand = {}; // business -> { hour -> people }
  const trails = [];
  let planned = 0;
  for (const p of people) {
    const sim = simulate(p, catalog, { topN: 1, rollouts: 60 });
    const best = sim.plans[0];
    if (!best) continue;
    planned++;
    trails.push({ visitor: p.id, coords: best.stops.map((s) => [s.geo.lon, s.geo.lat]) });
    for (const s of best.stops.filter((x) => x.business)) {
      const h = Math.floor(s.start / 60);
      ((demand[s.business.id] ??= {})[h] = (demand[s.business.id][h] || 0) + p.party_size);
    }
    emit?.("swarm_agent", { visitor: p.id, stops: best.stops.filter((x) => x.business).map((x) => x.business.id) });
  }
  return { agents: n, planned, demand, trails };
}
