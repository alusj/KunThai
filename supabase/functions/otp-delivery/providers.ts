// Delivery channels. Each returns a result instead of throwing, and never
// includes codes or credentials in what it returns (results get logged).

export type SmsMode = "verify_native" | "verify_custom_code" | "messaging" | "off";

export type SendResult =
  | { ok: true; messageId: string | null; smsMode?: SmsMode }
  | { ok: false; definite: boolean; errorCode: string; unreachable?: boolean };

export interface Config {
  graphVersion: string;
  whatsappToken: string;
  whatsappPhoneNumberId: string;
  whatsappTemplate: string;
  whatsappTemplateLang: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioVerifyServiceSid: string;
  twilioMessagingServiceSid: string;
  // verify_native: Twilio Verify generates and checks its own code (works on
  //   every Verify service, no special enablement).
  // verify_custom_code: Twilio Verify sends OUR code. Only if Twilio has
  //   enabled custom codes on the service.
  // messaging: plain SMS with OUR code through a Messaging Service.
  smsMode: SmsMode;
}

export type Fetch = typeof fetch;

// WhatsApp error codes meaning "this person cannot get WhatsApp messages".
export const WHATSAPP_UNREACHABLE = new Set(["131026", "131049", "131050"]);

export async function sendWhatsApp(cfg: Config, phoneDigits: string, code: string, f: Fetch = fetch, timeoutMs = 10_000): Promise<SendResult> {
  if (!cfg.whatsappToken || !cfg.whatsappPhoneNumberId) return { ok: false, definite: true, errorCode: "not_configured" };
  const url = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.whatsappPhoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phoneDigits,
    type: "template",
    template: {
      name: cfg.whatsappTemplate,
      language: { code: cfg.whatsappTemplateLang },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        // Copy code button: the code goes in the button's URL parameter.
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
  let res: Response;
  try {
    res = await f(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.whatsappToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Network error or timeout: Meta may still have queued it, so this is
    // NOT a definite failure. No automatic SMS; the person can still tap
    // "Send code by SMS instead".
    return { ok: false, definite: false, errorCode: "whatsapp_network" };
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, messageId: json?.messages?.[0]?.id ?? null };
  const errCode = String(json?.error?.code ?? res.status);
  return { ok: false, definite: true, errorCode: `whatsapp_${errCode}`, unreachable: WHATSAPP_UNREACHABLE.has(errCode) };
}

const twilioAuth = (cfg: Config) => "Basic " + btoa(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`);

async function twilioPost(cfg: Config, url: string, form: URLSearchParams, f: Fetch, timeoutMs = 10_000): Promise<{ ok: boolean; json: any; status: number }> {
  try {
    const res = await f(url, {
      method: "POST",
      headers: { Authorization: twilioAuth(cfg), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})), status: res.status };
  } catch {
    return { ok: false, json: {}, status: 0 };
  }
}

// Sends the SMS step. In verify_native mode `code` is ignored: Twilio sends
// its own code and the returned messageId is the Verification SID.
export async function sendSms(cfg: Config, phoneDigits: string, code: string, f: Fetch = fetch, timeoutMs = 10_000): Promise<SendResult> {
  if (cfg.smsMode === "off") return { ok: false, definite: true, errorCode: "sms_off" };
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) return { ok: false, definite: true, errorCode: "sms_not_configured" };
  const to = `+${phoneDigits}`;
  const form = new URLSearchParams();
  let url: string;
  if (cfg.smsMode === "messaging") {
    if (!cfg.twilioMessagingServiceSid) return { ok: false, definite: true, errorCode: "sms_not_configured" };
    url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`;
    form.set("To", to);
    form.set("MessagingServiceSid", cfg.twilioMessagingServiceSid);
    form.set("Body", `${code} is your KunThai verification code. For your security, do not share this code.`);
  } else {
    if (!cfg.twilioVerifyServiceSid) return { ok: false, definite: true, errorCode: "sms_not_configured" };
    url = `https://verify.twilio.com/v2/Services/${cfg.twilioVerifyServiceSid}/Verifications`;
    form.set("To", to);
    form.set("Channel", "sms");
    if (cfg.smsMode === "verify_custom_code") form.set("CustomCode", code);
  }
  const r = await twilioPost(cfg, url, form, f, timeoutMs);
  if (r.ok) return { ok: true, messageId: r.json?.sid ?? null, smsMode: cfg.smsMode };
  // Status 0 = network/timeout: uncertain, not definite.
  return { ok: false, definite: r.status !== 0, errorCode: `twilio_${r.json?.code ?? r.status}` };
}

// verify_native only: ask Twilio whether `code` is right for this verification.
export async function checkTwilioVerification(cfg: Config, verificationSid: string, code: string, f: Fetch = fetch): Promise<boolean> {
  const form = new URLSearchParams({ VerificationSid: verificationSid, Code: code });
  const r = await twilioPost(cfg, `https://verify.twilio.com/v2/Services/${cfg.twilioVerifyServiceSid}/VerificationCheck`, form, f);
  return r.ok && r.json?.status === "approved";
}

// Closes a Twilio verification: "approved" is the feedback Twilio requires for
// custom codes; "canceled" ends a native verification the WhatsApp code won.
export async function setTwilioVerificationStatus(
  cfg: Config,
  verificationSid: string,
  status: "approved" | "canceled",
  f: Fetch = fetch,
): Promise<void> {
  const form = new URLSearchParams({ Status: status });
  await twilioPost(cfg, `https://verify.twilio.com/v2/Services/${cfg.twilioVerifyServiceSid}/Verifications/${verificationSid}`, form, f);
}
