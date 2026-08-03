import { Router } from "express";
import { requireAuthenticated } from "../middleware.ts";
import { AddressBookEntry } from "../models/index.ts";
import { HttpError } from "../errors.ts";

/* ============================================================================
   Address-book routes. A user's personal saved wallets for the New Payout
   flow — "from" (refund/treasury) and "to" (recipient) addresses. Entries are
   scoped to the authenticated user; no one else can read or mutate them.
   ========================================================================== */

export const addressBookRoutes = Router();

interface AddressBookEntryPublic {
  id: string;
  side: "from" | "to";
  label: string;
  address: string;
}

function toPublic(e: any): AddressBookEntryPublic {
  return { id: e._id.toString(), side: e.side, label: e.label ?? "", address: e.address };
}

/** @openapi
 * /address-book:
 *   get:
 *     tags: [Address book]
 *     summary: List the authenticated user's saved wallets
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ entries: AddressBookEntry[] }" }
 *       401: { description: Not authenticated }
 */
addressBookRoutes.get("/address-book", requireAuthenticated, async (req, res, next) => {
  try {
    const entries = await AddressBookEntry.find({ ownerUserId: req.session.userId }).sort({ _id: 1 }).lean();
    res.json({ entries: entries.map(toPublic) });
  } catch (e) {
    next(e);
  }
});

/** @openapi
 * /address-book:
 *   post:
 *     tags: [Address book]
 *     summary: Save a wallet to the authenticated user's address book
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [side, address]
 *             properties:
 *               side: { type: string, enum: [from, to] }
 *               label: { type: string }
 *               address: { type: string }
 *     responses:
 *       201: { description: "{ entry: AddressBookEntry }" }
 *       400: { description: Missing or invalid fields }
 *       401: { description: Not authenticated }
 */
addressBookRoutes.post("/address-book", requireAuthenticated, async (req, res, next) => {
  try {
    const { side, label, address } = req.body ?? {};
    if (side !== "from" && side !== "to") {
      throw new HttpError(400, "side must be 'from' or 'to'.");
    }
    if (!address || !String(address).trim()) {
      throw new HttpError(400, "address is required.");
    }
    const doc = await AddressBookEntry.create({
      ownerUserId: req.session.userId!,
      side,
      label: String(label ?? "").trim(),
      address: String(address).trim(),
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ entry: toPublic(doc) });
  } catch (e) {
    next(e);
  }
});

/** @openapi
 * /address-book/{id}:
 *   delete:
 *     tags: [Address book]
 *     summary: Delete a saved wallet (only if it belongs to the caller)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ ok: true }" }
 *       401: { description: Not authenticated }
 *       404: { description: Entry not found }
 */
addressBookRoutes.delete("/address-book/:id", requireAuthenticated, async (req, res, next) => {
  try {
    const result = await AddressBookEntry.deleteOne({ _id: req.params.id, ownerUserId: req.session.userId });
    if (result.deletedCount === 0) throw new HttpError(404, "Entry not found.");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
