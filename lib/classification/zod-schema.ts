import { z } from "zod";

export const classificationResultSchema = z.object({
  is_complaint: z.boolean(),
  complaint_confidence: z.number().min(0).max(1),
  category: z.string(),
  subcategory: z.string(),
  product_area: z.string(),
  vulnerability_detected: z.boolean(),
  vulnerability_indicators: z.array(z.string()).nullable(),
  vulnerability_drivers: z
    .array(
      z.enum(["Health", "Life events", "Resilience", "Capability"])
    )
    .nullable(),
  consumer_duty_risk: z.enum(["low", "medium", "high"]),
  consumer_duty_notes: z.string(),
  reasoning: z.string(),
});

export type ParsedClassification = z.infer<typeof classificationResultSchema>;

export const classifyRequestSchema = z.object({
  org_id: z.string().uuid(),
  zendesk_ticket_id: z.number().int().positive(),
  subject: z.string(),
  description: z.string(),
  recent_comments: z.array(z.string()),
  existing_tags: z.array(z.string()),
});

export const saveComplaintRequestSchema = z.object({
  org_id: z.string().uuid(),
  zendesk_ticket_id: z.number().int().positive(),
  zendesk_ticket_url: z.string().url(),
  ai_suggested_category: z.string(),
  ai_suggested_subcategory: z.string(),
  ai_suggested_product_area: z.string(),
  ai_confidence: z.number(),
  ai_reasoning: z.string(),
  is_complaint: z.boolean(),
  final_category: z.string(),
  final_subcategory: z.string(),
  final_product_area: z.string(),
  classification_method: z.enum([
    "ai_accepted",
    "ai_edited",
    "ai_rejected",
    "manual",
  ]),
  classified_by: z.string(),
  vulnerability_detected: z.boolean(),
  vulnerability_drivers: z.array(z.string()),
  vulnerability_indicators: z.array(z.string()),
  consumer_duty_risk: z.string(),
  consumer_duty_notes: z.string(),
  received_at: z.string(),
  psr_exceptional_circumstances: z.boolean().optional(),
  requester_name: z.string().optional(),
});
