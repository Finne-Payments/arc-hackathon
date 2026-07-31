import refundProtocolAbi from "../abi/RefundProtocol.json" with { type: "json" };
import caseRegistryAbi from "../abi/CaseRegistry.json" with { type: "json" };

/* ABIs for the deployed contracts, exported as viem Abi.
   - RefundProtocol: Circle's vendored contract (unchanged).
   - CaseRegistry: Finné's own hash-anchor contract. */
import type { Abi } from "viem";
export const REFUND_PROTOCOL_ABI: Abi = refundProtocolAbi as Abi;
export const CASE_REGISTRY_ABI: Abi = caseRegistryAbi as Abi;
