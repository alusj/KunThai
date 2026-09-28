// Delivery channels. Each returns a result instead of throwing, and never
// includes the code or credentials in what it returns (results get logged).

export type SendResult =
  | { ok: true; messageId: string | null }
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
  twilioVerifyCustomCode: boolean;
  twilioMessagingServiceSid: string;
}

export type Fetch = typeof fetch;

// WhatsApp error codes meaning "this person cannot get WhatsApp messages".
const WHATSAPP_UNREACHABLE = new Set(["131026", "131049", "131050"]);

export async function sendWhatsApp(cfg: Config, phoneDigits: string, code: string, f: Fetch = fetch): Promise<SendResult> {
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
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Network error or timeout: Meta may still have queued it, so this is
    // NOT a definite failure. No automatic SMS; the person can still tap
    // "Send code by SMS instead".
    return { ok: false, definite: false, errorCode: "whatsapp_network" };
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    return { ok: true, messageId: json?.messages?.[0]?.id ?? null };
  }
  const errCode = String(json?.error?.code ?? res.status);
  return { ok: false, definite: true, errorCode: `whatsapp_${errCode}`, unreachable: WHATSAPP_UNREACHABLE.has(errCode) };
}

export async function sendTwilio(cfg: Config, phoneDigits: string, code: string, f: Fetch = fetch): Promise<SendResult> {
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) return { ok: false, definite: true, errorCode: "not_configured" };
  const auth = "Basic " + btoa(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`);
  const to = `+${phoneDigits}`;
  let url: string;
  const form = new URLSearchParams();
  if (cfg.twilioVerifyServiceSid && cfg.twilioVerifyCustomCode) {
    // Twilio Verify with a custom code (feature must be enabled by Twilio).
    url = `https://verify.twilio.com/v2/Services/${cfg.twilioVerifyServiceSid}/Verifications`;
    form.set("To", to);
    form.set("Channel", "sms");
    form.set("CustomCode", code);
  } else if (cfg.twilioMessagingServiceSid) {
    url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`;
    form.set("To", to);
    form.set("MessagingServiceSid", cfg.twilioMessagingServiceSid);
    form.set("Body", `${code} is your KunThai verification code. For your security, do not share this code.`);
  } else {
    return { ok: false, definite: true, errorCode: "sms_not_configured" };
  }
  try {
    const res = await f(url, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, messageId: json?.sid ?? null };
    return { ok: false, definite: true, errorCode: `twilio_${json?.code ?? res.status}` };
  } catch {
    return { ok: false, definite: true, errorCode: "network" };
  }
}
