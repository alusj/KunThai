import { useState } from "react";
import {
  HiOutlineBellAlert,
  HiOutlineCamera,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import SocialScreenHeader from "../shared/SocialScreenHeader";

const permissions = [
  {
    id: "camera",
    title: "Camera and photos",
    icon: HiOutlineCamera,
    status: "Asked when needed",
    summary: "Used only when you choose to capture or attach media.",
    detail: "KunThai does not switch on your camera in the background. Your browser or device controls final access.",
  },
  {
    id: "microphone",
    title: "Microphone",
    icon: HiOutlineMicrophone,
    status: "Asked when needed",
    summary: "Used for voice notes or media you deliberately record.",
    detail: "Recording starts only from a visible recording action. You can deny access through your device settings.",
  },
  {
    id: "location",
    title: "Location",
    icon: HiOutlineMapPin,
    status: "Optional",
    summary: "Used only for features where nearby context is useful and permission is granted.",
    detail: "Explore does not use precise location for recommendations by default. Local personalization requires a separate opt-in.",
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: HiOutlineBellAlert,
    status: "Controlled by device",
    summary: "Helps deliver account, message, service, and safety updates.",
    detail: "Notification categories are managed in Settings. Browser or operating-system permission remains under your control.",
  },
  {
    id: "contacts",
    title: "Contacts",
    icon: HiOutlineUserGroup,
    status: "Not requested",
    summary: "KunThai Explore does not currently import your phone contacts.",
    detail: "A future contacts feature would require a clear permission and privacy flow before any contact access occurs.",
  },
];

export default function PermissionsScreen({ hideHeader = false, onOpenPrivacy }) {
  const [expandedId, setExpandedId] = useState("");

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Permissions" subtitle="See what KunThai may request and when the choice stays with you." /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineShieldCheck className="text-3xl" /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Permission clarity</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950">Access should have a clear purpose</h3>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">KunThai asks at the moment a feature needs access. Declining an optional permission should not block unrelated services.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {permissions.map((permission) => {
            const Icon = permission.icon;
            const expanded = expandedId === permission.id;
            return (
              <article key={permission.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="text-xl" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-base font-black text-slate-950">{permission.title}</h4>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">{permission.status}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{permission.summary}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setExpandedId(expanded ? "" : permission.id)} className="mt-3 inline-flex items-center gap-1 text-sm font-black text-sky-700">
                  {expanded ? "Show less" : "Why this is used"}
                  {expanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </button>
                {expanded ? <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">{permission.detail}</p> : null}
              </article>
            );
          })}
        </section>

        <button type="button" onClick={onOpenPrivacy} className="w-full rounded-[24px] border border-sky-100 bg-sky-50 p-5 text-left">
          <p className="text-base font-black text-sky-950">Review Privacy Center</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-sky-800">Manage visibility, messages, blocked accounts, and future data requests.</p>
        </button>

        {/* Future backend: sync coarse-location personalization consent and permission audit timestamps after a dedicated consent flow ships. */}
      </div>
    </div>
  );
}
