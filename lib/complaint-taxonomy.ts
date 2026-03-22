export const COMPLAINT_CATEGORIES: { name: string; value: string }[] = [
  { name: "Banking — service quality", value: "banking_service" },
  { name: "Banking — charges and interest", value: "banking_charges" },
  { name: "Payments — cards and transfers", value: "payments_cards" },
  { name: "Payments — APP fraud / scams", value: "payments_app" },
  { name: "Credit — affordability / lending", value: "credit_affordability" },
  { name: "Credit — collections / arrears", value: "credit_collections" },
  { name: "Insurance — underwriting / claims", value: "insurance_claims" },
  { name: "Investments — suitability / advice", value: "investments_advice" },
  { name: "Pensions — transfers / benefits", value: "pensions_transfers" },
  { name: "Claims management — handling", value: "claims_mgmt" },
  { name: "Funeral plans — product / service", value: "funeral_plans" },
  { name: "BNPL / DPC — repayment / terms", value: "bnpl_dpc" },
  { name: "E-money — safeguarding / access", value: "emoney_access" },
  { name: "General — communication / conduct", value: "general_conduct" },
];

export const COMPLAINT_SUBCATEGORIES: Record<
  string,
  { name: string; value: string }[]
> = {
  banking_service: [
    { name: "Account opening / closure", value: "bank_acct_lifecycle" },
    { name: "Service delays / errors", value: "bank_service_errors" },
    { name: "ATM / branch service", value: "bank_channel" },
  ],
  banking_charges: [
    { name: "Fees disputed", value: "bank_fees" },
    { name: "Interest applied", value: "bank_interest" },
  ],
  payments_cards: [
    { name: "Authorisation / fraud", value: "pay_auth" },
    { name: "Settlement / FX", value: "pay_settlement" },
  ],
  payments_app: [
    { name: "APP reimbursement", value: "pay_app_reimb" },
    { name: "Scam reporting", value: "pay_scam" },
  ],
  credit_affordability: [
    { name: "Creditworthiness assessment", value: "cr_afford" },
    { name: "Limit increases", value: "cr_limits" },
  ],
  credit_collections: [
    { name: "Arrears handling", value: "cr_arrears" },
    { name: "Default / recovery", value: "cr_recovery" },
  ],
  insurance_claims: [
    { name: "Claim decision", value: "ins_claim_decision" },
    { name: "Premium / policy terms", value: "ins_policy" },
  ],
  investments_advice: [
    { name: "Suitability", value: "inv_suitability" },
    { name: "Disclosure / charges", value: "inv_disclosure" },
  ],
  pensions_transfers: [
    { name: "Transfer delays / errors", value: "pen_transfer" },
    { name: "Benefit calculation", value: "pen_benefit" },
  ],
  claims_mgmt: [
    { name: "Third-party handling", value: "cm_third_party" },
    { name: "Timeliness", value: "cm_time" },
  ],
  funeral_plans: [
    { name: "Plan terms", value: "fp_terms" },
    { name: "Provider service", value: "fp_service" },
  ],
  bnpl_dpc: [
    { name: "Repayment difficulties", value: "bnpl_repay" },
    { name: "Charges / transparency", value: "bnpl_charges" },
  ],
  emoney_access: [
    { name: "Account access / blocking", value: "emo_access" },
    { name: "Safeguarding concerns", value: "emo_safe" },
  ],
  general_conduct: [
    { name: "Staff conduct", value: "gen_staff" },
    { name: "Communication quality", value: "gen_comms" },
  ],
};

export const REGULATED_ACTIVITY_OPTIONS: {
  id: string;
  label: string;
}[] = [
  { id: "payment_services", label: "Payment services (PSR)" },
  { id: "e_money", label: "E-money (EMRs)" },
  { id: "consumer_credit", label: "Consumer credit" },
  { id: "insurance_mediation", label: "Insurance mediation" },
  { id: "investment_services", label: "Investment services (MiFID)" },
  { id: "claims_management", label: "Claims management" },
  { id: "funeral_plans", label: "Funeral plans" },
  { id: "bnpl", label: "BNPL / Deferred Payment Credit" },
];

const ACTIVITY_TO_PRODUCT_AREAS: Record<
  string,
  { name: string; value: string }[]
> = {
  payment_services: [
    { name: "Payment accounts", value: "pa_accounts" },
    { name: "Card acquiring", value: "pa_cards" },
    { name: "Open banking / AIS", value: "pa_ais" },
  ],
  e_money: [
    { name: "E-money issuance", value: "em_issue" },
    { name: "E-wallet / prepaid", value: "em_wallet" },
  ],
  consumer_credit: [
    { name: "Unsecured lending", value: "cc_unsecured" },
    { name: "Motor finance", value: "cc_motor" },
    { name: "Credit cards / revolving", value: "cc_revolving" },
  ],
  insurance_mediation: [
    { name: "General insurance", value: "ins_gen" },
    { name: "Protection / life (retail)", value: "ins_life" },
  ],
  investment_services: [
    { name: "Retail investments", value: "inv_retail" },
    { name: "Advisory portfolio", value: "inv_adv" },
  ],
  claims_management: [
    { name: "Third-party claims", value: "cm_tp" },
    { name: "Insurer representation", value: "cm_rep" },
  ],
  funeral_plans: [{ name: "Pre-paid funeral plans", value: "fp_prepaid" }],
  bnpl: [
    { name: "BNPL agreements", value: "bnpl_agreements" },
    { name: "DPC / retail finance", value: "bnpl_dpc" },
  ],
};

export function getProductAreaOptions(
  regulatedActivities: string[] | null | undefined
): { name: string; value: string }[] {
  const ids = regulatedActivities?.length
    ? regulatedActivities
    : Object.keys(ACTIVITY_TO_PRODUCT_AREAS);
  const map = new Map<string, { name: string; value: string }>();
  for (const id of ids) {
    const opts = ACTIVITY_TO_PRODUCT_AREAS[id];
    if (!opts) continue;
    for (const o of opts) {
      map.set(o.value, o);
    }
  }
  if (map.size === 0) {
    for (const opts of Object.values(ACTIVITY_TO_PRODUCT_AREAS)) {
      for (const o of opts) {
        map.set(o.value, o);
      }
    }
  }
  return Array.from(map.values());
}
