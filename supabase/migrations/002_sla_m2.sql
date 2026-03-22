-- M2: PSR exceptional flag, requester display name for alerts, SLA outcome flag

alter table public.complaints
  add column if not exists psr_exceptional_circumstances boolean not null default false;

alter table public.complaints
  add column if not exists requester_name text;

alter table public.complaints
  add column if not exists sla_met boolean;

create index if not exists complaints_org_open_sla_idx
  on public.complaints (org_id, sla_status)
  where is_complaint = true and resolved_at is null;
