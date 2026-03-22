import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-6">
      <h1 className="text-2xl font-semibold">Korva Comply</h1>
      <p className="text-slate-600 text-center max-w-md text-sm">
        Dashboard shell. Connect classification pipelines and reporting here in later
        milestones.
      </p>
      <Link href="/" className="text-sm text-slate-700 underline underline-offset-2">
        Home
      </Link>
    </main>
  );
}
