import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { FollowUp, Person } from "../types.ts";

type PersonRow = { id: string; name: string; role: string | null; org: string | null; how_met: string | null };
type FollowUpRow = {
  id: string;
  conversation_uuid: string;
  person_id: string | null;
  text: string;
  status: FollowUp["status"];
  bee_todo_id: string | null;
};

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    role: row.role ?? undefined,
    org: row.org ?? undefined,
    howYouMet: row.how_met ?? undefined,
  };
}

function toFollowUp(row: FollowUpRow): FollowUp {
  return {
    id: row.id,
    conversationUuid: row.conversation_uuid,
    personId: row.person_id,
    text: row.text,
    status: row.status,
    beeTodoId: row.bee_todo_id ?? undefined,
  };
}

/** On-device store for derived data: people, learned cues, and follow-ups. */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        role TEXT,
        org TEXT,
        how_met TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cues (
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        cue TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1,
        PRIMARY KEY (person_id, cue)
      );
      CREATE TABLE IF NOT EXISTS conversation_people (
        conversation_uuid TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        confirmed INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS followups (
        id TEXT PRIMARY KEY,
        conversation_uuid TEXT NOT NULL,
        person_id TEXT,
        text TEXT NOT NULL,
        status TEXT NOT NULL,
        bee_todo_id TEXT,
        created_at INTEGER NOT NULL
      );
    `);
  }

  getPerson(id: string): Person | undefined {
    const row = this.db.prepare("SELECT * FROM people WHERE id = ?").get(id) as PersonRow | undefined;
    return row && toPerson(row);
  }

  listPeople(): Person[] {
    return (this.db.prepare("SELECT * FROM people ORDER BY name").all() as PersonRow[]).map(toPerson);
  }

  /** Exact full-name match first, then a unique first-name match. */
  findPersonByName(name: string): Person | undefined {
    const key = nameKey(name);
    const exact = this.db.prepare("SELECT * FROM people WHERE name_key = ?").get(key) as PersonRow | undefined;
    if (exact) return toPerson(exact);
    const first = key.split(" ")[0]!;
    const rows = this.db
      .prepare("SELECT * FROM people WHERE name_key = ? OR name_key LIKE ?")
      .all(first, `${first} %`) as PersonRow[];
    return rows.length === 1 ? toPerson(rows[0]!) : undefined;
  }

  upsertPerson(input: Omit<Person, "id">): Person {
    const existing = this.findPersonByName(input.name);
    if (existing) {
      this.db
        .prepare(
          "UPDATE people SET role = COALESCE(?, role), org = COALESCE(?, org), how_met = COALESCE(?, how_met) WHERE id = ?",
        )
        .run(input.role ?? null, input.org ?? null, input.howYouMet ?? null, existing.id);
      return this.getPerson(existing.id)!;
    }
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO people (id, name, name_key, role, org, how_met, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.name.trim(), nameKey(input.name), input.role ?? null, input.org ?? null, input.howYouMet ?? null, Date.now());
    return this.getPerson(id)!;
  }

  addCues(personId: string, cues: string[]): void {
    const stmt = this.db.prepare(
      "INSERT INTO cues (person_id, cue, weight) VALUES (?, ?, 1) ON CONFLICT(person_id, cue) DO UPDATE SET weight = weight + 1",
    );
    for (const cue of cues) stmt.run(personId, cue);
  }

  allCues(): { personId: string; cue: string; weight: number }[] {
    return this.db.prepare("SELECT person_id AS personId, cue, weight FROM cues").all() as {
      personId: string;
      cue: string;
      weight: number;
    }[];
  }

  linkConversation(conversationUuid: string, personId: string, confirmed: boolean): void {
    this.db
      .prepare(
        "INSERT INTO conversation_people (conversation_uuid, person_id, confirmed) VALUES (?, ?, ?) ON CONFLICT(conversation_uuid) DO UPDATE SET person_id = excluded.person_id, confirmed = excluded.confirmed",
      )
      .run(conversationUuid, personId, confirmed ? 1 : 0);
  }

  getConversationLink(conversationUuid: string): { personId: string; confirmed: boolean } | undefined {
    const row = this.db
      .prepare("SELECT person_id, confirmed FROM conversation_people WHERE conversation_uuid = ?")
      .get(conversationUuid) as { person_id: string; confirmed: number } | undefined;
    return row && { personId: row.person_id, confirmed: row.confirmed === 1 };
  }

  addFollowUp(input: Pick<FollowUp, "conversationUuid" | "personId" | "text">): FollowUp {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO followups (id, conversation_uuid, person_id, text, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
      )
      .run(id, input.conversationUuid, input.personId, input.text, Date.now());
    return this.getFollowUp(id)!;
  }

  getFollowUp(id: string): FollowUp | undefined {
    const row = this.db.prepare("SELECT * FROM followups WHERE id = ?").get(id) as FollowUpRow | undefined;
    return row && toFollowUp(row);
  }

  latestPendingFollowUp(): FollowUp | undefined {
    const row = this.db
      .prepare("SELECT * FROM followups WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1")
      .get() as FollowUpRow | undefined;
    return row && toFollowUp(row);
  }

  resolveFollowUp(id: string, status: "approved" | "dismissed", text?: string, beeTodoId?: string): void {
    this.db
      .prepare("UPDATE followups SET status = ?, text = COALESCE(?, text), bee_todo_id = ? WHERE id = ?")
      .run(status, text ?? null, beeTodoId ?? null, id);
  }
}
