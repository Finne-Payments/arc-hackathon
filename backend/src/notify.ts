import { Notification } from "./models/index.ts";

/* ============================================================================
   Notification helper — called from every service function at the point a
   state change happens. Creates one Notification doc per audience member.
   ========================================================================== */

export interface AudienceMember {
  role: "reviewer" | "recipient" | "platform_viewer";
  platformKey?: string | null;
  recipientWallet?: string | null;
}

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  caseNumber?: string | null;
  paymentId?: string | null;
  audience: AudienceMember[];
}

export async function notify(input: NotifyInput): Promise<void> {
  const now = new Date().toISOString();
  const docs = input.audience.map((a) => ({
    type: input.type,
    title: input.title,
    body: input.body,
    caseNumber: input.caseNumber ?? null,
    paymentId: input.paymentId ?? null,
    audienceRole: a.role,
    platformKey: a.platformKey ?? null,
    recipientWallet: a.recipientWallet ?? null,
    readAt: null,
    createdAt: now,
  }));
  if (docs.length > 0) {
    try {
      await Notification.insertMany(docs);
    } catch (e) {
      console.error("[notify] failed to create notifications:", e instanceof Error ? e.message : e);
    }
  }
}
