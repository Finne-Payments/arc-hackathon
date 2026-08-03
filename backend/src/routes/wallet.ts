import { Router } from "express";
import type { Address, Abi } from "viem";
import { requireAuthenticated } from "../middleware.ts";
import { User } from "../models/index.ts";
import { getPublicClient, refundProtocolAddress, usdcAddress } from "../chain/client.ts";
import { REFUND_PROTOCOL_ABI } from "../chain/abis.ts";
import { fromBaseUnitsDisplay } from "../usdc.ts";

/* ============================================================================
   Wallet route — the authenticated user's live balances. Reads three figures
   for the user's linked wallet: liquid USDC (balanceOf), the amount protected
   in the RefundProtocol (balances), and any outstanding debt (debts). All chain
   reads degrade to null on RPC failure (PRD §13.4 — never error the route).
   ========================================================================== */

export const walletRoutes = Router();

// Minimal ERC20 ABI — just balanceOf.
const ERC20_BALANCE_ABI: Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as Abi;

/** @openapi
 * /wallet/balance:
 *   get:
 *     tags: [Wallet]
 *     summary: The authenticated user's wallet balances (USDC + RefundProtocol)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ walletAddress, usdc, protected, debt } (any may be null on RPC failure / no wallet)" }
 *       401: { description: Not authenticated }
 */
walletRoutes.get("/wallet/balance", requireAuthenticated, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId);
    const wallet = (user?.walletAddress ?? null) as Address | null;

    let usdc: string | null = null;
    let protectedBalance: string | null = null;
    let debt: string | null = null;

    const client = getPublicClient();
    const rp = refundProtocolAddress();
    const usdcAddr = usdcAddress();

    if (client && wallet) {
      try {
        const tasks: Promise<unknown>[] = [];
        tasks.push(
          usdcAddr
            ? client.readContract({ address: usdcAddr, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [wallet] })
            : Promise.resolve(0n),
        );
        if (rp) {
          tasks.push(client.readContract({ address: rp, abi: REFUND_PROTOCOL_ABI, functionName: "balances", args: [wallet] }));
          tasks.push(client.readContract({ address: rp, abi: REFUND_PROTOCOL_ABI, functionName: "debts", args: [wallet] }));
        } else {
          tasks.push(Promise.resolve(0n));
          tasks.push(Promise.resolve(0n));
        }
        const [u, p, d] = (await Promise.all(tasks)) as [bigint, bigint, bigint];
        usdc = fromBaseUnitsDisplay(u);
        protectedBalance = fromBaseUnitsDisplay(p);
        debt = fromBaseUnitsDisplay(d);
      } catch {
        // RPC failure — report nulls, never error.
        usdc = protectedBalance = debt = null;
      }
    }

    res.json({ walletAddress: wallet, usdc, protected: protectedBalance, debt });
  } catch (e) {
    next(e);
  }
});
