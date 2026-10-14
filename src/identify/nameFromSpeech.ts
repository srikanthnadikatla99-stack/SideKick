import type { Utterance } from "../types.ts";

export type NameMention = { name: string; kind: "self" | "addressed"; speaker: string };

const NAME = String.raw`(\p{L}[\p{L}'’-]+(?:\s+\p{L}[\p{L}'’-]+)?)`;
const SELF_INTRO = new RegExp(String.raw`\b(?:i'?m|i am|my name is|my name's|this is|call me)\s+${NAME}`, "giu");
const ADDRESS = new RegExp(
  String.raw`\b(?:hey|hi|hello|thanks|thank you|nice to meet you|good to see you|great to see you|bye|cheers)[,!.\s]+${NAME}`,
  "giu",
);

// Capitalized words that commonly follow the trigger phrases but are not names.
const NOT_NAMES = new Set(
  `sorry good fine great glad happy here there just not so really very well okay ok sure back done
   going doing trying looking thinking working there's it it's that everyone everybody all guys
   team folks man dude again yes no the a an and but from with also actually
   i i'm i’m im my we we're you you're there's how what`.split(/\s+/),
);

function cleanName(raw: string): string | undefined {
  const words = raw.split(/\s+/).filter((w) => w.length > 1);
  const kept: string[] = [];
  for (const word of words) {
    const bare = word.replace(/['’]s$/i, "");
    // ASR capitalizes names; a lowercase follower means the phrase wasn't an introduction.
    if (bare[0] === bare[0]!.toLowerCase()) break;
    if (NOT_NAMES.has(bare.toLowerCase())) break;
    kept.push(bare);
  }
  return kept.length > 0 ? kept.join(" ") : undefined;
}

/** Find people named in speech: self-introductions and direct address. */
export function extractNameMentions(utterances: Utterance[], ownerNames: string[] = []): NameMention[] {
  const owner = new Set(ownerNames.map((n) => n.toLowerCase()));
  const mentions: NameMention[] = [];
  for (const u of utterances) {
    for (const [pattern, kind] of [
      [SELF_INTRO, "self"],
      [ADDRESS, "addressed"],
    ] as const) {
      for (const match of u.text.matchAll(pattern)) {
        const name = cleanName(match[1]!);
        if (!name) continue;
        if (owner.has(name.toLowerCase()) || owner.has(name.split(" ")[0]!.toLowerCase())) continue;
        mentions.push({ name, kind, speaker: u.speaker });
      }
    }
  }
  return mentions;
}

const STOPWORDS = new Set(
  `about above after again against because been before being below between both could does doing
   down during each from further have having here hers herself himself into itself just more most
   other ours ourselves over same should some such than that that's their theirs them themselves
   then there these they this those through under until very were what when where which while who
   whom will with would your yours yourself yourselves yeah okay really think know going like
   right thing things gonna wanna kind sort maybe actually basically something anything also well
   want good great sure thanks thank much time today said says tell told mean pretty`.split(/\s+/),
);

/** Topic keywords from a transcript, most frequent first; used as learned identification cues. */
export function topicKeywords(utterances: Utterance[], limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const u of utterances) {
    for (const word of u.text.toLowerCase().match(/\p{L}[\p{L}'-]{3,}/gu) ?? []) {
      if (STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}
