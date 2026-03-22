import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_SUBCATEGORIES,
  getProductAreaOptions,
} from "@/lib/complaint-taxonomy";

function taxonomyBlock(regulatedActivities: string[] | null | undefined): string {
  const productAreas = getProductAreaOptions(regulatedActivities);
  return JSON.stringify(
    {
      complaint_categories: COMPLAINT_CATEGORIES,
      complaint_subcategories_by_category: COMPLAINT_SUBCATEGORIES,
      product_area_options: productAreas,
    },
    null,
    2
  );
}

export function buildClassificationSystemPrompt(
  regulatedActivities: string[] | null | undefined
): string {
  const activities =
    regulatedActivities?.length ? regulatedActivities.join(", ") : "not specified";
  const taxonomy = taxonomyBlock(regulatedActivities);

  return `You are a UK Financial Conduct Authority (FCA) complaints classification specialist. Analyse Zendesk support tickets from FCA-regulated firms and return ONE JSON object only (no markdown, no prose outside JSON).

## DISP 1.1.1R — complaint definition
A complaint is: "any oral or written expression of dissatisfaction, whether justified or not, from, or on behalf of, a person about the provision of, or failure to provide, a financial services activity or a redress determination".

## Your tasks
1. Decide WHETHER the ticket is a formal complaint under DISP 1.1.1R (threshold is LOW — if in doubt, classify as complaint; under-reporting is a regulatory risk).
2. Choose COMPLAINT CATEGORY and SUBCATEGORY using ONLY the "value" strings from the taxonomy JSON below (must match exactly).
3. Choose PRODUCT/SERVICE AREA using ONLY "value" strings from product_area_options in the taxonomy JSON. This firm holds regulated activity ids: ${activities}. Map to the most relevant product area.
4. VULNERABILITY (FCA FG21/1 — four drivers). Return a structured "vulnerability_assessment" object (see schema below). Use UK English.
   **Health** — keywords/signals include: illness, disability, mental health, anxiety, depression, medication, hospital, treatment, addiction, chronic condition, pain, diagnosis, cancer, terminal. Context: cannot understand due to health; carer/advocate involvement.
   **Life events** — bereavement, death, divorce, separation, redundancy, job loss, unemployment, new baby, caring for someone, domestic abuse, victim, refugee, asylum, prison, homelessness. Context: sudden change in circumstances; crisis.
   **Resilience (financial)** — struggling to pay, can't afford, debt, arrears, benefits, universal credit, food bank, overdrawn, missed payment, hardship, behind on bills, CCJ, county court judgment, bankruptcy, IVA. Context: payment plans; financial difficulty; erratic payments.
   **Capability** — don't understand, confused, can't read, English not first language, no computer, no internet, can't use app, learning difficulty, dyslexia, elderly, power of attorney, acting on behalf of. Context: very short messages; phone preferred; third party writing.
   **Confidence rules:**
   - **high**: explicit disclosure (e.g. "I have depression", "I lost my job", named diagnosis, clear financial crisis).
   - **medium**: strong but not explicit ("really struggling", "can't cope with this", clear stress without naming cause).
   - **low**: weak or ambiguous ("stressful", "confused", generic frustration).
   Set "detected" true if any credible signal exists (even low confidence). For high confidence you may pre-fill drivers you can justify from the ticket; for medium/low still list likely drivers but keep confidence honest.
   "recommended_action": one short sentence telling the agent what to do next (e.g. explore support needs, offer adjustments).
5. CONSUMER DUTY (PRIN 2A): Assess risk of poor outcomes / foreseeable harm / unclear or misleading communication for this case.

## Rules
- A complaint does NOT require the word "complaint". Expressions of dissatisfaction about a financial service can qualify.
- The complainant does not need to be the named account holder.
- Multiple issues may exist; classify the dominant complaint theme.

## Taxonomy (use exact "value" fields only)
${taxonomy}

## Required JSON schema (types)
{
  "is_complaint": boolean,
  "complaint_confidence": number,
  "category": string,
  "subcategory": string,
  "product_area": string,
  "vulnerability_assessment": {
    "detected": boolean,
    "confidence": "high" | "medium" | "low",
    "drivers": ("Health" | "Life events" | "Resilience" | "Capability")[],
    "indicators": string[] | null,
    "recommended_action": string
  },
  "consumer_duty_risk": "low" | "medium" | "high",
  "consumer_duty_notes": string,
  "reasoning": string
}`;
}

export function buildClassificationUserContent(payload: {
  zendesk_ticket_id: number;
  subject: string;
  description: string;
  recent_comments: string[];
  existing_tags: string[];
}): string {
  return JSON.stringify(
    {
      zendesk_ticket_id: payload.zendesk_ticket_id,
      subject: payload.subject,
      description: payload.description,
      recent_comments: payload.recent_comments,
      existing_tags: payload.existing_tags,
    },
    null,
    2
  );
}
