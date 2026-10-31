// One process, many "servers": the registry, every storefront (each its own MCP endpoint),
// human-readable pages rendered from the same signed data, the owner console and the demo UI.
import "./env.js";
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as W from "./world.js";
import { mountMcp } from "./mcp.js";
import { runPlanner, parseRequest } from "./agent/planner.js";
import { runLlmPlanner, llmAvailable, llmInfo, detectLlm } from "./agent/llm.js";
import { humanPage } from "./humanPage.js";
import { runSwarm } from "./agent/swarm.js";
import { interpretOwner, toOwnerUpdate } from "./ownerAssistant.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
mountMcp(app);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
app.use(express.static(root));
app.use("/vendor", express.static(path.join(root, "..", "node_modules", "maplibre-gl", "dist")));

// Live event stream: every agent query, hold and booking in the city.
app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const on = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  W.bus.on("event", on);
  req.on("close", () => W.bus.off("event", on));
});

app.get("/api/city", (req, res) => {
  res.json({
    llm: llmAvailable(), llmModel: llmInfo()?.model || null,
    businesses: [...W.stores.values()].map((s) => ({
      id: s.id, name: s.profile.name, category: s.profile.category, geo: s.profile.geo, tagline: s.profile.tagline,
      spoof: s.spoof, dogs: s.profile.dogs, mcpUrl: s.mcpUrl, stats: s.stats,
    })),
  });
});

// Run the planner agent; stream its reasoning and actions as server-sent events.
app.post("/api/plan", async (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  res.flushHeaders();
  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  const { text, date, mode, budget } = req.body;
  const passport = W.issueAgentPassport({ agent: "Stadtgeist planner", operator: "Stadtgeist demo", onBehalfOf: "demo-visitor" });
  send("agent", { step: "passport", text: `Agent passport ${passport.payload.agentId} issued by the Basel Agent Trust Network, recognised by every storefront` });
  const cap = Number(budget) || 600;
  // The wallet only signs intents inside the visitor's standing rule (total budget).
  const wallet = ({ intents, date, maxTotal }) => {
    if (maxTotal > cap) throw new Error(`Wallet refused: CHF ${maxTotal} is over the visitor's CHF ${cap} limit`);
    const m = W.issueMandate({ holder: "demo-visitor", maxTotal, date, intents, purpose: "Basel day plan" });
    lastMandate = m;
    return m;
  };
  try {
    const useLlm = mode !== "deterministic" && llmAvailable();
    const deterministic = () => runPlanner(parseRequest(text, { ...(date ? { date } : {}), ...(budget ? { budget: cap } : {}) }), { emit: send, wallet, passport });
    let result, usedLlm = useLlm;
    if (useLlm) {
      // A demo must not die on a model outage or an empty credit balance: fall back to the rule-based driver.
      try { result = await runLlmPlanner(text, { date, wallet, passport, emit: send }); }
      catch (e) {
        console.error(e.message);
        send("agent", { step: "fallback", text: "Language model unavailable, switching to the rule-based driver" });
        usedLlm = false;
        result = await deterministic();
      }
    } else result = await deterministic();
    send("done", { result, mode: usedLlm ? "llm" : "deterministic", model: llmInfo()?.model });
  } catch (e) {
    console.error(e);
    send("error", { message: e.message });
  }
  res.end();
});

// Misuse demo: replay the last intent mandate at a merchant the visitor never approved.
let lastMandate = null;
app.post("/api/misuse", (req, res) => {
  if (!lastMandate) return res.status(400).json({ error: "Book a plan first" });
  const store = W.stores.get("rhywelle");
  const passport = W.issueAgentPassport({ agent: "Overeager upsell agent", operator: "unknown" });
  try {
    const hold = W.placeHold(store, { date: lastMandate.payload.date, item: "drybag:one", party_size: 1, agent_passport: passport });
    try { W.confirmHold(store, { hold_id: hold.hold_id, mandate: lastMandate, agent_passport: passport }); res.json({ declined: false }); }
    catch (e) { W.cancel(store, { id: hold.hold_id, agent_passport: passport }); res.json({ declined: true, attempt: `Charge CHF 35 Wickelfisch at ${store.profile.name} using the visitor's mandate`, reason: e.message }); }
  } catch (e) { res.json({ declined: true, reason: e.message }); }
});

// City of agents: many visitors' agents plan the same day; the result is a demand forecast.
let lastForecast = null;
app.post("/api/swarm", async (req, res) => {
  try {
    lastForecast = await runSwarm({ n: Math.min(Number(req.body?.n) || 40, 200), date: req.body?.date, emit: W.emit });
    W.emit("forecast", { agents: lastForecast.agents, planned: lastForecast.planned });
    res.json(lastForecast);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/forecast", (req, res) => res.json(lastForecast || { demand: {} }));

// ---- Owner console API ----
app.get("/api/owner/:id", (req, res) => {
  const s = W.stores.get(req.params.id);
  if (!s) return res.sendStatus(404);
  res.json({ profile: s.profile, overrides: { paused: s.overrides.paused, soldOut: [...s.overrides.soldOut] }, stats: s.stats,
    card: W.businessCard(s), availability: W.availability(s, { date: req.query.date || "2026-10-31", party_size: 2 }),
    bookings: [...s.bookings.values()] });
});
app.put("/api/owner/:id", (req, res) => {
  const s = W.stores.get(req.params.id);
  if (!s) return res.sendStatus(404);
  res.json(W.ownerUpdate(s, req.body));
});

app.post("/api/owner/:id/say", async (req, res) => {
  const s = W.stores.get(req.params.id);
  if (!s) return res.sendStatus(404);
  try {
    const patch = await interpretOwner(String(req.body.text || ""), s);
    const update = toOwnerUpdate(s, patch);
    const changed = Object.keys(update).length > 0;
    res.json({ reply: patch.reply, update, card: changed ? W.ownerUpdate(s, update) : W.businessCard(s) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Human fallback: the same signed business object, rendered for people (with schema.org JSON-LD).
app.get("/b/:id", (req, res) => {
  const s = W.stores.get(req.params.id);
  if (!s) return res.sendStatus(404);
  res.type("html").send(humanPage(s));
});

const port = process.env.PORT || 4000;
await detectLlm();
app.listen(port, () => {
  console.log(`Stadtgeist running on ${W.BASE_URL}`);
  console.log(`  City demo:     ${W.BASE_URL}/`);
  console.log(`  Owner console: ${W.BASE_URL}/owner.html`);
  console.log(`  Registry MCP:  ${W.BASE_URL}/mcp/registry`);
  const m = llmInfo();
  console.log(`  LLM planner:   ${m ? `${m.model} via ${m.provider === "openai" ? process.env.LLM_BASE_URL || "Ollama (localhost:11434)" : "Anthropic API"}` : "off (start Ollama with a Qwen model, or set ANTHROPIC_API_KEY); using the deterministic planner"}`);
});
