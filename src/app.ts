import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { ScriptService, type Result } from "./scripts.ts";

export type AppOptions = { now?: () => Date };

export function createApp(db: DatabaseSync, options: AppOptions = {}) {
  const service = new ScriptService(db, options.now ?? (() => new Date()));
  const app = new Hono();

  async function body(request: Request): Promise<Record<string, unknown> | null> {
    const parsed = await request.json().catch(() => null);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  }

  function reply(result: Result, created = false) {
    if (!result.ok) return Response.json({ error: result.code, message: result.message }, { status: result.status });
    return Response.json(result.script, { status: created ? 201 : 200 });
  }

  const invalid = () => Response.json({ error: "invalid_body", message: "corpo JSON inválido" }, { status: 400 });

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/scripts", async (c) => {
    const input = await body(c.req.raw);
    return input ? reply(service.create(input), true) : invalid();
  });

  app.get("/scripts/:id", (c) => reply(service.get(c.req.param("id"))));

  app.post("/scripts/:id/change-requests", async (c) => {
    const input = await body(c.req.raw);
    return input ? reply(service.requestChanges(c.req.param("id"), input)) : invalid();
  });

  app.post("/scripts/:id/versions", async (c) => {
    const input = await body(c.req.raw);
    return input ? reply(service.submitVersion(c.req.param("id"), input)) : invalid();
  });

  app.post("/scripts/:id/approval", async (c) => {
    const input = (await body(c.req.raw)) ?? {};
    return reply(service.approve(c.req.param("id"), input));
  });

  return app;
}
