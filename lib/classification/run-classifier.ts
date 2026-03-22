import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "@/lib/env";
import { extractJsonObject } from "@/lib/classification/extract-json";
import {
  buildClassificationSystemPrompt,
  buildClassificationUserContent,
} from "@/lib/classification/prompt";
import {
  classificationResultSchema,
  type ParsedClassification,
} from "@/lib/classification/zod-schema";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export async function runClassification(params: {
  regulatedActivities: string[] | null | undefined;
  zendesk_ticket_id: number;
  subject: string;
  description: string;
  recent_comments: string[];
  existing_tags: string[];
}): Promise<ParsedClassification> {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });
  const system = buildClassificationSystemPrompt(params.regulatedActivities);
  const user = buildClassificationUserContent({
    zendesk_ticket_id: params.zendesk_ticket_id,
    subject: params.subject,
    description: params.description,
    recent_comments: params.recent_comments,
    existing_tags: params.existing_tags,
  });

  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });

  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const jsonText = extractJsonObject(block.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Claude response was not valid JSON");
  }

  const validated = classificationResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Classification schema validation failed: ${validated.error.message}`
    );
  }

  return validated.data;
}
