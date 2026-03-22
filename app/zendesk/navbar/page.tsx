"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SLAAlerts, SLAAlertItem } from "@/types/comply";
import type { ZafClient } from "@/types/zendesk-zaf";

const ZAF_SRC =
  "https://static.zdassets.com/zendesk_app_framework_sdk/2.0/zaf_sdk.min.js";

function openTicket(client: ZafClient | null, item: SLAAlertItem) {
  const id = item.zendesk_ticket_id;
  if (client) {
    void Promise.resolve(client.invoke("routeTo", "ticket", id)).catch(() => {
      window.open(item.zendesk_ticket_url, "_blank", "noopener,noreferrer");
    });
    return;
  }
  window.open(item.zendesk_ticket_url, "_blank", "noopener,noreferrer");
}

export default function ZendeskNavbarPage() {
  const clientRef = useRef<ZafClient | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [orgId, setOrgId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<SLAAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const loadAlerts = useCallback(async () => {
    if (!orgId || !subdomain) return;
    const res = await fetch(
      `/api/sla/alerts?org_id=${encodeURIComponent(orgId)}`,
      { headers: { "X-Zendesk-Subdomain": subdomain } }
    );
    const json = (await res.json()) as SLAAlerts & { error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to load SLA alerts");
    }
    setAlerts(json);
    setErr(null);
  }, [orgId, subdomain]);

  useEffect(() => {
    let cancelled = false;
    const win = window as Window & { ZAFClient?: { init: () => ZafClient } };

    const boot = async () => {
      try {
        if (!win.ZAFClient) return;
        const client = win.ZAFClient.init();
        clientRef.current = client;
        const ctx = await client.context();
        const sd = ctx.account?.subdomain?.trim() ?? "";
        const meta = await client.metadata();
        const oid = meta.settings?.org_id?.trim() ?? "";
        if (!sd || !oid) {
          if (!cancelled) {
            setErr("Missing Zendesk context or org_id.");
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setSubdomain(sd);
          setOrgId(oid);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Init failed");
          setLoading(false);
        }
      }
    };

    const start = () => {
      if (win.ZAFClient) {
        void boot();
        return;
      }
      let el = document.querySelector<HTMLScriptElement>(
        `script[src="${ZAF_SRC}"]`
      );
      if (!el) {
        el = document.createElement("script");
        el.src = ZAF_SRC;
        el.async = true;
        el.onload = () => {
          if (!cancelled) void boot();
        };
        document.body.appendChild(el);
        return;
      }
      el.addEventListener("load", () => {
        if (!cancelled) void boot();
      });
    };

    start();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orgId || !subdomain) return;
    let cancelled = false;
    setLoading(true);
    void loadAlerts()
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Load failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, subdomain, loadAlerts]);

  useEffect(() => {
    if (!open || !orgId) return;
    const t = setInterval(() => {
      void loadAlerts().catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [open, orgId, loadAlerts]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    const h = open ? "min(420px, 90vh)" : "40px";
    const w = open ? "min(380px, 96vw)" : "120px";
    void Promise.resolve(client.invoke("resize", { height: h, width: w })).catch(
      () => {}
    );
  }, [open, alerts]);

  const badge =
    alerts != null ? alerts.breached.length + alerts.at_risk.length : 0;

  if (err && !alerts) {
    return (
      <div className="px-2 py-1 text-xs text-red-700 max-w-[280px]">{err}</div>
    );
  }

  return (
    <div className="relative text-[13px] text-slate-800 font-sans">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 shadow-sm hover:bg-slate-50"
        aria-expanded={open}
        aria-label="SLA alerts"
      >
        <span className="font-semibold text-[#03363d]">Korva</span>
        {loading ? (
          <span className="text-slate-500">…</span>
        ) : (
          <span
            className={`inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-xs font-bold text-white ${
              badge > 0 ? "bg-red-600" : "bg-slate-400"
            }`}
          >
            {badge}
          </span>
        )}
      </button>

      {open && alerts && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(380px,calc(100vw-16px))] max-h-[min(400px,85vh)] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Korva Comply — SLA Centre
            </h2>
          </div>

          <section className="border-b border-red-100 px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700">
              Breached ({alerts.breached.length})
            </h3>
            {alerts.breached.length === 0 ? (
              <p className="text-xs text-slate-500 py-1">None</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {alerts.breached.map((item) => (
                  <li key={item.complaint_id} className="text-xs">
                    <button
                      type="button"
                      className="text-left w-full rounded border border-red-200 bg-red-50/80 p-2 hover:bg-red-50"
                      onClick={() =>
                        openTicket(clientRef.current, item)
                      }
                    >
                      <div className="font-semibold text-red-900">
                        #{item.zendesk_ticket_id}
                      </div>
                      <div className="text-red-800">
                        {item.requester_name} · {item.product_area}
                      </div>
                      <div className="text-red-700 mt-0.5">
                        {Math.abs(item.days_remaining)} days overdue · deadline{" "}
                        {item.sla_deadline}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-b border-amber-100 px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              At risk ({alerts.at_risk.length})
            </h3>
            {alerts.at_risk.length === 0 ? (
              <p className="text-xs text-slate-500 py-1">None</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {alerts.at_risk.map((item) => (
                  <li key={item.complaint_id} className="text-xs">
                    <button
                      type="button"
                      className="text-left w-full rounded border border-amber-200 bg-amber-50/80 p-2 hover:bg-amber-50"
                      onClick={() =>
                        openTicket(clientRef.current, item)
                      }
                    >
                      <div className="font-semibold text-amber-950">
                        #{item.zendesk_ticket_id}
                      </div>
                      <div className="text-amber-900">
                        {item.requester_name} · {item.product_area}
                      </div>
                      <div className="text-amber-800 mt-0.5">
                        {item.days_remaining} days remaining · deadline{" "}
                        {item.sla_deadline}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-medium text-emerald-800">
              On track: {alerts.on_track_count} complaint
              {alerts.on_track_count === 1 ? "" : "s"}
            </p>
          </section>

          <footer className="space-y-2 px-3 py-2 bg-slate-50 text-xs text-slate-600">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span>Open: {alerts.total_open}</span>
              <span>
                Avg resolution (30d): {alerts.avg_days_to_resolution}d
              </span>
              <span>SLA met (30d): {alerts.sla_compliance_30d}%</span>
            </div>
            <a
              href={alerts.dashboard_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-semibold text-[#03363d] underline underline-offset-2"
            >
              Open full dashboard →
            </a>
          </footer>
        </div>
      )}
    </div>
  );
}
