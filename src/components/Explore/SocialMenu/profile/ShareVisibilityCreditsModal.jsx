import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineMagnifyingGlass,
  HiOutlinePaperAirplane,
} from "react-icons/hi2";

import { MINIMUM_CREDIT_TRANSFER_BALANCE } from "../../../../Backend/services/visibilityCreditService";
import CenteredModal from "../../../shared/CenteredModal";
import KunThaiIdHelpButton from "../../../shared/KunThaiIdHelpButton";
import Avatar from "../../shared/Avatar";

const EMPTY_RECIPIENT = null;

export default function ShareVisibilityCreditsModal({
  balance = 0,
  currentUserId = "",
  loading = false,
  onClose,
  onLookup,
  onTransfer,
  open,
}) {
  const [kunThaiId, setKunThaiId] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState(EMPTY_RECIPIENT);
  const [lookupState, setLookupState] = useState("idle");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(0);
  const numericBalance = Number(balance || 0);
  const numericAmount = Math.floor(Number(amount || 0));
  const canAccessTransfer = !loading && numericBalance > MINIMUM_CREDIT_TRANSFER_BALANCE;
  const amountValid = numericAmount > 0 && numericAmount <= numericBalance;
  const canSubmit = canAccessTransfer && recipient && amountValid && !submitting;

  const amountMessage = useMemo(() => {
    if (!amount) return "";
    if (!Number.isFinite(numericAmount) || numericAmount < 1) return "Enter at least 1 credit.";
    if (numericAmount > numericBalance) return `You only have ${numericBalance} credits available.`;
    return `${numericBalance - numericAmount} credits will remain after sharing.`;
  }, [amount, numericAmount, numericBalance]);

  useEffect(() => {
    if (!open) return;
    setKunThaiId("");
    setAmount("");
    setRecipient(EMPTY_RECIPIENT);
    setLookupState("idle");
    setMessage("");
    setSubmitting(false);
    requestIdRef.current += 1;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape" && !submitting) onClose?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, submitting]);

  useEffect(() => {
    if (!open || !canAccessTransfer) return undefined;

    const input = kunThaiId.trim();
    setRecipient(EMPTY_RECIPIENT);
    setMessage("");

    if (input.replace(/[^a-z0-9]/gi, "").length < 6) {
      setLookupState(input ? "typing" : "idle");
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLookupState("loading");

    const timer = window.setTimeout(async () => {
      try {
        const result = await onLookup?.(input);
        if (requestIdRef.current !== requestId) return;
        if (!result) {
          setLookupState("missing");
          return;
        }
        if (result.userId === currentUserId) {
          setLookupState("self");
          return;
        }
        setRecipient(result);
        setLookupState("found");
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        setLookupState("error");
        setMessage(error.message || "Unable to check that KunThai ID.");
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [canAccessTransfer, currentUserId, kunThaiId, onLookup, open]);

  async function submitTransfer(event) {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      setMessage("");
      await onTransfer?.(recipient.publicId || kunThaiId, numericAmount);
      onClose?.();
    } catch (error) {
      setMessage(error.message || "Unable to share Visibility Credits.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={submitting ? undefined : onClose} labelledBy="share-visibility-credits-title" dismissOnBackdrop={!submitting}>
      <form onSubmit={submitTransfer}>
        <div className="-mx-5 -mt-5 overflow-hidden rounded-t-3xl bg-gradient-to-br from-sky-600 via-sky-700 to-slate-950 px-5 pb-5 pt-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-100">Visibility Credits</p>
              <h2 id="share-visibility-credits-title" className="mt-1 text-xl font-black">Share credit</h2>
            </div>
            <motion.div
              initial={{ scale: 0.7, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 19 }}
              className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-right shadow-lg backdrop-blur"
            >
              <span className="block text-2xl font-black leading-none">{loading ? "…" : numericBalance}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-sky-100">Total credits</span>
            </motion.div>
          </div>
        </div>

        {!canAccessTransfer ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"
          >
            <p className="text-sm font-black text-amber-950">You need more than {MINIMUM_CREDIT_TRANSFER_BALANCE} credits to share.</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
              Your balance is safe. Earn or buy more credits, then return here to share them with another KunThai user.
            </p>
          </motion.div>
        ) : (
          <>
            <div className="mt-5 flex min-h-8 items-center justify-between gap-3">
              <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-600" htmlFor="credit-recipient-id">
                Recipient KunThai ID
              </label>
              <KunThaiIdHelpButton subject="credit recipient" tone="sky" />
            </div>
            <div className="relative mt-2">
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
              <input
                id="credit-recipient-id"
                value={kunThaiId}
                onChange={(event) => setKunThaiId(event.target.value.toUpperCase())}
                placeholder="KTU-XXXX-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-black uppercase tracking-wide text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
            </div>

            <div className="min-h-[76px]">
              <AnimatePresence mode="wait">
                {lookupState === "loading" ? (
                  <motion.div key="loading" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
                    <span className="text-xs font-bold text-slate-500">Finding this KunThai user…</span>
                  </motion.div>
                ) : null}
                {lookupState === "found" && recipient ? (
                  <motion.div key={recipient.userId} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ type: "spring", stiffness: 370, damping: 25 }} className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                    <Avatar name={recipient.name} src={recipient.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-950">{recipient.name}</p>
                      <p className="truncate text-xs font-bold text-slate-500">{recipient.username ? `@${recipient.username}` : recipient.publicId}</p>
                    </div>
                    <HiOutlineCheckCircle className="shrink-0 text-2xl text-emerald-600" />
                  </motion.div>
                ) : null}
                {["missing", "self", "error"].includes(lookupState) ? (
                  <motion.p key={lookupState} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                    {lookupState === "self"
                      ? "Use another user's KunThai ID — you cannot share credits with yourself."
                      : lookupState === "missing"
                        ? "No KunThai user was found with that ID."
                        : message || "Unable to check that KunThai ID."}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {recipient ? (
                <motion.div initial={{ opacity: 0, height: 0, y: 8 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-600" htmlFor="credit-transfer-amount">
                    Credits to share
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id="credit-transfer-amount"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max={numericBalance}
                      step="1"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="0"
                      className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                    />
                    <button type="button" onClick={() => setAmount(String(numericBalance))} className="h-12 rounded-2xl bg-sky-50 px-4 text-xs font-black text-sky-700 transition hover:bg-sky-100">
                      Max
                    </button>
                  </div>
                  {amountMessage ? <p className={`mt-2 text-xs font-bold ${amountValid ? "text-slate-500" : "text-rose-600"}`}>{amountMessage}</p> : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        )}

        {message && lookupState !== "error" ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{message}</p> : null}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50">
            Cancel
          </button>
          {canAccessTransfer ? (
            <motion.button
              type="submit"
              whileTap={canSubmit ? { scale: 0.97 } : undefined}
              disabled={!canSubmit}
              className="inline-flex h-12 flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-lg shadow-slate-950/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Sharing…" : "Share credits"}
              {submitting ? <HiOutlinePaperAirplane className="animate-pulse" /> : <HiOutlineArrowRight />}
            </motion.button>
          ) : null}
        </div>
      </form>
    </CenteredModal>
  );
}
