export type ClassificationMethod =
  | "ai_accepted"
  | "ai_edited"
  | "ai_rejected"
  | "manual";

export type SLAType = "standard_8_week" | "psr_15_day" | "psr_35_day";

export type SLAStatus = "on_track" | "at_risk" | "breached";

export type ComplaintOutcome = "upheld" | "partially_upheld" | "rejected";

export type VulnerabilityDriver =
  | "Health"
  | "Life events"
  | "Resilience"
  | "Capability";

export type VulnerabilityConfidence = "high" | "medium" | "low";

export type VulnerabilityAgentDecision = "vulnerable" | "not_vulnerable";

export interface VulnerabilityAssessment {
  detected: boolean;
  confidence: VulnerabilityConfidence;
  drivers: VulnerabilityDriver[];
  indicators: string[];
  recommended_action: string;
}

export type RiskLevel = "low" | "medium" | "high";

export interface Organisation {
  id: string;
  zendesk_subdomain: string;
  company_name: string;
  fca_firm_reference: string | null;
  regulated_activities: string[];
  subscription_tier: "trial" | "starter" | "growth" | "scale";
  setup_completed: boolean;
  zendesk_field_mapping: Record<string, number>;
}

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
}

export interface ComplaintRecord {
  id: string;
  org_id: string;
  zendesk_ticket_id: number;
  zendesk_ticket_url: string;
  requester_name: string | null;
  is_complaint: boolean;
  ai_suggested_category: string;
  ai_suggested_subcategory: string;
  ai_suggested_product_area: string;
  ai_confidence: number;
  ai_reasoning: string;
  final_category: string;
  final_subcategory: string;
  final_product_area: string;
  classification_method: ClassificationMethod;
  classified_by: string;
  classified_at: string;
  received_at: string;
  sla_type: SLAType;
  sla_deadline: string;
  resolved_at: string | null;
  sla_status: SLAStatus;
  psr_exceptional_circumstances: boolean;
  sla_met: boolean | null;
  three_day_resolved: boolean;
  complaint_outcome: ComplaintOutcome | null;
  redress_amount: number;
  referred_to_fos: boolean;
  vulnerability_detected: boolean;
  vulnerability_drivers: VulnerabilityDriver[];
  vulnerability_indicators: string[];
  vulnerability_assessment_confidence: VulnerabilityConfidence | null;
  vulnerability_recommended_action: string | null;
  vulnerability_agent_decision:
    | VulnerabilityAgentDecision
    | "pending"
    | null;
  vulnerability_dismissal_reason: string | null;
  consumer_duty_risk: RiskLevel;
  consumer_duty_notes: string;
  created_at: string;
  updated_at: string;
  audit_log: AuditEntry[];
}

export interface ClassificationResult {
  is_complaint: boolean;
  complaint_confidence: number;
  category: string;
  subcategory: string;
  product_area: string;
  vulnerability_assessment: VulnerabilityAssessment;
  consumer_duty_risk: RiskLevel;
  consumer_duty_notes: string;
  reasoning: string;
}

export interface ClassifyRequest {
  org_id: string;
  zendesk_ticket_id: number;
  subject: string;
  description: string;
  recent_comments: string[];
  existing_tags: string[];
}

export interface SaveComplaintRequest {
  org_id: string;
  zendesk_ticket_id: number;
  zendesk_ticket_url: string;
  ai_suggested_category: string;
  ai_suggested_subcategory: string;
  ai_suggested_product_area: string;
  ai_confidence: number;
  ai_reasoning: string;
  is_complaint: boolean;
  final_category: string;
  final_subcategory: string;
  final_product_area: string;
  classification_method: ClassificationMethod;
  classified_by: string;
  vulnerability_detected: boolean;
  vulnerability_drivers: string[];
  vulnerability_indicators: string[];
  vulnerability_agent_decision?: VulnerabilityAgentDecision;
  vulnerability_dismissal_reason?: string;
  vulnerability_assessment_confidence?: VulnerabilityConfidence | null;
  vulnerability_recommended_action?: string | null;
  consumer_duty_risk: string;
  consumer_duty_notes: string;
  received_at: string;
  psr_exceptional_circumstances?: boolean;
  requester_name?: string;
}

export interface SLAAlertItem {
  complaint_id: string;
  zendesk_ticket_id: number;
  zendesk_ticket_url: string;
  requester_name: string;
  product_area: string;
  sla_deadline: string;
  days_remaining: number;
  sla_type: SLAType;
}

export interface SLAAlerts {
  breached: SLAAlertItem[];
  at_risk: SLAAlertItem[];
  on_track_count: number;
  total_open: number;
  sla_compliance_30d: number;
  avg_days_to_resolution: number;
  dashboard_url: string;
}
