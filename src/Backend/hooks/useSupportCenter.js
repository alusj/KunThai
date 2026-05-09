import { useEffect, useMemo, useState } from "react";

import { createSupportTicket, fetchSupportTickets } from "../services/explore/supportService";
import { showToast } from "../services/toastService";

export function useSupportCenter() {
  const [tickets, setTickets] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    fetchSupportTickets()
      .then((items) => {
        if (active) setTickets(items);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  async function submitTicket(input) {
    const subject = String(input.subject || "").trim();
    const message = String(input.message || "").trim();

    if (!subject || !message) {
      setFeedback("Add a subject and describe what happened.");
      return null;
    }

    setSubmitting(true);
    try {
      const ticket = await createSupportTicket({ ...input, subject, message });
      setTickets((current) => [ticket, ...current.filter((item) => item.id !== ticket.id)].slice(0, 20));
      setFeedback("Support request submitted.");
      showToast("Support request submitted.", "success");
      return ticket;
    } catch (error) {
      setFeedback(error.message || "Unable to submit support request.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  const openCount = useMemo(() => tickets.filter((ticket) => ticket.status !== "closed").length, [tickets]);

  return {
    feedback,
    openCount,
    submitTicket,
    submitting,
    tickets,
  };
}
