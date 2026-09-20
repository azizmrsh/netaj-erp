import { toolsForPrompt } from "@/lib/assistant-tools";

export type PlannerHint = { intent?: string; entity?: string; dateFrom?: string; dateTo?: string };

export type AssistantProviderStatus = "READY" | "DISABLED" | "ERROR";

/** Configuration is intentionally explicit so the UI never presents the
 * deterministic fallback as if a language model had answered. */
export function assistantProviderStatus(): AssistantProviderStatus {
  if (!process.env.ASSISTANT_LLM_URL || !process.env.ASSISTANT_LLM_API_KEY) return "DISABLED";
  return "READY";
}

/** Optional OpenAI-compatible planner. It is deliberately read-only: the model
 * may suggest a read intent, but it cannot invoke a database or write tool. */
export async function planAssistantQuestion(question: string, previousIntent?: string): Promise<PlannerHint | null> {
  const endpoint = process.env.ASSISTANT_LLM_URL;
  const apiKey = process.env.ASSISTANT_LLM_API_KEY;
  if (!endpoint || !apiKey || !question.trim()) return null;
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.ASSISTANT_LLM_MODEL ?? "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: `You are a read-only ERP intent planner. Return JSON only with intent, entity, dateFrom, dateTo. Never choose write, post, approve, delete, reverse, or execute. Allowed tools: ${JSON.stringify(toolsForPrompt().filter((tool) => !tool.approvalRequired))}. Previous intent: ${previousIntent ?? "none"}` }, { role: "user", content: question.slice(0, 1000) }] }) });
  if (!response.ok) return null;
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as PlannerHint;
    return typeof parsed.intent === "string" ? parsed : null;
  } catch { return null; }
}
