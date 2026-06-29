import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";

const SUPPORT_TICKETS_KEY = "explore-support-tickets";
const SUPPORT_TICKETS_TABLE = "explore_support_tickets";

function readLocalTickets() {
  try {
    const value = JSON.parse(localStorage.getItem(SUPPORT_TICKETS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocalTickets(tickets) {
  localStorage.setItem(SUPPORT_TICKETS_KEY, JSON.stringify(tickets));
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || "";
}

function normalizeTicket(ticket) {
  return {
    id: ticket.id || `ticket-${Date.now()}`,
    category: ticket.category || "General",
    subject: ticket.subject || "Support request",
    message: ticket.message || "",
    priority: ticket.priority || "normal",
    status: ticket.status || "open",
    adminReply: ticket.admin_reply || ticket.adminReply || "",
    createdAt: ticket.created_at || ticket.createdAt || new Date().toISOString(),
  };
}

export async function fetchSupportTickets() {
  const localTickets = readLocalTickets();
  const userId = await getCurrentUserId();

  if (!userId) {
    return localTickets.map(normalizeTicket);
  }

  const { data, error } = await supabase
    .from(SUPPORT_TICKETS_TABLE)
    .select("id, category, subject, message, priority, status, admin_reply, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingTable(error)) {
      return localTickets.map(normalizeTicket);
    }
    throw error;
  }

  const tickets = (data || []).map(normalizeTicket);
  writeLocalTickets(tickets);
  return tickets;
}

export async function createSupportTicket(input) {
  const ticket = normalizeTicket({
    ...input,
    id: `ticket-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: "open",
  });
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Sign in to send this request to KunThai support.");
  }

  const payload = {
    user_id: userId,
    category: ticket.category,
    subject: ticket.subject,
    message: ticket.message,
    priority: ticket.priority,
    status: ticket.status,
  };

  const { data, error } = await supabase.from(SUPPORT_TICKETS_TABLE).insert(payload).select().maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      const unavailable = new Error("KunThai support is temporarily unavailable. Your request was not submitted; please try again shortly.");
      unavailable.code = "SUPPORT_UNAVAILABLE";
      throw unavailable;
    }
    throw error;
  }

  const syncedTicket = data ? normalizeTicket(data) : ticket;
  writeLocalTickets([syncedTicket, ...readLocalTickets().filter((item) => item.id !== ticket.id)].slice(0, 20));
  return syncedTicket;
}
