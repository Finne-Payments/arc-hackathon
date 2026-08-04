/* ============================================================================
   Deployment manifest (FND-04 step 4-5).
   The sole release manifest — deployments/arc-testnet.json. Records chain ID,
   registry address, deployment tx/block, compiler settings, git commit, ABI/
   bytecode hashes, role holders, and verification URL.
   ========================================================================== */

import { z } from "zod";

export const deploymentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  stage: z.enum(["local", "test", "staging", "submission"]),
  chainId: z.number().int().positive(),
  chainName: z.string(),
  rpcUrl: z.string(),
  explorerUrl: z.string(),

  registry: z.object({
    name: z.literal("FinneCaseRegistry"),
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    deploymentTx: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    deploymentBlock: z.number().int().positive(),
    deployer: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    compilerVersion: z.string(),
    optimizerRuns: z.number().int(),
    abiHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    bytecodeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    verificationUrl: z.string().url(),
  }),

  usdc: z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    decimals: z.literal(6),
    name: z.string(),
  }),

  roleHolders: z.object({
    registryAdmin: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    platform: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    reviewer: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    agent: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  }),

  gitCommit: z.string(),
  deployedAt: z.string().datetime(),
});
export type DeploymentManifest = z.infer<typeof deploymentManifestSchema>;

/**
 * Load and validate a deployment manifest from a JSON string.
 * Throws on any schema violation.
 */
export function parseManifest(json: string): DeploymentManifest {
  return deploymentManifestSchema.parse(JSON.parse(json));
}

/**
 * The default Arc testnet manifest. The registry address + deployment evidence
 * are `_pending_` until CON-06 deploys to Arc testnet. All other fields are
 * the known Arc testnet constants.
 */
export const ARC_TESTNET_DEFAULTS = {
  schemaVersion: 1 as const,
  stage: "submission" as const,
  chainId: 5042002,
  chainName: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  explorerUrl: "https://testnet.arcscan.app",
  registry: {
    name: "FinneCaseRegistry" as const,
    address: "_pending_con_06_",
    deploymentTx: "_pending_con_06_",
    deploymentBlock: 0,
    deployer: "_pending_con_06_",
    compilerVersion: "0.8.24",
    optimizerRuns: 200,
    abiHash: "_pending_con_06_",
    bytecodeHash: "_pending_con_06_",
    verificationUrl: "_pending_con_06_",
  },
  usdc: {
    address: "_pending_con_06_",
    decimals: 6 as const,
    name: "USD Coin (Arc Testnet)",
  },
  roleHolders: {
    registryAdmin: "_pending_con_06_",
    platform: "_pending_con_06_",
    reviewer: "_pending_con_06_",
    agent: "_pending_con_06_",
  },
  gitCommit: "_pending_",
  deployedAt: "_pending_",
};
