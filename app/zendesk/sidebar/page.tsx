"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ClassificationResult,
  ComplaintRecord,
  VulnerabilityDriver,
} from "@/types/comply";
import type { ZafClient } from "@/types/zendesk-zaf";
import {
  driversToZendeskValues,
  zendeskValuesToDrivers,
} from "@/app/zendesk/sidebar/vulnerability-map";
import { isPsrStyleComplaint } from "@/lib/sla-shared";

type SlaLivePayload = {
  sla_type: string;
  sla_deadline: string;
  status: string;
  days_remaining: number;
};

type FieldMapping = Record<string, number>;

type SidebarConfig = {
  org_id: string;
  regulated_activities: string[] | null;
  field_mapping: FieldMapping;
  taxonomy: {
    categories: { name: string; value: string }[];
    subcategories_by_category: Record<string, { name: string; value: string }[]>;
    product_areas: { name: string; value: string }[];
  };
};

const ZAF_SRC =
  "https://static.zdassets.com/zendesk_app_framework_sdk/2.0/zaf_sdk.min.js";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function commentBodies(comments: unknown): string[] {
  if (!Array.isArray(comments)) return [];
  const endUser: string[] = [];
  const anyPublic: string[] = [];
  for (const c of comments) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (o.public === false) continue;
    const body = typeof o.body === "string" ? stripHtml(o.body) : "";
    if (!body) continue;
    anyPublic.push(body);
    const role = String(
      (o.author as Record<string, unknown> | undefined)?.role ?? o.role ?? ""
    );
    if (!role || role === "end-user" || role === "end_user") {
      endUser.push(body);
    }
  }
  const pick = endUser.length ? endUser : anyPublic;
  return pick.slice(-5);
}

function pathsForTicket(m: FieldMapping): string[] {
  // Do not include ticket.comments here — many Zendesk versions reject it in a
  // batched client.get(), which surfaces as "JavaScript errors in this app".
  const base = [
    "ticket.id",
    "ticket.subject",
    "ticket.description",
    "ticket.tags",
    "ticket.createdAt",
    "currentUser.id",
  ];
  const extra: string[] = [];
  const add = (key: keyof FieldMapping) => {
    const id = m[key];
    if (id) extra.push(`ticket.customField:${id}`);
  };
  add("is_complaint");
  add("complaint_category");
  add("complaint_subcategory");
  add("product_area");
  add("vulnerability_flag");
  add("vulnerability_type");
  add("sla_deadline");
  add("ai_confidence");
  add("categorised_at");
  return [...base, ...extra];
}

async function fetchCommentsSafely(client: ZafClient): Promise<unknown> {
  try {
    const r = await client.get("ticket.comments");
    return r["ticket.comments"];
  } catch {
    try {
      const r = await client.get(["ticket.comment", "ticket.comments"]);
      return r["ticket.comments"] ?? r["ticket.comment"];
    } catch {
      return [];
    }
  }
}

function safeResize(client: ZafClient, payload: { height?: string; width?: string }) {
  void Promise.resolve(client.invoke("resize", payload)).catch(() => {});
}

function slaTypeDescription(t: string): string {
  switch (t) {
    case "standard_8_week":
      return "DISP 1.6.2R — 8 weeks (56 calendar days), deadline rolled to next UK business day if needed";
    case "psr_15_day":
      return "PSR Reg 101 — 15 UK business days (weekends & bank holidays excluded)";
    case "psr_35_day":
      return "PSR Reg 101 — 35 UK business days (exceptional circumstances)";
    default:
      return t;
  }
}

export default function ZendeskSidebarPage() {
  const clientRef = useRef<ZafClient | null>(null);
  const [phase, setPhase] = useState<
    "boot" | "ready" | "classifying" | "error"
  >("boot");
  const [err, setErr] = useState<string | null>(null);
  const [config, setConfig] = useState<SidebarConfig | null>(null);
  const [subdomain, setSubdomain] = useState<string>("");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [ticketUrl, setTicketUrl] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [readMode, setReadMode] = useState(false);
  const [ai, setAi] = useState<ClassificationResult | null>(null);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [productArea, setProductArea] = useState("");
  const [vulnFlag, setVulnFlag] = useState(false);
  const [vulnDrivers, setVulnDrivers] = useState<VulnerabilityDriver[]>([]);
  const [vulnIndicators, setVulnIndicators] = useState<string[]>([]);
  const [dutyNotes, setDutyNotes] = useState("");
  const [dutyRisk, setDutyRisk] = useState<"low" | "medium" | "high">("low");
  const [saving, setSaving] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [classifiedAsComplaint, setClassifiedAsComplaint] = useState(true);
  const [psrExceptional, setPsrExceptional] = useState(false);
  const [storedComplaint, setStoredComplaint] = useState<ComplaintRecord | null>(
    null
  );
  const [slaLive, setSlaLive] = useState<SlaLivePayload | null>(null);

  const subOptions = useMemo(() => {
    if (!config || !category) return [];
    return config.taxonomy.subcategories_by_category[category] ?? [];
  }, [config, category]);

  const showPsrExceptional = useMemo(() => {
    if (!config) return false;
    const acts = config.regulated_activities ?? [];
    const psrFirm =
      acts.includes("payment_services") || acts.includes("e_money");
    return psrFirm && isPsrStyleComplaint(category, productArea);
  }, [config, category, productArea]);

  useEffect(() => {
    if (!config?.org_id || !subdomain || !receivedAt) {
      setSlaLive(null);
      return;
    }
    const draftComplaint = !readMode && Boolean(ai?.is_complaint);
    const readComplaint = readMode && classifiedAsComplaint;
    if (!draftComplaint && !readComplaint) {
      setSlaLive(null);
      return;
    }
    const cat =
      readComplaint && storedComplaint
        ? storedComplaint.final_category
        : category;
    const pa =
      readComplaint && storedComplaint
        ? storedComplaint.final_product_area
        : productArea;
    const psr =
      readComplaint && storedComplaint
        ? Boolean(storedComplaint.psr_exceptional_circumstances)
        : psrExceptional;

    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/sla/compute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Zendesk-Subdomain": subdomain,
          },
          body: JSON.stringify({
            org_id: config.org_id,
            received_at: receivedAt,
            final_category: cat,
            final_product_area: pa,
            psr_exceptional_circumstances: psr,
          }),
          signal: ac.signal,
        });
        const json = (await res.json()) as SlaLivePayload & { error?: unknown };
        if (!res.ok) return;
        setSlaLive(json);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [
    readMode,
    classifiedAsComplaint,
    ai?.is_complaint,
    storedComplaint,
    category,
    productArea,
    psrExceptional,
    receivedAt,
    config,
    subdomain,
  ]);

  const initZaf = useCallback(async () => {
    try {
      setErr(null);
      setPhase("boot");
      const win = window as Window & { ZAFClient?: { init: () => ZafClient } };
      if (!win.ZAFClient) {
        setErr("ZAF SDK not loaded. Open this page inside Zendesk.");
        setPhase("error");
        return;
      }
      const client = win.ZAFClient.init();
      clientRef.current = client;
      const ctx = await client.context();
      const sd = ctx.account?.subdomain?.trim() ?? "";
      if (!sd) {
        setErr("Could not read Zendesk subdomain.");
        setPhase("error");
        return;
      }
      setSubdomain(sd);
      const meta = await client.metadata();
      const orgId = meta.settings?.org_id?.trim();
      if (!orgId) {
        setErr(
          "Missing org_id in app settings. Paste your Korva organisation ID from Setup into the app installation settings."
        );
        setPhase("error");
        return;
      }
      const res = await fetch(
        `/api/zendesk/sidebar-config?org_id=${encodeURIComponent(orgId)}`,
        { headers: { "X-Zendesk-Subdomain": sd } }
      );
      const cfgJson = await res.json();
      if (!res.ok) {
        setErr(cfgJson.error ?? "Failed to load sidebar config");
        setPhase("error");
        return;
      }
      const cfg = cfgJson as SidebarConfig;
      setConfig(cfg);
      const m = cfg.field_mapping;
      if (
        !m.is_complaint ||
        !m.complaint_category ||
        !m.complaint_subcategory ||
        !m.product_area
      ) {
        setErr(
          "Zendesk ticket fields are not provisioned. Complete Korva setup (create fields) and reinstall or update the app."
        );
        setPhase("error");
        return;
      }
      const data = await client.get(pathsForTicket(m));
      const commentsRaw = await fetchCommentsSafely(client);
      const tid = Number(data["ticket.id"]);
      if (!Number.isFinite(tid)) {
        setErr("Could not read ticket id.");
        setPhase("error");
        return;
      }
      setTicketId(tid);
      setTicketUrl(`https://${sd}.zendesk.com/agent/tickets/${tid}`);
      setReceivedAt(
        String(data["ticket.createdAt"] ?? new Date().toISOString())
      );
      const tagVal = data["ticket.tags"];
      const tagsList: string[] = Array.isArray(tagVal)
        ? (tagVal as string[])
        : typeof tagVal === "string" && tagVal.trim()
          ? tagVal.split(/\s*,\s*/).filter(Boolean)
          : [];
      setAgentId(String(data["currentUser.id"] ?? "unknown"));

      const catTs = m.categorised_at
        ? String(data[`ticket.customField:${m.categorised_at}`] ?? "").trim()
        : "";
      if (catTs) {
        setReadMode(true);
        setClassifiedAsComplaint(
          Boolean(data[`ticket.customField:${m.is_complaint}`])
        );
        setCategory(
          String(data[`ticket.customField:${m.complaint_category}`] ?? "")
        );
        setSubcategory(
          String(data[`ticket.customField:${m.complaint_subcategory}`] ?? "")
        );
        setProductArea(
          String(data[`ticket.customField:${m.product_area}`] ?? "")
        );
        setVulnFlag(
          m.vulnerability_flag != null
            ? Boolean(data[`ticket.customField:${m.vulnerability_flag}`])
            : false
        );
        const vt =
          m.vulnerability_type != null
            ? data[`ticket.customField:${m.vulnerability_type}`]
            : undefined;
        setVulnDrivers(
          zendeskValuesToDrivers(
            Array.isArray(vt) ? (vt as string[]) : vt ? [String(vt)] : []
          )
        );
        setDutyRisk("low");
        setDutyNotes("");
        setAi(null);
        setPhase("ready");
        safeResize(client, { height: "420px" });
        void (async () => {
          try {
            const cr = await fetch(
              `/api/complaints?org_id=${encodeURIComponent(orgId)}&ticket_id=${tid}`,
              { headers: { "X-Zendesk-Subdomain": sd } }
            );
            const cj = await cr.json();
            if (cr.ok && cj.complaint) {
              setStoredComplaint(cj.complaint as ComplaintRecord);
              setPsrExceptional(
                Boolean(
                  (cj.complaint as ComplaintRecord).psr_exceptional_circumstances
                )
              );
            }
          } catch {
            /* optional */
          }
        })();
        return;
      }

      setPhase("classifying");
      const subject = String(data["ticket.subject"] ?? "");
      const descRaw = String(data["ticket.description"] ?? "");
      const description = stripHtml(descRaw);
      const recent = commentBodies(commentsRaw);
      const classifyRes = await fetch("/api/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zendesk-Subdomain": sd,
        },
        body: JSON.stringify({
          org_id: orgId,
          zendesk_ticket_id: tid,
          subject,
          description,
          recent_comments: recent,
          existing_tags: tagsList,
        }),
      });
      const clsJson = await classifyRes.json();
      if (!classifyRes.ok) {
        setErr(clsJson.error ?? "Classification failed");
        setPhase("error");
        return;
      }
      const result = clsJson as ClassificationResult;
      setAi(result);
      setCategory(result.category);
      setSubcategory(result.subcategory);
      setProductArea(result.product_area);
      setVulnFlag(result.vulnerability_detected);
      setVulnDrivers(result.vulnerability_drivers ?? []);
      setVulnIndicators(result.vulnerability_indicators ?? []);
      setDutyNotes(result.consumer_duty_notes);
      setDutyRisk(result.consumer_duty_risk);
      setPhase("ready");
      safeResize(client, { height: "720px" });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Something went wrong loading Korva.";
      setErr(msg);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const win = window as Window & { ZAFClient?: { init: () => ZafClient } };

    const run = () => {
      void initZaf().catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Unexpected error");
        setPhase("error");
      });
    };

    const start = () => {
      if (cancelled) return;
      if (win.ZAFClient) {
        run();
        return;
      }
      let el = document.querySelector<HTMLScriptElement>(
        `script[src="${ZAF_SRC}"]`
      );
      if (!el) {
        el = document.createElement("script");
        el.src = ZAF_SRC;
        el.async = true;
        el.dataset.korvaZaf = "1";
        el.onload = () => {
          if (!cancelled) run();
        };
        el.onerror = () => {
          if (!cancelled) {
            setErr("Failed to load Zendesk App Framework SDK.");
            setPhase("error");
          }
        };
        document.body.appendChild(el);
        return;
      }
      el.addEventListener("load", () => {
        if (!cancelled) run();
      });
      queueMicrotask(() => {
        if (!cancelled && win.ZAFClient) run();
      });
    };

    start();
    return () => {
      cancelled = true;
    };
  }, [initZaf]);

  const aiMatchesForm =
    ai &&
    category === ai.category &&
    subcategory === ai.subcategory &&
    productArea === ai.product_area &&
    vulnFlag === ai.vulnerability_detected &&
    JSON.stringify(vulnDrivers.sort()) ===
      JSON.stringify((ai.vulnerability_drivers ?? []).sort());

  const persist = async (params: {
    is_complaint: boolean;
    method: "ai_accepted" | "ai_edited" | "ai_rejected";
  }) => {
    const client = clientRef.current;
    const cfg = config;
    if (!client || !cfg || ticketId == null) return;
    setSaving(true);
    setErr(null);
    const m = cfg.field_mapping;
    try {
      let slaDeadline: string | null = null;
      if (params.is_complaint) {
        const compRes = await fetch("/api/sla/compute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Zendesk-Subdomain": subdomain,
          },
          body: JSON.stringify({
            org_id: cfg.org_id,
            received_at: receivedAt,
            final_category: category,
            final_product_area: productArea,
            psr_exceptional_circumstances: psrExceptional,
          }),
        });
        const compJson = await compRes.json();
        if (!compRes.ok) {
          throw new Error(
            typeof compJson.error === "string"
              ? compJson.error
              : "SLA calculation failed"
          );
        }
        slaDeadline = String((compJson as { sla_deadline?: string }).sla_deadline ?? "");
      }

      let requesterName: string | undefined;
      try {
        const rq = await client.get("ticket.requester");
        const tr = rq["ticket.requester"] as
          | { name?: string }
          | string
          | undefined;
        if (tr && typeof tr === "object" && typeof tr.name === "string") {
          requesterName = tr.name;
        }
      } catch {
        /* optional */
      }

      if (params.is_complaint && m.sla_deadline && slaDeadline) {
        await client.set(`ticket.customField:${m.sla_deadline}`, slaDeadline);
      }
      await client.set(`ticket.customField:${m.is_complaint}`, params.is_complaint);
      if (params.is_complaint) {
        await client.set(`ticket.customField:${m.complaint_category}`, category);
        await client.set(
          `ticket.customField:${m.complaint_subcategory}`,
          subcategory
        );
        await client.set(`ticket.customField:${m.product_area}`, productArea);
      }
      if (m.vulnerability_flag) {
        await client.set(
          `ticket.customField:${m.vulnerability_flag}`,
          params.is_complaint ? vulnFlag : false
        );
      }
      if (m.vulnerability_type) {
        await client.set(
          `ticket.customField:${m.vulnerability_type}`,
          params.is_complaint ? driversToZendeskValues(vulnDrivers) : []
        );
      }
      if (m.ai_confidence) {
        await client.set(
          `ticket.customField:${m.ai_confidence}`,
          ai ? String(ai.complaint_confidence) : "0"
        );
      }
      if (m.categorised_at) {
        await client.set(
          `ticket.customField:${m.categorised_at}`,
          new Date().toISOString()
        );
      }

      const saveRes = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zendesk-Subdomain": subdomain,
        },
        body: JSON.stringify({
          org_id: cfg.org_id,
          zendesk_ticket_id: ticketId,
          zendesk_ticket_url: ticketUrl,
          ai_suggested_category: ai?.category ?? "",
          ai_suggested_subcategory: ai?.subcategory ?? "",
          ai_suggested_product_area: ai?.product_area ?? "",
          ai_confidence: ai?.complaint_confidence ?? 0,
          ai_reasoning: ai?.reasoning ?? "",
          is_complaint: params.is_complaint,
          final_category: params.is_complaint ? category : "",
          final_subcategory: params.is_complaint ? subcategory : "",
          final_product_area: params.is_complaint ? productArea : "",
          classification_method: params.method,
          classified_by: agentId,
          vulnerability_detected: vulnFlag,
          vulnerability_drivers: vulnDrivers,
          vulnerability_indicators: vulnIndicators,
          consumer_duty_risk: dutyRisk,
          consumer_duty_notes: dutyNotes,
          received_at: receivedAt,
          psr_exceptional_circumstances: psrExceptional,
          requester_name: requesterName,
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(
          typeof saveJson.error === "string"
            ? saveJson.error
            : "Save failed"
        );
      }
      if (saveJson.complaint) {
        setStoredComplaint(saveJson.complaint as ComplaintRecord);
      }
      setReadMode(true);
      setClassifiedAsComplaint(params.is_complaint);
      safeResize(client, { height: "420px" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onAccept = () => {
    if (!ai) return;
    const method = aiMatchesForm ? "ai_accepted" : "ai_edited";
    void persist({ is_complaint: true, method });
  };

  const onReject = () => {
    void persist({ is_complaint: false, method: "ai_rejected" });
  };

  if (phase === "boot" || phase === "classifying") {
    return (
      <div className="p-3 text-sm text-slate-700">
        {phase === "classifying"
          ? "Analysing ticket with Korva Comply…"
          : "Connecting to Zendesk…"}
      </div>
    );
  }

  if (phase === "error" && err) {
    return (
      <div className="p-3 text-sm text-red-700 whitespace-pre-wrap">{err}</div>
    );
  }

  if (!config) {
    return null;
  }

  const lowConfidence = ai && ai.complaint_confidence < 0.7;

  const catName = (v: string, list: { name: string; value: string }[]) =>
    list.find((x) => x.value === v)?.name ?? v;

  return (
    <div className="p-3 text-[13px] text-slate-800 space-y-3 max-w-[320px]">
      {err && (
        <div className="text-red-700 text-xs whitespace-pre-wrap">{err}</div>
      )}

      {readMode ? (
        <div className="space-y-2">
          <h2 className="font-semibold text-slate-900">Classification saved</h2>
          {classifiedAsComplaint ? (
            <>
              <p className="text-slate-600">
                This ticket is stored in Korva as a complaint with the categories
                below.
              </p>
              <dl className="text-xs space-y-1">
                <div>
                  <dt className="text-slate-500">Category</dt>
                  <dd>{catName(category, config.taxonomy.categories)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Subcategory</dt>
                  <dd>{catName(subcategory, subOptions)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Product area</dt>
                  <dd>{catName(productArea, config.taxonomy.product_areas)}</dd>
                </div>
                {vulnFlag && (
                  <div>
                    <dt className="text-slate-500">Vulnerability</dt>
                    <dd>
                      Flagged ({vulnDrivers.join(", ") || "see ticket fields"})
                    </dd>
                  </div>
                )}
              </dl>
              {classifiedAsComplaint && slaLive && (
                <section className="space-y-1 border-t border-slate-200 pt-2 mt-2">
                  <h3 className="font-semibold text-slate-900 text-sm">SLA</h3>
                  <p className="text-xs text-slate-600">
                    {slaTypeDescription(slaLive.sla_type)}
                  </p>
                  <p className="text-xs">
                    <span className="text-slate-500">Calculated deadline</span>
                    <br />
                    <span className="font-semibold text-slate-900">
                      {slaLive.sla_deadline}
                    </span>
                  </p>
                  {slaLive.status === "breached" && (
                    <p className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
                      {slaLive.days_remaining < 0
                        ? `${Math.abs(slaLive.days_remaining)} days overdue`
                        : `${slaLive.days_remaining} days remaining — respond urgently (final SLA window)`}
                    </p>
                  )}
                  {slaLive.status === "at_risk" && (
                    <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      {slaLive.days_remaining} days remaining — respond soon
                    </p>
                  )}
                  {slaLive.status === "on_track" && (
                    <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                      On track — {slaLive.days_remaining} days remaining
                    </p>
                  )}
                </section>
              )}
            </>
          ) : (
            <p className="text-slate-600">
              Recorded as not a complaint. Korva audit log includes this
              decision.
            </p>
          )}
        </div>
      ) : (
        <>
          <section className="space-y-1">
            <h2 className="font-semibold text-slate-900">Detection</h2>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                  ai?.is_complaint
                    ? "bg-amber-100 text-amber-900"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {ai?.is_complaint ? "Complaint detected" : "Not a complaint"}
              </span>
              {ai && (
                <span className="text-xs text-slate-600">
                  {Math.round(ai.complaint_confidence * 100)}% confidence
                </span>
              )}
            </div>
            {lowConfidence && (
              <p className="text-xs text-amber-800">
                Low confidence — review manually before accepting.
              </p>
            )}
          </section>

          {ai?.is_complaint && (
            <>
              <section className="space-y-2 border-t border-slate-200 pt-2">
                <h2 className="font-semibold text-slate-900">FCA classification</h2>
                <label className="block text-xs text-slate-600">Category</label>
                <select
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSubcategory("");
                  }}
                >
                  {config.taxonomy.categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="block text-xs text-slate-600">Subcategory</label>
                <select
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                >
                  {subOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="block text-xs text-slate-600">Product area</label>
                <select
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  value={productArea}
                  onChange={(e) => setProductArea(e.target.value)}
                >
                  {config.taxonomy.product_areas.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    className="flex-1 bg-[#03363d] text-white text-xs font-semibold rounded py-2 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => onAccept()}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="flex-1 border border-slate-300 text-slate-800 text-xs font-semibold rounded py-2 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => onReject()}
                  >
                    Reject
                  </button>
                </div>
              </section>

              <section className="space-y-2 border-t border-slate-200 pt-2">
                <h2 className="font-semibold text-slate-900">SLA</h2>
                {slaLive && (
                  <>
                    <p className="text-xs text-slate-600">
                      {slaTypeDescription(slaLive.sla_type)}
                    </p>
                    <p className="text-xs">
                      <span className="text-slate-500">
                        Calculated regulatory deadline
                      </span>
                      <br />
                      <span className="font-semibold text-slate-900">
                        {slaLive.sla_deadline}
                      </span>
                    </p>
                    {slaLive.status === "breached" && (
                      <p className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
                        {slaLive.days_remaining < 0
                          ? `${Math.abs(slaLive.days_remaining)} days overdue`
                          : `${slaLive.days_remaining} days left — final SLA window (treat as breached)`}
                      </p>
                    )}
                    {slaLive.status === "at_risk" && (
                      <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        {slaLive.days_remaining} days remaining — respond soon
                      </p>
                    )}
                    {slaLive.status === "on_track" && (
                      <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                        On track — {slaLive.days_remaining} days remaining
                      </p>
                    )}
                  </>
                )}
                {showPsrExceptional && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={psrExceptional}
                      onChange={(e) => setPsrExceptional(e.target.checked)}
                    />
                    PSR exceptional circumstances (35 business days)
                  </label>
                )}
                <p className="text-xs text-slate-600">
                  On accept, the calculated deadline is written to the SLA
                  custom field. Korva refreshes status daily (and on save).
                </p>
              </section>

              <section className="space-y-2 border-t border-slate-200 pt-2">
                <h2 className="font-semibold text-slate-900">Vulnerability</h2>
                {ai.vulnerability_detected && vulnIndicators.length > 0 && (
                  <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-950">
                    {vulnIndicators.join("; ")}
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={vulnFlag}
                    onChange={(e) => setVulnFlag(e.target.checked)}
                  />
                  Flag as vulnerable customer
                </label>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(
                    [
                      "Health",
                      "Life events",
                      "Resilience",
                      "Capability",
                    ] as VulnerabilityDriver[]
                  ).map((d) => (
                    <label key={d} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={vulnDrivers.includes(d)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setVulnDrivers([...vulnDrivers, d]);
                          } else {
                            setVulnDrivers(vulnDrivers.filter((x) => x !== d));
                          }
                        }}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </section>

              <section className="space-y-1 border-t border-slate-200 pt-2">
                <h2 className="font-semibold text-slate-900">Consumer Duty</h2>
                <div className="text-xs">
                  Risk:{" "}
                  <span className="font-medium capitalize">{dutyRisk}</span>
                </div>
                <textarea
                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs min-h-[64px]"
                  value={dutyNotes}
                  onChange={(e) => setDutyNotes(e.target.value)}
                />
              </section>

              {ai.reasoning && (
                <section className="text-xs text-slate-600 border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-800">Reasoning: </span>
                  {ai.reasoning}
                </section>
              )}
            </>
          )}

          {ai && !ai.is_complaint && (
            <div className="pt-2">
              <button
                type="button"
                className="w-full border border-slate-300 text-slate-800 text-xs font-semibold rounded py-2"
                disabled={saving}
                onClick={() => onReject()}
              >
                Confirm not a complaint
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
