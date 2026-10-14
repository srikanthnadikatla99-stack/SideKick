import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export interface LlmProvider {
  /** Ask for a single JSON object and parse it. */
  json<T>(system: string, user: string, opts?: { maxTokens?: number }): Promise<T>;
  /** Ask for plain text. */
  text(system: string, user: string, opts?: { maxTokens?: number }): Promise<string>;
}

export function createBedrockProvider(region: string, modelId: string): LlmProvider {
  const client = new BedrockRuntimeClient({ region });

  async function converse(system: string, user: string, maxTokens: number): Promise<string> {
    const response = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
        inferenceConfig: { maxTokens, temperature: 0 },
      }),
    );
    const parts = response.output?.message?.content ?? [];
    return parts.map((p) => p.text ?? "").join("").trim();
  }

  return {
    text: (system, user, opts) => converse(system, user, opts?.maxTokens ?? 400),
    async json<T>(system: string, user: string, opts?: { maxTokens?: number }) {
      const raw = await converse(
        `${system}\nRespond with a single JSON object only. No prose, no markdown fences.`,
        user,
        opts?.maxTokens ?? 800,
      );
      return parseJsonObject<T>(raw);
    },
  };
}

export function parseJsonObject<T>(raw: string): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error(`LLM returned no JSON object: ${raw.slice(0, 200)}`);
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
