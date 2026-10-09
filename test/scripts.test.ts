import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDatabase } from "../src/db.ts";

type Script = {
  id: string;
  status: string;
  current_version: number;
  allowed_actions: string[];
  open_change_request: { reason: string; due_date: string; overdue: boolean } | null;
  versions: Array<{ number: number; content: string; answers_change_request: string | null; submitted_late: boolean }>;
  change_requests: Array<{ id: string; version: number }>;
};

// Relógio controlado: cada teste move o "agora" à vontade.
let now = new Date("2026-03-10T15:00:00.000Z");
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  now = new Date("2026-03-10T15:00:00.000Z");
  app = createApp(openDatabase(":memory:"), { now: () => now });
});

async function post(path: string, body: unknown) {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Script & { error?: string } };
}

async function createScript(): Promise<Script> {
  const res = await post("/scripts", { campaign_id: "cmp_1", creator_id: "crt_1", content: "roteiro v1" });
  expect(res.status).toBe(201);
  return res.body;
}

describe("fluxo completo", () => {
  it("envia, pede alteração, reenvia e aprova, com o estado explícito em cada passo", async () => {
    const created = await createScript();
    expect(created.status).toBe("in_review");
    expect(created.allowed_actions).toEqual(["request_changes", "approve"]);

    const requested = await post(`/scripts/${created.id}/change-requests`, {
      reason: "trocar o gancho",
      due_date: "2026-03-12",
      version: 1,
    });
    expect(requested.status).toBe(200);
    expect(requested.body.status).toBe("changes_requested");
    expect(requested.body.allowed_actions).toEqual(["submit_version"]);
    expect(requested.body.open_change_request).toMatchObject({ reason: "trocar o gancho", due_date: "2026-03-12" });

    const resent = await post(`/scripts/${created.id}/versions`, { content: "roteiro v2" });
    expect(resent.status).toBe(200);
    expect(resent.body.status).toBe("in_review");
    expect(resent.body.current_version).toBe(2);
    expect(resent.body.open_change_request).toBeNull();

    const approved = await post(`/scripts/${created.id}/approval`, { version: 2 });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");
    expect(approved.body.allowed_actions).toEqual([]);
  });

  it("guarda as versões antigas e liga cada nova versão ao pedido que ela responde", async () => {
    const { id } = await createScript();
    await post(`/scripts/${id}/change-requests`, { reason: "encurtar", due_date: "2026-03-12" });
    const { body } = await post(`/scripts/${id}/versions`, { content: "roteiro v2" });
    expect(body.versions.map((v) => v.content)).toEqual(["roteiro v1", "roteiro v2"]);
    expect(body.versions[1]?.answers_change_request).toBe(body.change_requests[0]?.id);
    const fetched = await app.request(`/scripts/${id}`);
    expect(((await fetched.json()) as Script).versions).toHaveLength(2);
  });
});

describe("pedido de alteração", () => {
  it("recusa pedido sem motivo", async () => {
    const { id } = await createScript();
    const res = await post(`/scripts/${id}/change-requests`, { reason: "   ", due_date: "2026-03-12" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reason_required");
  });

  it("recusa pedido sem prazo ou com prazo que não é data", async () => {
    const { id } = await createScript();
    expect((await post(`/scripts/${id}/change-requests`, { reason: "x" })).body.error).toBe("due_date_required");
    expect((await post(`/scripts/${id}/change-requests`, { reason: "x", due_date: "2026-02-30" })).status).toBe(400);
  });

  it("recusa pedido com prazo que já passou", async () => {
    const { id } = await createScript();
    const res = await post(`/scripts/${id}/change-requests`, { reason: "x", due_date: "2026-03-09" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("due_date_past");
  });

  it("recusa decisão sobre uma versão que já não é a atual", async () => {
    const { id } = await createScript();
    await post(`/scripts/${id}/change-requests`, { reason: "x", due_date: "2026-03-12" });
    await post(`/scripts/${id}/versions`, { content: "v2" });
    const res = await post(`/scripts/${id}/approval`, { version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("stale_version");
  });

  it("não aceita dois pedidos para a mesma versão nem versão nova sem pedido", async () => {
    const { id } = await createScript();
    expect((await post(`/scripts/${id}/versions`, { content: "v2" })).status).toBe(409);
    await post(`/scripts/${id}/change-requests`, { reason: "x", due_date: "2026-03-12" });
    expect((await post(`/scripts/${id}/change-requests`, { reason: "y", due_date: "2026-03-12" })).status).toBe(409);
  });
});

describe("prazo no fuso da marca (America/Sao_Paulo)", () => {
  // 2026-03-12 23:59:59.999 em São Paulo (UTC-3) = 2026-03-13T02:59:59.999Z
  const lastInstant = new Date("2026-03-13T02:59:59.999Z");
  // 2026-03-13 00:00:00.000 em São Paulo = 2026-03-13T03:00:00.000Z
  const firstInstantNextDay = new Date("2026-03-13T03:00:00.000Z");

  it("aceita pedido com prazo de hoje no último instante do dia, mesmo com o UTC já no dia seguinte", async () => {
    const { id } = await createScript();
    now = lastInstant;
    const res = await post(`/scripts/${id}/change-requests`, { reason: "x", due_date: "2026-03-12" });
    expect(res.status).toBe(200);
  });

  it("recusa pedido com prazo de ontem no primeiro instante do dia seguinte", async () => {
    const { id } = await createScript();
    now = firstInstantNextDay;
    const res = await post(`/scripts/${id}/change-requests`, { reason: "x", due_date: "2026-03-12" });
    expect(res.status).toBe(422);
  });

  it("reenvio no último instante do prazo está em dia; no instante seguinte fica marcado como atrasado", async () => {
    const onTime = await createScript();
    await post(`/scripts/${onTime.id}/change-requests`, { reason: "x", due_date: "2026-03-12" });
    const late = await createScript();
    await post(`/scripts/${late.id}/change-requests`, { reason: "x", due_date: "2026-03-12" });

    now = lastInstant;
    const before = await app.request(`/scripts/${late.id}`);
    expect(((await before.json()) as Script).open_change_request?.overdue).toBe(false);
    const a = await post(`/scripts/${onTime.id}/versions`, { content: "v2" });
    expect(a.body.versions[1]?.submitted_late).toBe(false);

    now = firstInstantNextDay;
    const after = await app.request(`/scripts/${late.id}`);
    expect(((await after.json()) as Script).open_change_request?.overdue).toBe(true);
    const b = await post(`/scripts/${late.id}/versions`, { content: "v2" });
    expect(b.status).toBe(200);
    expect(b.body.versions[1]?.submitted_late).toBe(true);
  });
});

describe("roteiro aprovado", () => {
  it("não aceita nova versão, novo pedido de alteração nem segunda aprovação", async () => {
    const { id } = await createScript();
    await post(`/scripts/${id}/approval`, {});
    for (const [path, body] of [
      [`/scripts/${id}/versions`, { content: "v2" }],
      [`/scripts/${id}/change-requests`, { reason: "x", due_date: "2026-03-12" }],
      [`/scripts/${id}/approval`, {}],
    ] as const) {
      const res = await post(path, body);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("already_approved");
    }
    const fetched = (await (await app.request(`/scripts/${id}`)).json()) as Script;
    expect(fetched.status).toBe("approved");
    expect(fetched.versions).toHaveLength(1);
  });
});

describe("entradas inválidas", () => {
  it("valida criação e responde 404 para roteiro inexistente", async () => {
    expect((await post("/scripts", { campaign_id: "c" })).status).toBe(400);
    expect((await app.request("/scripts/scr_missing")).status).toBe(404);
    expect((await post("/scripts/scr_missing/approval", {})).status).toBe(404);
  });
});
