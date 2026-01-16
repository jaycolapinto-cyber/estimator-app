// src/emailQueue.ts
import { supabase } from "./supabaseClient";

export type QueuedEmail = {
  id: string; // unique client id
  createdAt: number;
  proposalId: string;
  to: string;
  subject: string;
  body: string;
  // optional, but nice to have
  fromName?: string;
  attemptCount?: number;
  lastError?: string;
};

const KEY = "du_email_queue_v1";

function readQueue(): QueuedEmail[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedEmail[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueueEmail(item: Omit<QueuedEmail, "id" | "createdAt">) {
  const q = readQueue();
  q.push({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attemptCount: 0,
    ...item,
  });
  writeQueue(q);
}

export async function flushEmailQueue() {
  const q = readQueue();
  if (!q.length) return { sent: 0, remaining: 0 };

  let sent = 0;
  const remaining: QueuedEmail[] = [];

  for (const item of q) {
    // if still offline, stop (keep remaining)
    if (!navigator.onLine) {
      remaining.push(item, ...q.slice(q.indexOf(item) + 1));
      break;
    }

    try {
      // Call your Edge Function. Adjust name if different.
      const { data, error } = await supabase.functions.invoke(
        "send-proposal-email",
        {
          body: {
            to: item.to,
            subject: item.subject,
            html: item.body, // if your function expects "html"
            proposalId: item.proposalId,
          },
        }
      );

      if (error) throw error;

      sent += 1;
    } catch (err: any) {
      // keep it in queue with updated error / attempts
      remaining.push({
        ...item,
        attemptCount: (item.attemptCount || 0) + 1,
        lastError: String(err?.message || err || "Send failed"),
      });
    }
  }

  writeQueue(remaining);
  return { sent, remaining: remaining.length };
}
