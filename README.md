# Stadtgeist · Basel's agent-native layer

> Small Basel businesses publish once, as a signed storefront for agents.
> The city's agents can then find them, trust them, combine them into a whole day, and book it.

BaselHack 2026 · Adobe challenge **"The Post-Website Business"**.

**2000s** own website → **2010s** platforms → **Now** AI agents book for us → **Next: the rehearsed city.** Businesses publish signed storefronts into a living model of Basel, agents simulate your whole day across many small places before booking it as one, and owners see tomorrow's demand today.
Vision and pitch narrative: [`docs/VISION.md`](docs/VISION.md).

![Stadtgeist city twin](docs/city-twin.png)

## What runs

| Piece | What it is | Where |
|---|---|---|
| **Agent storefronts** | Every business is its own MCP server: `get_business_card`, `check_availability`, `hold`, `confirm`, `cancel` | `src/mcp.js`, `/mcp/<business-id>` |
| **Signed claims** | "Dogs welcome", "check-in until 02:00" are Ed25519-signed by the business key. A tourism desk attests some of them after inspection, and a reviews body signs ratings | `src/crypto.js`, `src/world.js` |
| **Basel registry** | MCP directory of storefronts. Listings are signed by the registry, so a self-signed copycat ("Rhine Hotel Deals 24", CHF 89!!!) is rejected | `/mcp/registry` |
| **Agent policy** | The owner decides what agents may do (read / hold / book / cancel, verified agents only, max party size). Café Frühling lets agents read but not book (demo policy), so planners send people as walk-ins | `agentPolicy` in `data/businesses.js` |
| **Agent passport** | One credential from the Basel Agent Trust Network, recognised by every storefront | `issueAgentPassport` |
| **Intent mandates** | The payment credential is bound to what the visitor approved: merchant, item, amount, date. Anything else is declined before it clears | `issueMandate`, `checkIntent` |
| **Planner agent** | Discovers, verifies, simulates every combination of businesses as a timed day (walk/tram, hours, live slots, budget, dog rules), runs 400 Monte Carlo rollouts per plan for robustness, explains each pick, then books everything in two phases with rollback and replanning | `src/agent/` |
| **LLM mode** | A language model reads the free-text wish and drives the same tools. Qwen through any OpenAI-compatible endpoint (local Ollama with no key, or a cloud API such as OpenRouter), or Claude. Without one, a deterministic planner runs the same MCP pipeline | `src/agent/llm.js` |
| **City of agents** | 60 synthetic visitors' agents plan the same day, which produces tomorrow's demand forecast per business and hour | `src/agent/swarm.js` |
| **City twin** | 3D Basel: beacons pulse on every MCP call, the chosen day is drawn and rehearsed by an avatar, other simulated futures appear as ghosts, swarm trails and demand pillars | `public/` |
| **Owner console** | Plain-language updates ("We're full at 19:00, vegan risotto today") become re-signed claims. Also slot toggles, agent permissions, live agent visits and the demand forecast | `/owner.html` |
| **Human fallback** | The same signed record rendered as a page with schema.org JSON-LD and a link to the MCP endpoint | `/b/<business-id>` |

Nothing is faked end to end: the planner talks to the storefronts only over MCP (Streamable HTTP), signatures are real Ed25519, and holds, confirmations and declines are enforced server-side by each storefront.

## Run it

```bash
npm install
npm start                       # http://localhost:4000 (Node 20+)
```

The planner uses an LLM when it finds one, otherwise the deterministic planner (same MCP calls, no LLM):

| Option | Setup |
|---|---|
| Qwen locally, free, no key | `ollama pull qwen3`, keep Ollama running, then `npm start`. It's detected automatically. |
| Qwen in the cloud | `cp .env.example .env`, then set `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (e.g. OpenRouter's free Qwen models) |
| Claude | set `ANTHROPIC_API_KEY` in `.env` |

- City twin: http://localhost:4000/
- Owner console: http://localhost:4000/owner.html
- Terminal agent: `npm run agent -- "Arriving Basel SBB 10:00 with my dog, CHF 450, art, Rhine, fish dinner, t-shirt size M"`
- End-to-end checks: `npm test`

The 3D base map uses OpenFreeMap tiles when online and falls back to a stylised offline Basel.

### Connect any MCP client

Each storefront is a standard MCP server, so other agents can use it too:

```bash
claude mcp add --transport http basel-registry http://localhost:4000/mcp/registry
claude mcp add --transport http hotel-rheinblick http://localhost:4000/mcp/hotel-rheinblick
```

Then ask: *"Find a dog-friendly hotel near the Rhine in Basel for 14 Nov and hold a room."* You'll see the beacon pulse in the city twin.

## Demo script (3 minutes)

Open on the challenge timeline: "Agents already search, compare and book. Here's what comes *next*." Then:

1. **Owner (30 s).** Open the owner console for Ufer7. Type "We're full at 19:30, vegan risotto today" and publish. The claim gets re-signed and is live for agents.
2. **Visitor (60 s).** In the city twin: "I arrive at SBB 10:00 with my partner and our dog, CHF 450, art, Rhine, fish dinner, a local t-shirt." Watch beacons pulse as the agent queries storefronts, the copycat hotel get rejected, 72 day plans get simulated (only 2 survive the dog rules and budget), and the chosen day get booked with 5 signed receipts.
3. **Trust (20 s).** Click *Try to misuse the mandate*. An upsell agent's charge at another shop is declined.
4. **Rehearse (30 s).** Press play. The avatar lives the day in 3D Basel.
5. **City of agents (30 s).** *Simulate 60 visitors' agents.* Tomorrow's crowd appears, and the owner console shows the fish house's 18:00 peak.

## Project layout

```
data/businesses.js     real Basel places (public web data) + simulated storefront layer
src/world.js           live city state: inventory, holds, bookings, trust anchors, mandates
src/mcp.js             storefront + registry MCP servers
src/agent/             planner (survey, simulate, explain, book), Claude loop, swarm, city model
src/ownerAssistant.js  plain-language owner updates
src/humanPage.js       human fallback page from the same signed record
public/                city twin + owner console
scripts/               terminal agent + end-to-end smoke test
```

The 12 businesses are real Basel places. Names, addresses, opening hours, cuisine and listed prices come from public web sources (each record has a `source`). Live availability, inventory, agent policies, signatures, attestations and bookings are simulated, each record lists them under `simulated`, and claims marked "(demo)" are invented scenarios. Stadtgeist is not affiliated with these businesses. The spoof listing is fictional.

## License

MIT, see [LICENSE](LICENSE).
