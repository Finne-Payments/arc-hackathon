import { useCallback, useEffect, useState } from "react";
import { api, type AddressBookEntry } from "./api";

/* ============================================================================
   Address book for the New Payout flow — backed by the database (not browser
   storage), so a user's saved "from" (refund/treasury) and "to" (recipient)
   wallets follow them across devices. Entries are scoped to the authenticated
   user on the server (GET/POST/DELETE /address-book).
   ========================================================================== */

export interface AddressEntry {
  id: string;
  label: string;
  address: string;
}

type Side = "from" | "to";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Case-insensitive equality for 0x addresses (checksum vs lowercase mismatch). */
export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function useAddressBook() {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await api.listAddressBook();
      setEntries(res.entries);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const addEntry = useCallback(async (side: Side, label: string, address: string): Promise<AddressEntry> => {
    const { entry } = await api.addAddressBook({ side, label, address });
    setEntries((prev) => [...prev, entry]);
    return entry;
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    await api.removeAddressBook(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return {
    loading,
    reload,
    from: entries
      .filter((e) => e.side === "from")
      .map(({ id, label, address }) => ({ id, label, address })),
    to: entries
      .filter((e) => e.side === "to")
      .map(({ id, label, address }) => ({ id, label, address })),
    addEntry,
    removeEntry,
  };
}
