import { toolsForPrompt } from "@/lib/assistant-tools";

export type PlannerHint = { intent?: string; entity?: string; dateFrom?: string; dateTo?: string };

export type AssistantProviderStatus = "READY" | "DISABLED" | "ERROR";

export function assistantProviderConfig() {
  const apiKey = process.env.ASSISTANT_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  const endpoint = process.env.ASSISTANT_LLM_URL ?? (apiKey ? `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions` : undefined);
  const model = process.env.ASSISTANT_LLM_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return { provider: process.env.ASSISTANT_LLM_PROVIDER ?? (apiKey ? "openai-compatible" : undefined), endpoint, apiKey, model };
}

/** Configuration is intentionally explicit so the UI never presents the
 * deterministic fallback as if a language model had answered. */
export function assistantProviderStatus(): AssistantProviderStatus {
  const config = assistantProviderConfig();
  if (!config.endpoint || !config.apiKey) return "DISABLED";
  return "READY";
}

/** Optional OpenAI-compatible planner. It is deliberately read-only: the model
 * may suggest a read intent, but it cannot invoke a database or write tool. */
export async function planAssistantQuestion(question: string, previousIntent?: string): Promise<PlannerHint | null> {
  const { endpoint, apiKey, model } = assistantProviderConfig();
  if (!endpoint || !apiKey || !question.trim()) return null;
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: `You are a read-only ERP intent planner. Return JSON only with intent, entity, dateFrom, dateTo. Never choose write, post, approve, delete, reverse, or execute. Allowed tools: ${JSON.stringify(toolsForPrompt().filter((tool) => !tool.approvalRequired))}. Previous intent: ${previousIntent ?? "none"}` }, { role: "user", content: question.slice(0, 1000) }] }) });
  if (!response.ok) return null;
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as PlannerHint;
    return typeof parsed.intent === "string" ? parsed : null;
  } catch { return null; }
}
