import { z } from "zod";

const vulnerabilityDriverEnum = z.enum([
  "Health",
  "Life events",
  "Resilience",
  "Capability",
]);

export const vulnerabilityAssessmentSchema = z.object({
  detected: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  drivers: z
    .array(vulnerabilityDriverEnum)
    .nullable()
    .transform((d) => d ?? []),
  indicators: z
    .array(z.string())
    .nullable()
    .transform((d) => d ?? []),
  recommended_action: z.string(),
});

export const classificationResultSchema = z.object({
  is_complaint: z.boolean(),
  complaint_confidence: z.number().min(0).max(1),
  category: z.string(),
  subcategory: z.string(),
  product_area: z.string(),
  vulnerability_assessment: vulnerabilityAssessmentSchema,
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

export const saveComplaintRequestSchema = z
  .object({
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
    vulnerability_agent_decision: z.enum(["vulnerable", "not_vulnerable"]).optional(),
    vulnerability_dismissal_reason: z.string().optional(),
    vulnerability_assessment_confidence: z
      .enum(["high", "medium", "low"])
      .nullable()
      .optional(),
    vulnerability_recommended_action: z.string().nullable().optional(),
    consumer_duty_risk: z.string(),
    consumer_duty_notes: z.string(),
    received_at: z.string(),
    psr_exceptional_circumstances: z.boolean().optional(),
    requester_name: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.is_complaint) return;
    if (!data.vulnerability_agent_decision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "PS25/19: record whether the complainant is vulnerable — choose Confirm or Not vulnerable.",
        path: ["vulnerability_agent_decision"],
      });
      return;
    }
    if (data.vulnerability_agent_decision === "vulnerable") {
      if (!data.vulnerability_drivers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select at least one vulnerability driver.",
          path: ["vulnerability_drivers"],
        });
      }
    } else {
      const r = (data.vulnerability_dismissal_reason ?? "").trim();
      if (r.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add a short reason for the audit trail (e.g. no indicators).",
          path: ["vulnerability_dismissal_reason"],
        });
      }
    }
  });
