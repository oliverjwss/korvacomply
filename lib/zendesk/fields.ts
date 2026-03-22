import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_SUBCATEGORIES,
  getProductAreaOptions,
} from "@/lib/complaint-taxonomy";
import {
  createTicketField,
  listTicketFields,
  type ZendeskTicketField,
} from "@/lib/zendesk/client";

export type FieldMappingKey =
  | "is_complaint"
  | "complaint_category"
  | "complaint_subcategory"
  | "product_area"
  | "vulnerability_flag"
  | "vulnerability_type"
  | "sla_deadline"
  | "complaint_outcome"
  | "redress_amount"
  | "referred_to_fos"
  | "ai_confidence"
  | "categorised_at";

export type ZendeskFieldMapping = Partial<Record<FieldMappingKey, number>>;

const TITLE_PREFIX = "korva_comply_";

function titleFor(key: FieldMappingKey): string {
  return `${TITLE_PREFIX}${key}`;
}

function findExisting(
  fields: ZendeskTicketField[],
  exactTitle: string
): ZendeskTicketField | undefined {
  return fields.find(
    (f) => f.title === exactTitle || f.raw_title === exactTitle
  );
}

function subcategoryOptions(): { name: string; value: string }[] {
  const map = new Map<string, { name: string; value: string }>();
  for (const subs of Object.values(COMPLAINT_SUBCATEGORIES)) {
    for (const s of subs) {
      map.set(s.value, s);
    }
  }
  return Array.from(map.values());
}

function buildDefinitions(
  productAreaOptions: { name: string; value: string }[]
): Array<{ key: FieldMappingKey; body: Record<string, unknown> }> {
  return [
    {
      key: "is_complaint",
      body: {
        type: "checkbox",
        title: titleFor("is_complaint"),
        active: true,
        agent_description: "Korva Comply — whether the ticket is a complaint",
      },
    },
    {
      key: "complaint_category",
      body: {
        type: "tagger",
        title: titleFor("complaint_category"),
        active: true,
        custom_field_options: COMPLAINT_CATEGORIES.map((c) => ({
          name: c.name,
          value: c.value,
        })),
        agent_description: "Korva Comply — complaint category (PS25/19 taxonomy)",
      },
    },
    {
      key: "complaint_subcategory",
      body: {
        type: "tagger",
        title: titleFor("complaint_subcategory"),
        active: true,
        custom_field_options: subcategoryOptions().map((c) => ({
          name: c.name,
          value: c.value,
        })),
        agent_description: "Korva Comply — complaint subcategory",
      },
    },
    {
      key: "product_area",
      body: {
        type: "tagger",
        title: titleFor("product_area"),
        active: true,
        custom_field_options: productAreaOptions.map((c) => ({
          name: c.name,
          value: c.value,
        })),
        agent_description: "Korva Comply — product area (by regulated activities)",
      },
    },
    {
      key: "vulnerability_flag",
      body: {
        type: "checkbox",
        title: titleFor("vulnerability_flag"),
        active: true,
        agent_description: "Korva Comply — vulnerability identified",
      },
    },
    {
      key: "vulnerability_type",
      body: {
        type: "multiselect",
        title: titleFor("vulnerability_type"),
        active: true,
        custom_field_options: [
          { name: "Health", value: "health" },
          { name: "Life events", value: "life_events" },
          { name: "Resilience", value: "resilience" },
          { name: "Capability", value: "capability" },
        ],
        agent_description: "Korva Comply — vulnerability drivers (FG 21/1)",
      },
    },
    {
      key: "sla_deadline",
      body: {
        type: "date",
        title: titleFor("sla_deadline"),
        active: true,
        agent_description: "Korva Comply — complaint handling SLA deadline",
      },
    },
    {
      key: "complaint_outcome",
      body: {
        type: "tagger",
        title: titleFor("complaint_outcome"),
        active: true,
        custom_field_options: [
          { name: "Upheld", value: "upheld" },
          { name: "Partially upheld", value: "partially_upheld" },
          { name: "Rejected", value: "rejected" },
        ],
        agent_description: "Korva Comply — final complaint outcome",
      },
    },
    {
      key: "redress_amount",
      body: {
        type: "decimal",
        title: titleFor("redress_amount"),
        active: true,
        agent_description: "Korva Comply — redress amount (GBP)",
      },
    },
    {
      key: "referred_to_fos",
      body: {
        type: "checkbox",
        title: titleFor("referred_to_fos"),
        active: true,
        agent_description: "Korva Comply — referred to Financial Ombudsman Service",
      },
    },
    {
      key: "ai_confidence",
      body: {
        type: "decimal",
        title: titleFor("ai_confidence"),
        active: true,
        agent_description:
          "Internal — Korva Comply AI confidence (not shown to agents in sidebar UI)",
      },
    },
    {
      key: "categorised_at",
      body: {
        type: "text",
        title: titleFor("categorised_at"),
        active: true,
        agent_description:
          "Internal — Korva Comply ISO timestamp when categorised (system use)",
      },
    },
  ];
}

export async function provisionZendeskTicketFields(params: {
  subdomain: string;
  accessToken: string;
  regulatedActivities: string[] | null | undefined;
}): Promise<ZendeskFieldMapping> {
  const existing = await listTicketFields(params.subdomain, params.accessToken);
  const productAreas = getProductAreaOptions(params.regulatedActivities);
  const defs = buildDefinitions(productAreas);
  const mapping: ZendeskFieldMapping = {};

  for (const def of defs) {
    const exactTitle = titleFor(def.key);
    const found = findExisting(existing, exactTitle);
    if (found) {
      mapping[def.key] = found.id;
      continue;
    }

    const created = await createTicketField(
      params.subdomain,
      params.accessToken,
      def.body
    );
    mapping[def.key] = created.ticket_field.id;
    existing.push({
      id: created.ticket_field.id,
      title: exactTitle,
      type: String(def.body.type),
    });
  }

  return mapping;
}
