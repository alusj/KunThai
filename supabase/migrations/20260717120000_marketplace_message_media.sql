-- UrMall buyer/seller chat: image attachments on marketplace messages.
alter table public.marketplace_customer_messages
  add column if not exists media_url text not null default '',
  add column if not exists media_type text not null default 'text';
