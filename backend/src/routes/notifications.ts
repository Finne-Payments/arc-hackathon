import { Router } from "express";
import { requireAuthenticated } from "../middleware.ts";
import { Notification, User } from "../models/index.ts";

/* ============================================================================
   Notification routes — scoped to the caller's role + platform/wallet.
   ========================================================================== */

export const notificationRoutes = Router();

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get the caller's notifications (unread first, then recent)
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{ notifications: NotificationRow[], unreadCount: number }" } }
 */
notificationRoutes.get("/notifications", requireAuthenticated, async (req, res, next) => {
  try {
    const role = req.session.role!;
    const userId = req.session.userId!;
    const user = await User.findById(userId).lean();

    // Build the query based on the caller's role. Case-insensitive wallet match
    // — the chain stores checksummed addresses, the user's wallet is lowercase.
    const query: Record<string, unknown> = { audienceRole: role };
    if (role === "recipient") {
      const w = user?.walletAddress ?? "";
      query.recipientWallet = { $regex: new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    } else {
      query.platformKey = user?.platformKey ?? "northbeam";
    }

    const all = await Notification.find(query).sort({ createdAt: -1 }).limit(30).lean();
    const unreadCount = all.filter((n) => !n.readAt).length;

    res.json({ notifications: all, unreadCount });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /notifications/{id}/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark a single notification as read
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "Marked as read" } }
 */
notificationRoutes.post("/notifications/:id/read", requireAuthenticated, async (req, res, next) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id },
      { $set: { readAt: new Date().toISOString() } },
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark all of the caller's notifications as read
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "All marked as read" } }
 */
notificationRoutes.post("/notifications/read-all", requireAuthenticated, async (req, res, next) => {
  try {
    const role = req.session.role!;
    const userId = req.session.userId!;
    const user = await User.findById(userId).lean();

    const query: Record<string, unknown> = { audienceRole: role, readAt: null };
    if (role === "recipient") {
      query.recipientWallet = user?.walletAddress;
    } else {
      query.platformKey = user?.platformKey ?? "northbeam";
    }

    await Notification.updateMany(query, { $set: { readAt: new Date().toISOString() } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
