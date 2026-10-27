-- =====================================================================
-- Saltgrove Skin: Supabase setup for the AI support agent
-- Where to run: Supabase > SQL Editor > New query > paste > Run
-- Part 1 and Part 2: run once.
-- Part 3: the 15 demo orders. Safe to run again: times are counted back from
--         the moment you run it. The workflow "Saltgrove – Demo Data" runs the same query.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Part 1: knowledge base for RAG (company documents)
-- ---------------------------------------------------------------------
create extension if not exists vector;

create table if not exists documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(3072)   -- gemini-embedding-001, default size (3072)
);

create or replace function match_documents (
  query_embedding vector(3072),
  match_count int default 5,
  filter jsonb default '{}'
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;


-- ---------------------------------------------------------------------
-- Part 2: orders (demo data) and the support message log
-- ---------------------------------------------------------------------
create table if not exists orders (
  order_number        text primary key,        -- format SG-10231
  customer_name       text not null,
  customer_email      text not null,
  country             text not null check (country in ('US', 'CA')),
  ordered_at          timestamptz not null,
  items               text not null,
  order_total_usd     numeric(8,2) not null,   -- products + shipping, before tax
  shipping_method     text not null,
  status              text not null check (status in ('processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  tracking_number     text,
  last_tracking_event text,
  last_tracking_at    timestamptz,
  delivered_at        timestamptz,
  is_refill_club      boolean not null default false
);

create table if not exists support_messages (
  id                bigserial primary key,
  received_at       timestamptz not null default now(),
  channel           text not null check (channel in ('chat', 'email')),
  session_id        text not null,
  customer_name     text,
  customer_email    text,
  order_number      text,
  message           text not null,
  category          text,      -- question | order_change | complaint | refund_request | other | spam
  urgency           text,      -- urgent | normal | low
  complaint_topic   text,      -- topic list in the triage prompt (workflow 2); 'none' if not a complaint
  sensitive_topic   boolean default false,
  route             text,      -- answered | escalated | spam | human | error
  escalation_reason text,      -- complaint | refund_request | order_change | urgent | sensitive_topic | not_in_docs | asked_for_human
  ai_reply          text,
  ticket_id         text,      -- Airtable record ID of the conversation's ticket
  execution_id      text       -- n8n execution ID, for tracing
);

create index if not exists support_messages_received_at_idx
  on support_messages (received_at);

-- Block reads and writes through the public (anon) key.
-- n8n uses the secret key, which bypasses these rules, so the workflow still works.
alter table documents        enable row level security;
alter table orders           enable row level security;
alter table support_messages enable row level security;


-- ---------------------------------------------------------------------
-- Part 3: demo orders (safe to run again)
-- ---------------------------------------------------------------------
-- SG-10237 and SG-10241 belong to the demo buyer Jordan Ellis. On email, the sender's address
-- is the customer's email for the order lookup: to test by email, replace jordan.ellis@example.com
-- with the address you send test emails from.
insert into orders (
  order_number, customer_name, customer_email, country, ordered_at, items,
  order_total_usd, shipping_method, status, tracking_number,
  last_tracking_event, last_tracking_at, delivered_at, is_refill_club
) values
('SG-10231', 'Emma Carter', 'emma.carter@example.com', 'US', now() - interval '9 days',
 'Tidepool Gel Cleanser x1, Dew Drop Hydrating Serum x1',
 56.00, 'USPS Ground Advantage', 'delivered', 'TEST-USPS-10231',
 'Delivered, front door', now() - interval '4 days', now() - interval '4 days', false),

('SG-10232', 'Liam Brooks', 'liam.brooks@example.com', 'US', now() - interval '3 days',
 'Night Shift Retinal Serum x1',
 53.95, 'USPS Ground Advantage', 'shipped', 'TEST-USPS-10232',
 'In transit, departed USPS facility in Portland, OR', now() - interval '1 day', null, false),

('SG-10233', 'Ava Thompson', 'ava.thompson@example.com', 'US', now() - interval '25 minutes',
 'Barrier Balm Moisturizer x2',
 64.00, 'USPS Ground Advantage', 'processing', null,
 null, null, null, false),

('SG-10235', 'Noah Patel', 'noah.patel@example.com', 'US', now() - interval '12 days',
 'Daily Shield Mineral Sunscreen SPF 40 x1, Dew Drop Hydrating Serum x1',
 62.00, 'USPS Ground Advantage', 'shipped', 'TEST-USPS-10235',
 'Accepted at USPS origin facility in Portland, OR', now() - interval '9 days', null, false),

('SG-10236', 'Chloe Martin', 'chloe.martin@example.com', 'CA', now() - interval '14 days',
 'Oat Cloud Cream Cleanser x1, Barrier Balm Moisturizer x1, Dew Drop Hydrating Serum x1',
 88.00, 'Canada Standard (tracked)', 'delivered', 'TEST-CA-10236',
 'Delivered', now() - interval '2 days', now() - interval '2 days', false),

('SG-10237', 'Jordan Ellis', 'jordan.ellis@example.com', 'US', now() - interval '6 days',
 'Weekend Glow Exfoliating Toner x1, Tidepool Gel Cleanser x1',
 53.95, 'USPS Ground Advantage', 'delivered', 'TEST-USPS-10237',
 'Delivered, mailbox', now() - interval '1 day', now() - interval '1 day', false),

('SG-10238', 'Mia Rodriguez', 'mia.rodriguez@example.com', 'US', now() - interval '16 days',
 'Night Shift Retinal Serum x1, Barrier Balm Moisturizer x1',
 80.00, 'USPS Ground Advantage', 'delivered', 'TEST-USPS-10238',
 'Delivered, front door', now() - interval '11 days', now() - interval '11 days', false),

('SG-10239', 'Ethan Walker', 'ethan.walker@example.com', 'US', now() - interval '50 days',
 'Dew Drop Hydrating Serum x1',
 39.95, 'USPS Ground Advantage', 'delivered', 'TEST-USPS-10239',
 'Delivered, mailbox', now() - interval '44 days', now() - interval '44 days', false),

('SG-10240', 'Olivia Nguyen', 'olivia.nguyen@example.com', 'US', now() - interval '3 hours',
 'Dew Drop Hydrating Serum x1, Daily Shield Mineral Sunscreen SPF 40 x1 (Refill Club, 15% off)',
 52.70, 'USPS Ground Advantage', 'processing', null,
 null, null, null, true),

('SG-10241', 'Jordan Ellis', 'jordan.ellis@example.com', 'US', now() - interval '2 days',
 'Dew Drop Hydrating Serum x1, Barrier Balm Moisturizer x1',
 66.00, 'USPS Ground Advantage', 'shipped', 'TEST-USPS-10241',
 'In transit, arrived at USPS regional facility in Sacramento, CA', now() - interval '6 hours', null, false),

('SG-10242', 'Lucas Kim', 'lucas.kim@example.com', 'US', now() - interval '1 day',
 'Night Shift Retinal Serum x1',
 62.95, 'UPS 2nd Day Air', 'shipped', 'TEST-UPS-10242',
 'In transit, on the way', now() - interval '5 hours', null, false),

('SG-10243', 'Sophia Davis', 'sophia.davis@example.com', 'US', now() - interval '5 days',
 'The Starter Trio x1',
 44.95, 'USPS Ground Advantage', 'cancelled', null,
 'Order cancelled at customer request', now() - interval '5 days', null, false),

('SG-10244', 'James Wilson', 'james.wilson@example.com', 'CA', now() - interval '30 days',
 'Weekend Glow Exfoliating Toner x1',
 38.95, 'Canada Standard (tracked)', 'refunded', 'TEST-CA-10244',
 'Return received at warehouse, refund issued', now() - interval '2 days', now() - interval '21 days', false),

('SG-10245', 'Isabella Lopez', 'isabella.lopez@example.com', 'US', now() - interval '5 days',
 'Barrier Balm Moisturizer x1, Daily Shield Mineral Sunscreen SPF 40 x1',
 60.00, 'USPS Ground Advantage', 'delivered', 'TEST-USPS-10245',
 'Delivered, front porch', now() - interval '20 hours', now() - interval '20 hours', false),

('SG-10246', 'Benjamin Hall', 'ben.hall@example.com', 'US', now() - interval '20 days',
 'Night Shift Retinal Serum x1',
 53.95, 'USPS Ground Advantage', 'delivered', 'TEST-USPS-10246',
 'Delivered, mailbox', now() - interval '15 days', now() - interval '15 days', false)
on conflict (order_number) do update set
  customer_name = excluded.customer_name,
  customer_email = excluded.customer_email,
  country = excluded.country,
  ordered_at = excluded.ordered_at,
  items = excluded.items,
  order_total_usd = excluded.order_total_usd,
  shipping_method = excluded.shipping_method,
  status = excluded.status,
  tracking_number = excluded.tracking_number,
  last_tracking_event = excluded.last_tracking_event,
  last_tracking_at = excluded.last_tracking_at,
  delivered_at = excluded.delivered_at,
  is_refill_club = excluded.is_refill_club
returning order_number, customer_name, customer_email, status, last_tracking_at;

-- Quick check: should return 15 rows.
select order_number, customer_name, status, order_total_usd from orders order by order_number;
