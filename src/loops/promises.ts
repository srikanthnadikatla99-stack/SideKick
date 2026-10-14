import type { LlmProvider } from "../llm/provider.ts";
import type { OpenLoop } from "../types.ts";

export const OPEN_LOOP_RULES = `Open loops are commitments between the wearer and this person that are not yet done.
- direction "you_owe": the wearer promised something to this person ("I'll send you the deck").
- direction "they_owe": this person promised something to the wearer ("I'll get you the invoice").
- Only include commitments explicitly made in the evidence. Skip ones the evidence shows completed.
- text is short and imperative from the wearer's point of view, e.g. "Send Sarah the onboarding doc".
- sourceConversationId is the numeric Bee conversation id the commitment came from, if known.`;

export function normalizeOpenLoops(raw: unknown): OpenLoop[] {
  if (!Array.isArray(raw)) return [];
  const loops: OpenLoop[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { direction, text, sourceConversationId } = item as Record<string, unknown>;
    if ((direction !== "you_owe" && direction !== "they_owe") || typeof text !== "string" || !text.trim()) continue;
    loops.push({
      direction,
      text: text.trim(),
      sourceConversationId: typeof sourceConversationId === "number" ? sourceConversationId : undefined,
    });
  }
  return loops.slice(0, 5);
}

const FOLLOW_UP_SYSTEM = `You write one follow-up todo for the wearer after a conversation.
It must be a single actionable line under 120 characters, naming the person, e.g.
"Send Sarah Chen the onboarding doc and propose a partnership call".
Prefer the most important open loop the wearer owes; otherwise the clearest next step from the conversation.
Respond with the todo text only.`;

export async function draftFollowUp(
  llm: LlmProvider,
  input: { personName: string; transcript: string; summary?: string; openLoops: OpenLoop[] },
): Promise<string> {
  const prompt = [
    `Person: ${input.personName}`,
    input.summary ? `Bee summary: ${input.summary}` : "",
    `Open loops:\n${input.openLoops.map((l) => `- [${l.direction}] ${l.text}`).join("\n") || "none"}`,
    `Transcript:\n${input.transcript}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const text = await llm.text(FOLLOW_UP_SYSTEM, prompt, { maxTokens: 120 });
  return text.replace(/^["'\s-]+|["'\s]+$/g, "").split("\n")[0]!.slice(0, 160);
}
