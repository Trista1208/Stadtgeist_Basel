// Run the planner from a terminal against a running Stadtgeist server.
//   npm start            (in one terminal)
//   npm run agent -- "Arriving at Basel SBB 10:00 with my dog, CHF 450, love art and the Rhine, dinner by the Rhine, want Läckerli"
const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;
const text = process.argv.slice(2).join(" ") || "I arrive at Basel SBB at 10:00 with my partner and our dog. Budget CHF 450. We love art and the Rhine, want a dinner by the Rhine, and a box of Läckerli.";
const mode = process.env.MODE || "auto";

const res = await fetch(`${base}/api/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mode, budget: 450 }) });
const dec = new TextDecoder(); let buf = "";
for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true });
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const e = JSON.parse(buf.slice(6, i)); buf = buf.slice(i + 2);
    if (e.type === "agent" || e.type === "reject") console.log(`· ${e.text}`);
    if (e.type === "thought") console.log(`\n💭 ${e.text}\n`);
    if (e.type === "llm_tool") console.log(`→ ${e.tool}`);
    if (e.type === "simulate") console.log(`· Simulated ${e.simulated} day plans, ${e.feasible} feasible. Top: ${e.plans.map((p) => `${p.id} ${p.score.total}pts ${Math.round(p.robustness.onTime * 100)}% on time`).join(" | ")}`);
    if (e.type === "choose") { console.log(`\n★ Chose ${e.plan.id} (CHF ${e.plan.cost})`); for (const x of e.explanation) console.log(`  ${x.time} ${x.name}: ${x.why.join("; ")}`); console.log(); }
    if (e.type === "done") { console.log(`\nDone (${e.mode}). Booked: ${e.result.ok}. ${e.result.receipts?.length || 0} signed receipts.`); if (e.result.summary) console.log("\n" + e.result.summary); }
    if (e.type === "error") console.log("ERROR", e.message);
  }
}
