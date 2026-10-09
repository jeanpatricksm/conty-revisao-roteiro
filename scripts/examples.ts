// Gera EXAMPLES.md a partir da API real, com o relógio controlado: `npm run examples`.
import { writeFileSync } from "node:fs";
import { createApp } from "../src/app.ts";
import { openDatabase } from "../src/db.ts";

let now = new Date("2026-03-10T15:00:00.000Z");
const app = createApp(openDatabase(), { now: () => now });
const out: string[] = ["# Exemplos de request e response", "", "Gerado por `npm run examples`. IDs encurtados.", ""];

async function call(title: string, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string };
  const id = (s: string) => s.replace(/scr_[0-9a-f-]+/g, "scr_123").replace(/chg_[0-9a-f-]+/g, "chg_456");
  out.push(`## ${title}`, "", `_agora: ${now.toISOString()}_`, "", "```http", id(`${method} ${path}`));
  if (body !== undefined) out.push("", JSON.stringify(body, null, 2));
  out.push("```", "", "```http", `HTTP ${res.status}`, "", id(JSON.stringify(json, null, 2)), "```", "");
  return json;
}

const script = await call("Criador envia o roteiro", "POST", "/scripts", {
  campaign_id: "cmp_1",
  creator_id: "crt_1",
  content: "Abro com o produto na mão e conto o problema que ele resolve.",
});
const id = script.id!;
await call("Pedido de alteração sem prazo é recusado", "POST", `/scripts/${id}/change-requests`, {
  reason: "trocar o gancho dos 3 primeiros segundos",
});
await call("Marca pede alteração com motivo e prazo", "POST", `/scripts/${id}/change-requests`, {
  reason: "trocar o gancho dos 3 primeiros segundos",
  due_date: "2026-03-12",
  version: 1,
});
now = new Date("2026-03-13T02:30:00.000Z"); // 23:30 de 12/03 em São Paulo
await call("Criador reenvia às 23:30 do dia do prazo (UTC já é dia 13)", "POST", `/scripts/${id}/versions`, {
  content: "Começo com a pergunta que todo mundo faz nos comentários.",
});
await call("Marca aprova a versão 2", "POST", `/scripts/${id}/approval`, { version: 2 });
await call("Roteiro aprovado não aceita nova versão", "POST", `/scripts/${id}/versions`, { content: "mais uma" });

writeFileSync(new URL("../EXAMPLES.md", import.meta.url), out.join("\n"));
console.log("EXAMPLES.md atualizado");
