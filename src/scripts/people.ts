import { existsSync, readFileSync } from "node:fs";
import { normalizeEvent, type RawEvent } from "../ingest/beeStream.ts";
import { SessionStore } from "../ingest/sessions.ts";
import { topicKeywords } from "../identify/nameFromSpeech.ts";
import { Store } from "../store/db.ts";

// Inspect or teach SideKick's memory of people:
//   npm run people -- list | delete <name> | rename <name> <new name> | learn <name> <recording.jsonl>
if (process.env["SIDEKICK_DB"] === undefined && existsSync(".env")) process.loadEnvFile(".env");
const store = new Store(process.env["SIDEKICK_DB"] ?? "data/sidekick.db");
const [command, name, arg] = process.argv.slice(2);

/** Confirm-and-learn after the fact, from a recorded conversation (the longest one in the file). */
function learn(personName: string, file: string): string {
  const sessions = new SessionStore();
  const uuids = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line) as RawEvent;
    const event = normalizeEvent(raw.type, raw.data);
    if (event?.kind !== "utterance") continue;
    sessions.apply(event);
    uuids.add(event.conversationUuid);
  }
  const session = [...uuids].map((u) => sessions.get(u)!).sort((a, b) => b.utterances.length - a.utterances.length)[0];
  if (!session) return `No utterances found in ${file}`;
  const person = store.upsertPerson({ name: personName });
  store.linkConversation(session.conversationUuid, person.id, true);
  const nameParts = new Set(person.name.toLowerCase().split(/\s+/));
  const cues = topicKeywords(session.utterances, 12).filter((cue) => !nameParts.has(cue));
  store.addCues(person.id, cues);
  return `Learned ${person.name} from ${session.utterances.length} utterances: ${cues.join(", ")}`;
}

switch (command) {
  case "list":
    for (const p of store.listPeople()) console.log([p.name, p.role, p.org].filter(Boolean).join(" · "));
    break;
  case "delete":
    console.log(name && store.deletePerson(name) ? `Deleted ${name}` : `No unique person matching "${name}"`);
    break;
  case "rename":
    console.log(name && arg && store.renamePerson(name, arg) ? `Renamed ${name} → ${arg}` : `No unique person matching "${name}"`);
    break;
  case "learn":
    console.log(name && arg ? learn(name, arg) : "usage: npm run people -- learn <name> <recording.jsonl>");
    break;
  default:
    console.log("usage: npm run people -- list | delete <name> | rename <name> <new name> | learn <name> <recording.jsonl>");
}
