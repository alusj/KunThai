alter table public.explore_profiles
add column if not exists social_links jsonb not null default '[]'::jsonb;

alter table public.explore_profiles
add column if not exists contact_email text;

alter table public.explore_profiles
add column if not exists address text;

alter table public.explore_profiles
add column if not exists cover_url text;

comment on column public.explore_profiles.social_links is
'Public social profile links for Explore profiles. Stored as an array of up to three objects: id, url, platform, and label.';

comment on column public.explore_profiles.contact_email is
'Public or contact email shown from the user profile when the user chooses to provide one.';

comment on column public.explore_profiles.address is
'User-provided profile address for contact, delivery, and transport context.';

comment on column public.explore_profiles.cover_url is
'User profile cover image URL or approved profile cover preset token.';
