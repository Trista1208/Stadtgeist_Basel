// End-to-end check: start the city, run the agent deterministically, verify bookings and
// the trust rules (spoof rejected, mandate misuse declined, replanning on sold-out).
import { spawn } from "node:child_process";
const PORT = 4111, base = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ["src/server.js"], { env: { ...process.env, PORT, ANTHROPIC_API_KEY: "" }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("running") && r()));
const fail = (m) => { console.error("FAIL:", m); srv.kill(); process.exit(1); };

async function plan(text) {
  const res = await fetch(`${base}/api/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mode: "deterministic", budget: 450 }) });
  const events = (await res.text()).split("\n\n").filter(Boolean).map((l) => JSON.parse(l.slice(6)));
  return events;
}
try {
  const ev = await plan("Arriving Basel SBB at 10:00 with my partner and our dog, budget CHF 450, we love art and the Rhine, dinner by the Rhine, and a t-shirt size M");
  const done = ev.find((e) => e.type === "done");
  if (!done) fail("no done event: " + JSON.stringify(ev.find((e) => e.type === "error")));
  if (!done.result.ok) fail("booking failed: " + JSON.stringify(done.result).slice(0, 400));
  if (!ev.some((e) => e.type === "reject" && e.business === "rheinblick-deals")) fail("spoof was not rejected");
  const ids = done.result.plan.stops.map((s) => s.id).filter(Boolean);
  if (ids.some((id) => ["roesterei-muensterberg", "kunstmuseum", "brasserie-steinen"].includes(id))) fail("picked a no-dog place: " + ids);
  console.log("ok  booked plan:", ids.join(" → "), `CHF ${done.result.plan.cost}`, `${done.result.receipts.length} receipts`);
  const sim = ev.find((e) => e.type === "simulate");
  console.log(`ok  simulated ${sim.simulated} plans, ${sim.feasible} feasible`);

  const misuse = await (await fetch(`${base}/api/misuse`, { method: "POST" })).json();
  if (!misuse.declined) fail("mandate misuse was not declined");
  console.log("ok  misuse declined:", misuse.reason);

  // Owner marks the chosen restaurant sold out; the next run must replan around it.
  const rest = done.result.plan.stops.find((s) => s.kind === "restaurant").id;
  await fetch(`${base}/api/owner/${rest}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ soldOut: ["*"] }) });
  const ev2 = await plan("Arriving Basel SBB at 10:00 with my partner and our dog, budget CHF 450, we love art and the Rhine, dinner by the Rhine");
  const d2 = ev2.find((e) => e.type === "done");
  if (!d2?.result.ok) fail("second run failed");
  if (d2.result.plan.stops.some((s) => s.id === rest)) fail("used a sold-out restaurant");
  console.log("ok  replanned without", rest, "→", d2.result.plan.stops.find((s) => s.kind === "restaurant").id);
  // An agent without a passport may read but not hold.
  process.env.PORT = PORT;
  const { call } = await import("../src/agent/mcpClient.js");
  const av = await call(`${base}/mcp/hotel-rheinblick`, "check_availability", { date: "2026-10-31" });
  if (!av.items.length) fail("anonymous read failed");
  try { await call(`${base}/mcp/hotel-rheinblick`, "hold", { date: "2026-10-31", item: "double-river" }); fail("unverified agent could hold"); }
  catch (e) { if (!/verified agents/.test(e.message)) fail(e.message); console.log("ok  unverified agent refused:", e.message); }

  const said = await (await fetch(`${base}/api/owner/cafe-kleinbasel/say`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Today we have a vegan carrot cake" }) })).json();
  if (!said.card.claims.some((c) => /vegan carrot cake/.test(c.payload.text))) fail("owner update not published");
  console.log("ok  owner plain-language update re-signed:", said.reply);

  const swarm = await (await fetch(`${base}/api/swarm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: 30 }) })).json();
  if (swarm.planned < 10) fail("swarm planned too few");
  console.log(`ok  swarm: ${swarm.planned}/${swarm.agents} visitor agents planned, forecast for ${Object.keys(swarm.demand).length} businesses`);
  console.log("\nAll checks passed.");
} catch (e) { fail(e.stack); }
srv.kill();
