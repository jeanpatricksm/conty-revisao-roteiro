import type { DatabaseSync } from "node:sqlite";
import { brandDay, isCivilDate, isPastDue } from "./deadline.ts";

export type ScriptStatus = "in_review" | "changes_requested" | "approved";
export type Action = "request_changes" | "approve" | "submit_version";

type ScriptRow = {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: ScriptStatus;
  current_version: number;
  created_at: string;
  approved_at: string | null;
};

type VersionRow = {
  number: number;
  content: string;
  submitted_at: string;
  answers_request_id: string | null;
  submitted_late: number;
};

type ChangeRequestRow = {
  id: string;
  version: number;
  reason: string;
  due_date: string;
  requested_at: string;
};

export type ScriptView = {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: ScriptStatus;
  current_version: number;
  created_at: string;
  approved_at: string | null;
  allowed_actions: Action[];
  open_change_request: ChangeRequestView | null;
  versions: Array<{
    number: number;
    content: string;
    submitted_at: string;
    answers_change_request: string | null;
    submitted_late: boolean;
  }>;
  change_requests: ChangeRequestView[];
};

type ChangeRequestView = ChangeRequestRow & { overdue: boolean };

export type Failure = {
  ok: false;
  status: 400 | 404 | 409 | 422;
  code: string;
  message: string;
};
export type Result = { ok: true; script: ScriptView } | Failure;

const ALLOWED: Record<ScriptStatus, Action[]> = {
  in_review: ["request_changes", "approve"],
  changes_requested: ["submit_version"],
  approved: [],
};

function fail(status: Failure["status"], code: string, message: string): Failure {
  return { ok: false, status, code, message };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class ScriptService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date,
  ) {}

  create(input: Record<string, unknown>): Result {
    const campaignId = text(input.campaign_id);
    const creatorId = text(input.creator_id);
    const content = text(input.content);
    if (!campaignId || !creatorId || !content) {
      return fail(400, "invalid_body", "campaign_id, creator_id e content são obrigatórios");
    }
    const id = `scr_${crypto.randomUUID()}`;
    const at = this.now().toISOString();
    this.tx(() => {
      this.db
        .prepare(
          "INSERT INTO scripts (id, campaign_id, creator_id, status, current_version, created_at) VALUES (?, ?, ?, 'in_review', 1, ?)",
        )
        .run(id, campaignId, creatorId, at);
      this.db
        .prepare("INSERT INTO script_versions (script_id, number, content, submitted_at) VALUES (?, 1, ?, ?)")
        .run(id, content, at);
    });
    return { ok: true, script: this.view(id)! };
  }

  get(id: string): Result {
    const script = this.view(id);
    return script ? { ok: true, script } : fail(404, "not_found", "roteiro não encontrado");
  }

  requestChanges(id: string, input: Record<string, unknown>): Result {
    const script = this.row(id);
    if (!script) return fail(404, "not_found", "roteiro não encontrado");
    const reason = text(input.reason);
    const dueDate = text(input.due_date);
    if (!reason) return fail(400, "reason_required", "o pedido de alteração precisa de motivo");
    if (!dueDate) return fail(400, "due_date_required", "o pedido de alteração precisa de prazo");
    if (!isCivilDate(dueDate)) return fail(400, "invalid_due_date", "due_date deve ser uma data YYYY-MM-DD");
    const stale = this.checkVersion(script, input.version);
    if (stale) return stale;
    const blocked = this.checkAction(script, "request_changes");
    if (blocked) return blocked;
    const now = this.now();
    if (isPastDue(dueDate, now)) {
      return fail(422, "due_date_past", `o prazo ${dueDate} já passou no fuso da marca (hoje é ${brandDay(now)})`);
    }

    this.tx(() => {
      this.db
        .prepare(
          "INSERT INTO change_requests (id, script_id, version, reason, due_date, requested_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(`chg_${crypto.randomUUID()}`, id, script.current_version, reason, dueDate, now.toISOString());
      this.db.prepare("UPDATE scripts SET status = 'changes_requested' WHERE id = ?").run(id);
    });
    return { ok: true, script: this.view(id)! };
  }

  submitVersion(id: string, input: Record<string, unknown>): Result {
    const script = this.row(id);
    if (!script) return fail(404, "not_found", "roteiro não encontrado");
    const content = text(input.content);
    if (!content) return fail(400, "content_required", "content é obrigatório");
    const blocked = this.checkAction(script, "submit_version");
    if (blocked) return blocked;

    const request = this.openRequest(script)!;
    const now = this.now();
    const next = script.current_version + 1;
    this.tx(() => {
      this.db
        .prepare(
          "INSERT INTO script_versions (script_id, number, content, submitted_at, answers_request_id, submitted_late) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(id, next, content, now.toISOString(), request.id, isPastDue(request.due_date, now) ? 1 : 0);
      this.db
        .prepare("UPDATE scripts SET status = 'in_review', current_version = ? WHERE id = ?")
        .run(next, id);
    });
    return { ok: true, script: this.view(id)! };
  }

  approve(id: string, input: Record<string, unknown>): Result {
    const script = this.row(id);
    if (!script) return fail(404, "not_found", "roteiro não encontrado");
    const stale = this.checkVersion(script, input.version);
    if (stale) return stale;
    const blocked = this.checkAction(script, "approve");
    if (blocked) return blocked;
    this.db
      .prepare("UPDATE scripts SET status = 'approved', approved_at = ? WHERE id = ?")
      .run(this.now().toISOString(), id);
    return { ok: true, script: this.view(id)! };
  }

  private checkAction(script: ScriptRow, action: Action): Failure | null {
    if (ALLOWED[script.status].includes(action)) return null;
    if (script.status === "approved") {
      return fail(409, "already_approved", "roteiro aprovado não aceita nova versão nem pedido de alteração");
    }
    return fail(409, "invalid_state", `ação ${action} não é permitida com o roteiro em ${script.status}`);
  }

  /** A marca pode informar a versão que leu; se o criador já mandou outra, a decisão é recusada. */
  private checkVersion(script: ScriptRow, version: unknown): Failure | null {
    if (version === undefined || version === null) return null;
    if (version !== script.current_version) {
      return fail(409, "stale_version", `a versão atual é ${script.current_version}, não ${String(version)}`);
    }
    return null;
  }

  private openRequest(script: ScriptRow): ChangeRequestRow | undefined {
    if (script.status !== "changes_requested") return undefined;
    return this.db
      .prepare("SELECT id, version, reason, due_date, requested_at FROM change_requests WHERE script_id = ? AND version = ?")
      .get(script.id, script.current_version) as ChangeRequestRow | undefined;
  }

  private row(id: string): ScriptRow | undefined {
    return this.db.prepare("SELECT * FROM scripts WHERE id = ?").get(id) as ScriptRow | undefined;
  }

  private view(id: string): ScriptView | undefined {
    const script = this.row(id);
    if (!script) return undefined;
    const now = this.now();
    const versions = this.db
      .prepare(
        "SELECT number, content, submitted_at, answers_request_id, submitted_late FROM script_versions WHERE script_id = ? ORDER BY number",
      )
      .all(id) as VersionRow[];
    const requests = this.db
      .prepare(
        "SELECT id, version, reason, due_date, requested_at FROM change_requests WHERE script_id = ? ORDER BY version",
      )
      .all(id) as ChangeRequestRow[];
    const open = this.openRequest(script);
    const withOverdue = (request: ChangeRequestRow): ChangeRequestView => ({
      ...request,
      overdue: open?.id === request.id && isPastDue(request.due_date, now),
    });
    return {
      ...script,
      allowed_actions: ALLOWED[script.status],
      open_change_request: open ? withOverdue(open) : null,
      versions: versions.map((version) => ({
        number: version.number,
        content: version.content,
        submitted_at: version.submitted_at,
        answers_change_request: version.answers_request_id,
        submitted_late: version.submitted_late === 1,
      })),
      change_requests: requests.map(withOverdue),
    };
  }

  private tx(work: () => void): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
