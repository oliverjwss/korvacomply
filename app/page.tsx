"use client";

import { useState } from "react";
import Link from "next/link";

export default function Home() {
  const [subdomain, setSubdomain] = useState("");

  const oauthHref =
    subdomain.trim().length > 0
      ? `/api/auth/zendesk?subdomain=${encodeURIComponent(subdomain.trim())}`
      : "#";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Korva Comply</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Connect your Zendesk instance with OAuth to open the setup wizard.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-6 space-y-4 shadow-sm">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Zendesk subdomain
          </label>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden focus-within:ring-2 focus-within:ring-slate-400">
            <input
              className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm outline-none"
              placeholder="yourcompany"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              autoComplete="off"
            />
            <span className="flex items-center px-3 text-sm text-slate-500 bg-slate-50 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-600">
              .zendesk.com
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Redirect URI must match{" "}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-1">
              /api/auth/zendesk/callback
            </code>{" "}
            in your Zendesk OAuth client.
          </p>
          {subdomain.trim().length > 0 ? (
            <a
              href={oauthHref}
              className="inline-flex w-full justify-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Continue with Zendesk
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex w-full justify-center rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-500 py-2.5 text-sm font-medium cursor-not-allowed"
            >
              Enter subdomain to continue
            </button>
          )}
        </div>
        <p className="text-center text-xs text-slate-500">
          After authorising, you&apos;ll complete setup for regulated activities and
          Zendesk fields.
        </p>
        <p className="text-center text-sm">
          <Link href="/dashboard" className="text-slate-600 underline underline-offset-2">
            Dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
