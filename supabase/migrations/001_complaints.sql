-- Run in Supabase SQL editor if migrations folder is not wired to CLI.

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  zendesk_ticket_id bigint not null,
  zendesk_ticket_url text not null,
  is_complaint boolean not null,
  ai_suggested_category text,
  ai_suggested_subcategory text,
  ai_suggested_product_area text,
  ai_confidence numeric,
  ai_reasoning text,
  final_category text,
  final_subcategory text,
  final_product_area text,
  classification_method text not null,
  classified_by text not null,
  classified_at timestamptz not null default now(),
  received_at timestamptz not null,
  sla_type text not null,
  sla_deadline date,
  resolved_at timestamptz,
  sla_status text not null default 'on_track',
  three_day_resolved boolean not null default false,
  complaint_outcome text,
  redress_amount numeric,
  referred_to_fos boolean not null default false,
  vulnerability_detected boolean not null default false,
  vulnerability_drivers text[] default '{}',
  vulnerability_indicators text[] default '{}',
  consumer_duty_risk text,
  consumer_duty_notes text,
  audit_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, zendesk_ticket_id)
);

create index if not exists complaints_org_ticket_idx
  on public.complaints (org_id, zendesk_ticket_id);

alter table public.complaints enable row level security;

create policy "Service role full access complaints"
  on public.complaints
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
