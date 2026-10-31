// Agent-facing storefronts. Every business is its own MCP server; the registry is one too.
// Any MCP client (our planner, Claude Desktop, another company's agent) can connect.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as W from "./world.js";

const json = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e.message || e) }] });

function logged(store, tool, fn) {
  return async (args) => {
    store.stats.queries++;
    W.emit("query", { business: store.id, tool, args });
    try { return json(await fn(args)); } catch (e) { return fail(e); }
  };
}

export function storefrontServer(store) {
  const p = store.profile;
  const server = new McpServer({ name: `storefront:${p.id}`, version: "1.0.0" }, {
    instructions: `You are talking to the official storefront of ${p.name} (${p.category}) in Basel. ` +
      `Claims are signed by the business key listed in the Basel registry. Bookings are two-phase: hold, then confirm. ` +
      `Agent permissions are in agentPolicy on the business card; holds and bookings need an agent passport, prepaid items an intent mandate.`,
  });

  server.registerTool("get_business_card", {
    title: "Business card",
    description: `Who ${p.name} is, what it offers, its policies, and signed claims with third-party attestations.`,
    inputSchema: {},
  }, logged(store, "get_business_card", () => W.businessCard(store)));

  server.registerTool("check_availability", {
    title: "Check availability",
    description: "Live availability and prices for a date. Rooms for hotels, time slots for tables and tickets, stock for shops.",
    inputSchema: {
      date: z.string().describe("YYYY-MM-DD"),
      party_size: z.number().int().min(1).max(12).default(2),
      dog: z.boolean().default(false).describe("Is a dog coming along?"),
    },
  }, logged(store, "check_availability", (a) => W.availability(store, a)));

  server.registerTool("hold", {
    title: "Place a hold",
    description: "Reserve an item for 10 minutes without committing. Use the `item` value from check_availability.",
    inputSchema: {
      date: z.string(), item: z.string(),
      party_size: z.number().int().min(1).max(12).default(2),
      dog: z.boolean().default(false),
      nights: z.number().int().min(1).max(14).default(1),
      guest_name: z.string().default("Guest"),
      agent_passport: z.any().optional().describe("Signed agent passport from the agent trust network"),
    },
  }, logged(store, "hold", (a) => W.placeHold(store, a)));

  server.registerTool("confirm", {
    title: "Confirm a hold",
    description: "Turn a hold into a booking. Prepaid items need a signed payment mandate from the guest's wallet. Returns a receipt signed by the business.",
    inputSchema: { hold_id: z.string(), mandate: z.any().optional().describe("Signed intent mandate from the guest's wallet"), agent_passport: z.any().optional() },
  }, logged(store, "confirm", (a) => W.confirmHold(store, a)));

  server.registerTool("cancel", {
    title: "Cancel",
    description: "Release a hold or cancel a confirmed booking (refund follows the cancellation policy).",
    inputSchema: { id: z.string().describe("hold_id or booking_id"), agent_passport: z.any().optional() },
  }, logged(store, "cancel", (a) => W.cancel(store, a)));

  return server;
}

export function registryServer() {
  const server = new McpServer({ name: "basel-registry", version: "1.0.0" }, {
    instructions: "Directory of Basel businesses with agent storefronts. Listings are signed by the registry key published in trust_anchors.",
  });
  server.registerTool("trust_anchors", {
    title: "Trust anchors", description: "Public keys of the registry, attestors and payment network. Verify every signature against these.", inputSchema: {},
  }, async () => json(W.trustAnchors));

  server.registerTool("search", {
    title: "Search businesses",
    description: "Find storefronts by category and tags. Includes community-submitted listings that are NOT registry-verified; check signatures.",
    inputSchema: {
      category: z.enum(["hotel", "restaurant", "cafe", "experience", "shop"]).optional(),
      tags: z.array(z.string()).optional(),
    },
  }, async ({ category, tags }) => {
    W.emit("registry_search", { category, tags });
    const rows = [...W.stores.values()]
      .filter((s) => !category || s.profile.category === category)
      .filter((s) => !tags?.length || tags.some((t) => s.profile.tags.includes(t)))
      .map((s) => ({ id: s.id, name: s.profile.name, category: s.profile.category, tagline: s.profile.tagline, geo: s.profile.geo, mcpUrl: s.mcpUrl, listing: s.listing }));
    return json(rows);
  });
  return server;
}

/** Mount stateless Streamable HTTP endpoints: /mcp/registry and /mcp/:businessId */
export function mountMcp(app) {
  const handle = (makeServer) => async (req, res) => {
    const server = makeServer(req);
    if (!server) return res.status(404).json({ error: "no such storefront" });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
  app.post("/mcp/registry", handle(() => registryServer()));
  app.post("/mcp/:id", handle((req) => { const s = W.stores.get(req.params.id); return s && storefrontServer(s); }));
  const notAllowed = (req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  app.get("/mcp/:id", notAllowed);
  app.delete("/mcp/:id", notAllowed);
}
