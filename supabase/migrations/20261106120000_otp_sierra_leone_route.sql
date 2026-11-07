-- Sierra Leone (+232) phone codes: WhatsApp first, Orange SMS second, Twilio
-- Verify SMS last. Every other country keeps the '*' route (WhatsApp, then
-- Twilio Verify) from 20260926170000_otp_delivery_chain.sql.
--
-- A step whose provider is not configured yet (no WhatsApp token, no Orange
-- client id) is skipped at once, so this route is safe before Meta or Orange
-- are live: codes simply go out through Twilio Verify. Safe to re-run.

begin;

insert into public.kunthai_otp_routes (calling_code, channels, note)
values ('232', array['whatsapp', 'orange_sms', 'twilio_verify'], 'Sierra Leone: WhatsApp first, Orange SMS second, Twilio Verify last.')
on conflict (calling_code) do update
  set channels = excluded.channels,
      note = excluded.note,
      is_active = true,
      updated_at = timezone('utc', now());

update public.kunthai_otp_routes
   set channels = array['whatsapp', 'twilio_verify'],
       note = 'Global default: WhatsApp first, Twilio Verify SMS last.',
       updated_at = timezone('utc', now())
 where calling_code = '*';

commit;
