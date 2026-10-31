# Stadtgeist: Basel in 2032, when the first visitor is an agent

## The one-liner

**Next, the web stops being a set of pages and becomes a living, signed model of the city. Agents run it forward in time to rehearse your day before you live it. Small businesses publish once into that model and finally see the future coming.**

## From homepage to rehearsed city

| 2000s | 2010s | Now | **Next (2030–2035): the rehearsed city** |
|---|---|---|---|
| **Own website.** Every business needs a homepage | **Platforms.** Maps and Booking.com own the interface | **AI agents.** Agents search, compare and book for us | **The city twin.** Every business publishes a *signed storefront* into a shared model of the city. Agents don't just book one thing: they **simulate whole days** across many small businesses, prove what they trust, and book them as one. Owners see tomorrow's demand today. |
| The business owns the page | The platform owns the interface | The agent owns the decision | **The business owns its signed truth; the visitor owns their intent** |

The jump from "Now" to "Next" is the same jump the web made from documents to applications. Agents booking things is today. What comes next is agents that *run the city as a simulation*: they try 72 versions of your Saturday against live availability, late trams and dog rules, and only then act. That only works if every business, not just the big ones, is readable, verifiable and bookable by machine. That's what a local business puts online next.

Small businesses lost the discovery game once, to aggregators. In the agent era they can lose it again, faster. When an agent picks one result instead of showing ten, being *flattened into a generic result* means disappearing. In a rehearsed city, the agent composes a day from many places, so a 12-room family hotel and a back-room t-shirt printer get chosen for what they verifiably are.

## Basel, a Saturday in 2032

Mira lands at Basel SBB at 10:00 with her partner and their dog, Pixel. She tells her assistant: *"Art, the Rhine, a fish dinner, something local to bring home, CHF 450."*

Her agent doesn't search the web. It asks Basel's registry for storefronts, and gets back signed listings. One of them, "Hotel Rheinblick (Official Deals), CHF 89", is signed by nobody the city trusts, so it's dropped silently. Mira never sees it.

Then the agent **simulates the city**. It turns 72 combinations of cafés, galleries, shops, restaurants and hotels into timed days. Each one gets walked and tram-ridden against live opening hours and slots, and replayed 400 times with late trams and long lunches. Kunstraum St. Alban is wonderful but bans dogs, and Brasserie Steinen too. Two days survive. The winner is brunch at Café Kleinbasel, the photography terrace at Galerie am Rheinsprung, a screen-printed "Rhyschwimme" t-shirt from Basler Faden, perch on the heated terrace of Zum Goldenen Fisch and a Rhine-view room at Hotel Rheinblick with a night porter. Every stop is dog-friendly, and *signed by the owner and confirmed by inspection*.

It holds all five at once, like a single cart spanning the city. Mira's wallet signs an **intent mandate**: these three merchants, these amounts, this date, nothing else. Then everything is confirmed, and each business returns a signed receipt. Later, an overeager upsell agent tries to charge a CHF 35 dry bag to the same mandate. The shop's storefront declines it before it clears.

Meanwhile Nina, who runs Café Kleinbasel, never touched a website. This morning she told her storefront "vegan carrot cake today" and it became a signed claim. Her console shows something no website ever told her: **tomorrow 61 people's agents plan to come, peaking at 09:00**. She bakes more.

## The actors

- **The business** publishes one signed record: offer, live availability, policies, claims, and an *agent policy* (what agents may do here). It is served over MCP to agents and rendered as a page for humans. One source, two audiences, nothing maintained twice.
- **The registry** (a city or chamber-of-commerce role) signs listings and legal identity. It is a directory, not a marketplace, and it doesn't rank.
- **Attestors** (tourism desk, review bodies, hygiene inspectors) sign specific claims they have checked. Provenance is per claim, not per platform.
- **The agent network** issues agent passports. Once verified, an agent is recognised by every storefront, like Ant International's shared agent identity across wallets and acquirers.
- **The payment network** issues intent mandates. The credential is bound to merchant, item, amount and date, like American Express's move from agent tokens to intent tokens.
- **The visitor's agent** plans, simulates, explains and books, and must say *why* it chose each business, citing signed evidence.

## Why this is plausible (and why Europe)

- **The protocols exist.** MCP lets any agent call a business's tools today. Personal-agent protocols (Sierra and Meta's PAP) already let businesses define what agents may do, and customers grant scoped access.
- **The money rails are moving.** Intent-bound tokens, shared agent identity across payment networks, and agent carts across retailers (Google's Universal Cart) are all live or launching in 2026.
- **Europe has a head start on permission.** PSD2 made banking API-first with explicit consent, and PSD3/PSR will tighten it. Intent and permission are becoming the core data of agentic commerce, and regulated, identified agents have the edge if the rules for agents are explicit. Stadtgeist makes them explicit at the storefront.
- **Cost for a small business is close to zero.** Its record is a few kilobytes, signing is free, and updates are plain sentences.

## Representation and fairness

Agents don't trust what's written, they trust what's signed. That changes who wins:

- **Evidence beats ad spend.** The planner scores interest fit, verified and attested claims, reputation, budget, ease and robustness, and it shows the score breakdown. A family-run café with inspected claims beats a chain with a bigger marketing budget.
- **Copycats lose.** Unsigned or self-signed listings never enter a plan.
- **Owners keep control.** A business can let agents read but not book (Rösterei Münsterberg is walk-in only, and agents respect that). It can cap party sizes, require verified agents, or pause entirely.
- **Every choice is explainable.** "Why not the others?" is part of the output: "Kunstraum St. Alban: no animals in the galleries."

## What owners get back

Websites were one-way. Agent storefronts are two-way: every query is a signal. Aggregated across a city of agents, those signals become a **demand forecast** the owner can act on (more tables at 18:00, an offer for the quiet afternoon), without handing their customer relationship to a platform.

## How this answers the judging criteria

| Criterion | Our answer |
|---|---|
| **Vision & believability** | The timeline above, extended one step. Every component exists in 2026 in some form: MCP storefronts, Ed25519 signatures, intent-bound payment tokens, shared agent identity, PSD2/PSD3 consent. We wire them together around a local business. The fictional businesses sit on real Basel coordinates with real constraints (opening days, dog rules, tram vs walk). |
| **Innovation** | Three ideas we haven't seen together: (1) the agent **simulates the city** with Monte Carlo rehearsal before booking, (2) **one two-phase cart across independent small businesses** with an intent mandate per merchant, (3) agents' plans become an **owner-facing demand forecast**, the first thing a website never gave a café. |
| **Execution & craft** | It runs. 12 MCP storefronts plus a registry, real signatures, real holds, confirmations and declines enforced by each storefront, LLM (Qwen or Claude) or deterministic planner, an end-to-end test suite, a 3D city twin and an owner console with plain-language updates. |
| **"Best vision no one expected"** | The website's successor isn't a better website or an MCP endpoint. It's a **rehearsal**: Basel as a shared simulation that your agent runs forward, where a business's "presence" is a signed promise inside it. |

## What the prototype proves

- 12 fictional Basel businesses run as independent MCP storefronts, plus a registry and one copycat.
- A planner agent (Claude, or a deterministic fallback) discovers, verifies signatures, simulates 72 days with Monte Carlo robustness, explains its picks, and books end to end with holds, intent-bound payment, signed receipts, rollback and replanning.
- Trust failures happen live: the copycat is rejected, mandate misuse is declined, and an unverified agent is refused.
- The owner console turns plain words into re-signed claims, and shows live agent visits and a demand forecast from 60 simulated visitor agents.
- The human page is generated from the same signed record.

## What we would build next

1. **Federated registries.** Basel, Zürich and Lörrach each sign their own businesses and cross-trust each other, so no single gatekeeper is needed.
2. **Negotiation.** Agents ask "table for 4 at 19:00 if we order the tasting menu?", and storefronts answer with signed counter-offers.
3. **Real rails.** Map intent mandates onto PSD3 consent flows and card-network intent tokens, and add TWINT for Switzerland.
4. **Live city data.** BVB tram real-time feed, weather and events in the simulation, so the twin rehearses with real delays.
5. **Owner co-pilot.** Turn the forecast into suggestions, such as "open 2 more terrace tables at 18:00, 33 people expected", and publish them in one tap.
6. **Group planning.** Several people's agents negotiate one shared day under each person's own mandate.
