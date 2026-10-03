import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle, Lock, LogOut, ShieldCheck, Smartphone, TimerReset } from "lucide-react";
import supabase from "../Backend/lib/supabaseClient";
import { ConsoleLockContext } from "./consoleLockContext";
import {
  CONSOLE_CHANNEL,
  CONSOLE_HEARTBEAT_MS,
  CONSOLE_IDLE_MS,
  CONSOLE_WARNING_MS,
  consoleHeartbeat,
  getConsoleStatus,
  lockConsole,
  passcodeProblem,
  passcodeStrength,
  setConsolePasscode,
  unlockConsole,
  unlockWithAuthenticator,
  verifyAuthenticatorCode,
} from "./consoleLockService";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];
// Set when an admin chooses "Forgot passcode" and signs out to re-authenticate.
const RESET_FLAG_KEY = "kunthai-admin-console-reset";
const RESET_FLAG_MAX_AGE_MS = 30 * 60 * 1000;

function readResetFlag() {
  try {
    const at = Number(sessionStorage.getItem(RESET_FLAG_KEY) || 0);
    return at > 0 && Date.now() - at < RESET_FLAG_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function writeResetFlag(on) {
  try {
    if (on) sessionStorage.setItem(RESET_FLAG_KEY, String(Date.now()));
    else sessionStorage.removeItem(RESET_FLAG_KEY);
  } catch {
    // Without storage the admin simply chooses "Forgot passcode" again.
  }
}

function Shell({ children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100 shadow-2xl sm:p-7">
        {children}
      </section>
    </main>
  );
}

function Heading({ icon: Icon, eyebrow, title, detail }) {
  return (
    <header>
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400"><Icon size={24} /></span>
      <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-400">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-black text-white">{title}</h1>
      {detail ? <p className="mt-2 text-sm font-medium leading-6 text-zinc-400">{detail}</p> : null}
    </header>
  );
}

function PasscodeInput({ id, label, value, onChange, autoFocus = false, autoComplete = "current-password", onEnter }) {
  const [visible, setVisible] = useState(false);
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-bold text-zinc-300">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") onEnter?.(); }}
          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 pr-12 text-base font-bold tracking-wider text-white outline-none focus:border-emerald-500"
        />
        <button type="button" aria-label={visible ? "Hide passcode" : "Show passcode"} onClick={() => setVisible((current) => !current)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white">
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </label>
  );
}

function CodeInput({ value, onChange, onEnter }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-zinc-300">Authenticator code</span>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(event) => { if (event.key === "Enter") onEnter?.(); }}
        placeholder="000000"
        className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-center text-xl font-black tracking-[0.5em] text-white outline-none focus:border-emerald-500"
      />
    </label>
  );
}

function PrimaryAction({ busy, children, onClick, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400">
      {busy ? <LoaderCircle size={17} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function ErrorLine({ message }) {
  return message ? <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">{message}</p> : null;
}

function StrengthMeter({ passcode }) {
  const score = passcodeStrength(passcode);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const tones = ["bg-zinc-700", "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-400"];
  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((step) => <span key={step} className={`h-1.5 rounded-full ${score >= step ? tones[score] : "bg-zinc-800"}`} />)}
      </div>
      {passcode ? <p className="mt-1 text-[11px] font-bold text-zinc-400">{labels[score]}</p> : null}
    </div>
  );
}

function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// First visit (or a reset): confirm with the authenticator, then choose a passcode.
function SetupScreen({ status, reset = false, onDone, onCancel }) {
  // A reset needs a brand-new sign-in plus a fresh authenticator check; the
  // database enforces this, the screen just asks for whatever is missing.
  const [step, setStep] = useState((reset ? status?.reauthFresh : status?.mfaFresh) ? "passcode" : "verify");
  const [code, setCode] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    setBusy(true); setError("");
    try { await verifyAuthenticatorCode(code); setStep("passcode"); } catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  async function save() {
    const problem = passcodeProblem(passcode, confirmation);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try { onDone(await setConsolePasscode(passcode)); } catch (nextError) { setError(nextError.message); setBusy(false); }
  }

  return (
    <Shell>
      {step === "verify" ? (
        <>
          <Heading icon={Smartphone} eyebrow={reset ? "Reset console passcode" : "Secure your console"} title="Confirm it's you" detail="Enter the current code from your authenticator app. Console passcodes can only be created or changed right after this check." />
          <div className="mt-5"><CodeInput value={code} onChange={setCode} onEnter={verify} /></div>
          <ErrorLine message={error} />
          <PrimaryAction busy={busy} disabled={code.length !== 6} onClick={verify}>Verify</PrimaryAction>
        </>
      ) : (
        <>
          <Heading icon={KeyRound} eyebrow={reset ? "Reset console passcode" : "Secure your console"} title={reset ? "Choose a new passcode" : "Create your console passcode"} detail="The admin console locks after 5 minutes without activity. You will need this passcode to open it again. It is separate from your account password." />
          <div className="mt-5 space-y-4">
            <div>
              <PasscodeInput id="new-passcode" label="Passcode (6 or more characters)" value={passcode} onChange={setPasscode} autoFocus autoComplete="new-password" />
              <StrengthMeter passcode={passcode} />
            </div>
            <PasscodeInput id="confirm-passcode" label="Repeat the passcode" value={confirmation} onChange={setConfirmation} autoComplete="new-password" onEnter={save} />
          </div>
          <ul className="mt-4 space-y-1 text-xs font-semibold leading-5 text-zinc-400">
            <li>• Never reuse your KunThai password or share the passcode.</li>
            <li>• 5 wrong attempts lock the console for 15 minutes and sign you out.</li>
          </ul>
          <ErrorLine message={error} />
          <PrimaryAction busy={busy} onClick={save}>Save passcode and open console</PrimaryAction>
        </>
      )}
      {onCancel ? <button type="button" onClick={onCancel} className="mt-3 w-full text-center text-xs font-bold text-zinc-400 hover:text-white">Back</button> : null}
    </Shell>
  );
}

// "Forgot passcode": the only way to reset is to sign in again from scratch
// (password or code, then the authenticator). An unattended open session can
// never change the passcode.
function ForgotScreen({ user, onReauthenticate, onBack }) {
  const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <Heading
        icon={KeyRound}
        eyebrow="Forgot console passcode"
        title="Sign in again to reset it"
        detail={`For your security, ${user?.email || "this account"} must sign in again (account password or sign-in code, then your authenticator) before a new console passcode can be set. Other devices using this console will be locked.`}
      />
      <PrimaryAction busy={busy} onClick={() => { setBusy(true); onReauthenticate(); }}><LogOut size={16} /> Sign out and sign in again</PrimaryAction>
      <button type="button" onClick={onBack} className="mt-3 w-full text-center text-xs font-bold text-zinc-400 hover:text-white">Back to unlock</button>
    </Shell>
  );
}

function LockScreen({ user, status, onUnlocked, onForgot, onSignOut, onRecheck }) {
  const [mode, setMode] = useState("passcode");
  const [passcode, setPasscode] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(status?.lockedUntil ? new Date(status.lockedUntil).getTime() : 0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lockedUntil) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const lockedOut = lockedUntil > now;

  async function submitPasscode() {
    if (!passcode) return;
    setBusy(true); setError("");
    try {
      const result = await unlockConsole(passcode);
      setPasscode("");
      if (result?.ok) { onUnlocked(result.status); return; }
      if (result?.reason === "locked_out") {
        setLockedUntil(new Date(result.lockedUntil).getTime());
        setError("Too many wrong passcodes. For your security you are being signed out.");
        window.setTimeout(onSignOut, 3500);
      } else if (result?.reason === "no_passcode") {
        onRecheck();
      } else {
        setError(`Wrong passcode. ${result?.attemptsLeft ?? 0} attempt${result?.attemptsLeft === 1 ? "" : "s"} left before the console locks for 15 minutes.`);
      }
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true); setError("");
    try { onUnlocked(await unlockWithAuthenticator(code)); } catch (nextError) { setError(nextError.message); setBusy(false); }
  }

  return (
    <Shell>
      <Heading
        icon={Lock}
        eyebrow="Console locked"
        title="KunThai Admin is locked"
        detail={`${user?.email || "This account"} · Locked to protect admin data while you were away.`}
      />
      {lockedOut ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-3 text-sm font-bold text-red-300">
          <TimerReset size={17} /> Passcode entry is paused for {formatCountdown(lockedUntil - now)}. You can still unlock with your authenticator.
        </p>
      ) : null}
      {mode === "passcode" && !lockedOut ? (
        <>
          <div className="mt-5"><PasscodeInput id="unlock-passcode" label="Console passcode" value={passcode} onChange={setPasscode} autoFocus onEnter={submitPasscode} /></div>
          <ErrorLine message={error} />
          <PrimaryAction busy={busy} disabled={!passcode} onClick={submitPasscode}><Lock size={16} /> Unlock</PrimaryAction>
          <button type="button" onClick={() => { setMode("authenticator"); setError(""); }} className="mt-3 inline-flex w-full items-center justify-center gap-2 text-xs font-bold text-zinc-400 hover:text-white"><Smartphone size={14} /> Use my authenticator app instead</button>
        </>
      ) : (
        <>
          <div className="mt-5"><CodeInput value={code} onChange={setCode} onEnter={submitCode} /></div>
          <ErrorLine message={error} />
          <PrimaryAction busy={busy} disabled={code.length !== 6} onClick={submitCode}><ShieldCheck size={16} /> Unlock with authenticator</PrimaryAction>
          {!lockedOut ? <button type="button" onClick={() => { setMode("passcode"); setError(""); }} className="mt-3 w-full text-center text-xs font-bold text-zinc-400 hover:text-white">Use my passcode instead</button> : null}
        </>
      )}
      <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4 text-xs font-bold">
        <button type="button" onClick={onForgot} className="text-zinc-400 hover:text-white">Forgot passcode?</button>
        <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white"><LogOut size={14} /> Sign out</button>
      </div>
    </Shell>
  );
}

// Wraps the admin workspace. Nothing inside renders while the console is
// locked, and the database refuses admin requests until it is unlocked again.
export default function AdminConsoleLock({ user, bypass = false, children }) {
  const [status, setStatus] = useState(null);
  const [view, setView] = useState(bypass ? "unlocked" : "loading");
  const [loadError, setLoadError] = useState("");
  const [warningLeft, setWarningLeft] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const lastHeartbeatRef = useRef(Date.now());
  const channelRef = useRef(null);

  const applyStatus = useCallback((next) => {
    setStatus(next);
    if (!next?.passcodeSet) setView("setup");
    else if (!next?.unlocked) setView(readResetFlag() ? "reset" : "locked");
    else {
      lastActivityRef.current = Date.now();
      lastHeartbeatRef.current = Date.now();
      setView("unlocked");
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoadError("");
    try { applyStatus(await getConsoleStatus()); } catch (nextError) { setLoadError(nextError.message); }
  }, [applyStatus]);

  useEffect(() => { if (!bypass) refresh(); }, [bypass, refresh]);

  const lockNow = useCallback(async ({ broadcast = true } = {}) => {
    setWarningLeft(0);
    setView((current) => (current === "unlocked" ? "locked" : current));
    setStatus((current) => (current ? { ...current, unlocked: false } : current));
    if (broadcast) channelRef.current?.postMessage({ type: "locked" });
    await lockConsole();
  }, []);

  // All admin tabs in this browser lock and unlock together.
  useEffect(() => {
    if (bypass || typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel(CONSOLE_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === "locked") lockNow({ broadcast: false });
      if (event.data?.type === "unlocked") refresh();
    };
    return () => { channel.close(); channelRef.current = null; };
  }, [bypass, lockNow, refresh]);

  // Idle tracking while unlocked: warn 30 s before locking, lock at 5 min,
  // keep the server session alive while the admin is actually working.
  useEffect(() => {
    if (bypass || view !== "unlocked") return undefined;
    function markActive() {
      lastActivityRef.current = Date.now();
      setWarningLeft(0);
    }
    async function tick() {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= CONSOLE_IDLE_MS) { lockNow(); return; }
      setWarningLeft(idle >= CONSOLE_IDLE_MS - CONSOLE_WARNING_MS ? CONSOLE_IDLE_MS - idle : 0);
      const activeSinceHeartbeat = lastActivityRef.current > lastHeartbeatRef.current;
      if (activeSinceHeartbeat && Date.now() - lastHeartbeatRef.current >= CONSOLE_HEARTBEAT_MS) {
        lastHeartbeatRef.current = Date.now();
        try {
          const next = await consoleHeartbeat();
          if (!next?.unlocked) lockNow({ broadcast: false });
        } catch {
          // A network blip is not a reason to lock; the next tick retries.
        }
      }
    }
    function onVisible() { if (document.visibilityState === "visible") tick(); }
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActive, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(tick, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [bypass, lockNow, view]);

  const signOut = useCallback(async () => {
    await lockConsole();
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const reauthenticateForReset = useCallback(async () => {
    writeResetFlag(true);
    await lockConsole();
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const unlocked = useCallback((next) => {
    writeResetFlag(false);
    channelRef.current?.postMessage({ type: "unlocked" });
    applyStatus(next);
  }, [applyStatus]);

  const contextValue = useMemo(() => ({ lockNow: () => lockNow(), enabled: !bypass }), [bypass, lockNow]);

  if (bypass) return <ConsoleLockContext.Provider value={contextValue}>{children}</ConsoleLockContext.Provider>;

  if (view === "loading") {
    return (
      <Shell>
        {loadError ? (
          <>
            <Heading icon={Lock} eyebrow="Console security" title="Couldn't check the console lock" detail={loadError} />
            <PrimaryAction onClick={refresh}>Try again</PrimaryAction>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm font-bold text-zinc-400"><LoaderCircle size={17} className="animate-spin text-emerald-400" /> Checking console security…</p>
        )}
      </Shell>
    );
  }
  if (view === "setup") return <SetupScreen status={status} onDone={unlocked} />;
  if (view === "forgot") return <ForgotScreen user={user} onReauthenticate={reauthenticateForReset} onBack={() => setView("locked")} />;
  if (view === "reset") {
    return (
      <SetupScreen
        status={status}
        reset
        onDone={unlocked}
        onCancel={() => { writeResetFlag(false); setView("locked"); }}
      />
    );
  }
  if (view === "locked") return <LockScreen user={user} status={status} onUnlocked={unlocked} onForgot={() => setView("forgot")} onSignOut={signOut} onRecheck={refresh} />;

  return (
    <ConsoleLockContext.Provider value={contextValue}>
      {children}
      {warningLeft > 0 ? (
        <div role="alert" className="fixed inset-x-3 bottom-3 z-[95] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-2xl sm:bottom-6">
          <Lock size={18} className="shrink-0" />
          <p className="flex-1 text-sm font-black">Locking in {Math.ceil(warningLeft / 1000)} s for inactivity</p>
          <button type="button" onClick={() => { lastActivityRef.current = Date.now(); setWarningLeft(0); }} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black text-white">Stay unlocked</button>
        </div>
      ) : null}
    </ConsoleLockContext.Provider>
  );
}
