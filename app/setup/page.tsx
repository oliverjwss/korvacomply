"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { REGULATED_ACTIVITY_OPTIONS } from "@/lib/complaint-taxonomy";

type Org = {
  id: string;
  zendesk_subdomain: string;
  company_name: string;
  regulated_activities: string[] | null;
  setup_completed: boolean | null;
  zendesk_field_mapping: Record<string, number> | null;
  complaint_group_ids: number[] | null;
};

const FIELD_LABELS: { key: string; label: string }[] = [
  { key: "is_complaint", label: "korva_comply_is_complaint (checkbox)" },
  { key: "complaint_category", label: "korva_comply_complaint_category (dropdown)" },
  { key: "complaint_subcategory", label: "korva_comply_complaint_subcategory (dropdown)" },
  { key: "product_area", label: "korva_comply_product_area (dropdown)" },
  { key: "vulnerability_flag", label: "korva_comply_vulnerability_flag (checkbox)" },
  { key: "vulnerability_type", label: "korva_comply_vulnerability_type (multiselect)" },
  { key: "sla_deadline", label: "korva_comply_sla_deadline (date)" },
  { key: "complaint_outcome", label: "korva_comply_complaint_outcome (dropdown)" },
  { key: "redress_amount", label: "korva_comply_redress_amount (decimal)" },
  { key: "referred_to_fos", label: "korva_comply_referred_to_fos (checkbox)" },
  { key: "ai_confidence", label: "korva_comply_ai_confidence (decimal, internal)" },
  { key: "categorised_at", label: "korva_comply_categorised_at (text, internal)" },
];

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);

  const loadOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/organisation", { credentials: "include" });
      if (res.status === 401) {
        setOrg(null);
        setError("No session. Start from the home page and connect Zendesk.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load organisation");
        return;
      }
      const o = data.organisation as Org;
      setOrg(o);
      setActivities(o.regulated_activities ?? []);
      setSelectedGroups(o.complaint_group_ids ?? []);
      if (o.setup_completed || o.zendesk_field_mapping) {
        setStep(4);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  const saveActivities = async () => {
    setError(null);
    const res = await fetch("/api/setup/organisation", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regulated_activities: activities }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Save failed");
      return;
    }
    setOrg(data.organisation);
    setStep(2);
  };

  const createFields = async () => {
    setFieldsBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/fields", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create fields");
        return;
      }
      await loadOrg();
      setStep(3);
    } finally {
      setFieldsBusy(false);
    }
  };

  const loadGroups = async () => {
    setError(null);
    const res = await fetch("/api/setup/groups", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load groups");
      return;
    }
    setGroups(data.groups ?? []);
  };

  useEffect(() => {
    if (step === 3) {
      void loadGroups();
    }
  }, [step]);

  const saveGroups = async () => {
    setError(null);
    const res = await fetch("/api/setup/organisation", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complaint_group_ids: selectedGroups }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Save failed");
      return;
    }
    setOrg(data.organisation);
    setStep(4);
  };

  const finish = async () => {
    setError(null);
    const res = await fetch("/api/setup/organisation", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setup_completed: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to complete setup");
      return;
    }
    setOrg(data.organisation as Org);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-600">Loading setup…</p>
      </div>
    );
  }

  if (!org && error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-red-600 text-center max-w-md">{error}</p>
        <Link href="/" className="text-slate-700 underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!org) {
    return null;
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6 md:p-10">
      <div className="w-full max-w-xl space-y-8">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Korva Comply · Setup
          </p>
          <h1 className="text-2xl font-semibold">{org.company_name}</h1>
          <p className="text-sm text-slate-600">
            {org.zendesk_subdomain}.zendesk.com · Step {step} of 4
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {step === 1 && (
          <section className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
            <h2 className="text-lg font-medium">What are your FCA regulated activities?</h2>
            <p className="text-sm text-slate-600">
              Select all that apply. We use this to tailor product-area options.
            </p>
            <ul className="space-y-2">
              {REGULATED_ACTIVITY_OPTIONS.map((opt) => (
                <li key={opt.id}>
                  <label className="flex items-start gap-3 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-slate-300"
                      checked={activities.includes(opt.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setActivities((a) => [...a, opt.id]);
                        } else {
                          setActivities((a) => a.filter((x) => x !== opt.id));
                        }
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void saveActivities()}
              className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Continue
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
            <h2 className="text-lg font-medium">We&apos;ll create these Zendesk ticket fields</h2>
            <p className="text-sm text-slate-600">
              Fields use the <code className="text-xs">korva_comply_</code> prefix. Existing
              fields with the same titles are reused.
            </p>
            <ul className="text-sm space-y-1.5 max-h-64 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-lg p-3 bg-slate-50 dark:bg-slate-950/50">
              {FIELD_LABELS.map((f) => (
                <li key={f.key}>{f.label}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled={fieldsBusy}
              onClick={() => void createFields()}
              className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {fieldsBusy ? "Creating fields…" : "Create fields automatically"}
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-sm text-slate-600 underline"
            >
              Back
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
            <h2 className="text-lg font-medium">Which Zendesk group(s) handle complaints?</h2>
            <p className="text-sm text-slate-600">
              Choose one or more groups. You can change this later in configuration.
            </p>
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500">Loading groups…</p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {groups.map((g) => (
                  <li key={g.id}>
                    <label className="flex items-center gap-3 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={selectedGroups.includes(g.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGroups((s) => [...s, g.id]);
                          } else {
                            setSelectedGroups((s) => s.filter((x) => x !== g.id));
                          }
                        }}
                      />
                      <span>{g.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => void saveGroups()}
              className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full text-sm text-slate-600 underline"
            >
              Back
            </button>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
            <h2 className="text-lg font-medium">You&apos;re ready</h2>
            <p className="text-sm text-slate-600">
              Korva Comply is configured for your Zendesk instance. Field IDs are stored in
              your organisation record for the sidebar and background apps.
            </p>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Zendesk app · Organisation ID
              </p>
              <p className="text-sm text-slate-600">
                Paste this into the private app installation setting{" "}
                <strong>org_id</strong> (together with your Korva base URL).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs break-all rounded bg-white dark:bg-slate-900 px-2 py-1 border border-slate-200 dark:border-slate-700 flex-1 min-w-0">
                  {org.id}
                </code>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-slate-200 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium hover:opacity-90"
                  onClick={() => void navigator.clipboard.writeText(org.id)}
                >
                  Copy
                </button>
              </div>
            </div>
            {org.zendesk_field_mapping && (
              <pre className="text-xs overflow-x-auto rounded-lg bg-slate-50 dark:bg-slate-950/50 p-3 border border-slate-100 dark:border-slate-800">
                {JSON.stringify(org.zendesk_field_mapping, null, 2)}
              </pre>
            )}
            {!org.setup_completed ? (
              <button
                type="button"
                onClick={() => void finish()}
                className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium hover:opacity-90"
              >
                Complete setup
              </button>
            ) : (
              <Link
                href="/dashboard"
                className="flex w-full justify-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium hover:opacity-90"
              >
                Open dashboard
              </Link>
            )}
            <p className="text-xs text-slate-500">
              Help: see Korva Comply documentation for agents and administrators.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
