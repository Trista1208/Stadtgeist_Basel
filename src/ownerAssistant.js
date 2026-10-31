// The café owner is not a developer: they say what changed in plain words, and this turns
// it into a structured, re-signed update. Claude does the reading when a key is configured;
// otherwise a small rule-based parser handles the common cases.
import Anthropic from "@anthropic-ai/sdk";
import { llmInfo, openaiChat } from "./agent/llm.js";

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    tagline: { type: "string" },
    dogs: { type: "string", enum: ["allowed", "not_allowed"] },
    price: { type: "number" },
    paused: { type: "boolean" },
    soldOut: { type: "array", items: { type: "string" }, description: "Item ids (slot times like 19:00, room types, SKUs) or '*' for everything" },
    addClaims: { type: "array", items: { type: "object", additionalProperties: false, properties: { key: { type: "string" }, value: { type: ["string", "boolean"] }, text: { type: "string" } }, required: ["key", "value", "text"] } },
    removeClaims: { type: "array", items: { type: "string" } },
    reply: { type: "string", description: "One friendly sentence to the owner confirming what will change" },
  },
  required: ["reply"],
};

const SYS = "You turn a small-business owner's plain-language update into a structured change to their agent storefront. Only include fields that change. Claims are short factual promises with snake_case keys.";

export async function interpretOwner(text, store) {
  const llm = llmInfo();
  const ctx = `Business: ${JSON.stringify({ name: store.profile.name, category: store.profile.category, tagline: store.profile.tagline, dogs: store.profile.dogs, claims: store.profile.claims, offer: store.profile.offer })}\n\nOwner says: ${text}`;
  if (llm?.provider === "openai") {
    try {
      const msg = await openaiChat({ messages: [
        { role: "system", content: `${SYS} Reply with only a JSON object matching this JSON schema, no prose: ${JSON.stringify(schema)}` },
        { role: "user", content: ctx }], response_format: { type: "json_object" } });
      const json = (msg.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").match(/\{[\s\S]*\}/);
      if (json) return JSON.parse(json[0]);
    } catch (e) { console.warn("Owner assistant fell back to rules:", e.message); }
    return ruleBased(text);
  }
  if (llm?.provider === "anthropic") {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: llm.model, max_tokens: 2000, output_config: { effort: "low", format: { type: "json_schema", schema } },
      system: SYS,
      messages: [{ role: "user", content: ctx }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (block) return JSON.parse(block.text);
  }
  return ruleBased(text);
}

function ruleBased(text) {
  const t = text.toLowerCase(); const patch = { addClaims: [], removeClaims: [] }; const said = [];
  const times = [...t.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)].map((m) => `${m[1].padStart(2, "0")}:${m[2]}`);
  if (/fully booked|sold out|no (more )?(tables|rooms)|full\b/.test(t)) { patch.soldOut = times.length ? times : ["*"]; said.push(times.length ? `mark ${times.join(", ")} as full` : "mark everything as full today"); }
  if (/closed (today|for)|not taking bookings|pause/.test(t)) { patch.paused = true; said.push("pause agent bookings"); }
  if (/(open again|reopen|back to normal|available again)/.test(t)) { patch.paused = false; patch.soldOut = []; said.push("reopen everything"); }
  if (/no dogs|dogs (are )?not allowed/.test(t)) { patch.dogs = "not_allowed"; patch.removeClaims.push("dog_friendly"); patch.addClaims.push({ key: "dog_friendly", value: false, text: "No dogs" }); said.push("tell agents dogs are not allowed"); }
  else if (/dogs? (are )?(welcome|allowed)/.test(t)) { patch.dogs = "allowed"; patch.removeClaims.push("dog_friendly"); patch.addClaims.push({ key: "dog_friendly", value: true, text: "Dogs welcome" }); said.push("tell agents dogs are welcome"); }
  const vegan = t.match(/vegan ([a-z ]{3,40})/);
  if (vegan) { patch.addClaims.push({ key: "vegan_special", value: true, text: `Today: vegan ${vegan[1].trim()}` }); said.push(`publish a signed claim "vegan ${vegan[1].trim()}"`); }
  const price = t.match(/(?:price|now|costs?)\D{0,10}(\d{2,3})\s*(?:chf|francs)?/);
  if (price && /price|costs?|chf/.test(t)) { patch.price = Number(price[1]); said.push(`set the price to CHF ${price[1]}`); }
  patch.reply = said.length ? `I will ${said.join(", ")}. Everything gets re-signed with your key.` : "I could not find a change in that. Try: 'We are full at 19:00' or 'Dogs welcome on the terrace'.";
  return patch;
}

/** Apply an interpreted patch to the current claims list. */
export function toOwnerUpdate(store, patch) {
  const out = { ...patch };
  delete out.reply; delete out.addClaims; delete out.removeClaims;
  if (patch.addClaims?.length || patch.removeClaims?.length) {
    const remove = new Set([...(patch.removeClaims || []), ...(patch.addClaims || []).map((c) => c.key)]);
    out.claims = [...store.profile.claims.filter((c) => !remove.has(c.key)), ...(patch.addClaims || [])];
  }
  return out;
}
