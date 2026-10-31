// The agent side: talks to storefronts only through MCP, exactly as a third-party agent would.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const clients = new Map();

async function client(url) {
  if (!clients.has(url)) {
    const c = new Client({ name: "stadtgeist-planner", version: "1.0.0" });
    clients.set(url, c.connect(new StreamableHTTPClientTransport(new URL(url))).then(() => c));
  }
  try { return await clients.get(url); } catch (e) { clients.delete(url); throw e; }
}

export async function call(url, tool, args = {}) {
  const c = await client(url);
  const res = await c.callTool({ name: tool, arguments: args });
  const text = res.content?.map((x) => x.text).join("") ?? "";
  if (res.isError) throw new Error(text);
  return JSON.parse(text);
}

export async function listTools(url) {
  return (await (await client(url)).listTools()).tools;
}
