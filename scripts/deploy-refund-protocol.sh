#!/usr/bin/env bash
# =============================================================================
# deploy-refund-protocol.sh — deploy ONLY a new RefundProtocol to Arc testnet.
#
# Unlike deploy-arc.sh (which redeploys BOTH contracts + demo payouts), this
# script touches ONLY RefundProtocol. The existing FinneCaseRegistry and any
# anchored cases are preserved untouched. Use this when only the refund/escrow
# contract changed (e.g. the refundByArbiterWithSig + setArbiter additions).
#
# What it does:
#   1. Deploys a fresh RefundProtocol (with the current src/ bytecode).
#   2. Configures the arbiter reserve (setLockupSeconds + approve + deposit).
#   3. Verifies the source on arcscan (Blockscout, no API key needed).
#   4. Rewrites REFUND_PROTOCOL_ADDRESS in backend/.env + root .env.
#
# It does NOT:
#   - touch FinneCaseRegistry (the existing 0x2977… deployment stays live)
#   - make demo payouts (run deploy-arc.sh for a full fresh state)
#   - move the registry operator key
#
# Prereqs: Foundry + contracts/.env.deploy populated. Faucet-funded accounts.
# Usage:   ./scripts/deploy-refund-protocol.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORGE="${FORGE:-$HOME/.foundry/bin/forge}"
CAST="${CAST:-$HOME/.foundry/bin/cast}"
ENVFILE="$ROOT/contracts/.env.deploy"

if [[ ! -f "$ENVFILE" ]]; then
  echo "FATAL: $ENVFILE not found. Create it from the template in its header." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENVFILE"; set +a
export DAPP_EVM_VERSION=cancun

RPC="${ARC_RPC_URL:-https://rpc.testnet.arc.io}"
: "${DEPLOYER_ADDRESS:?DEPLOYER_ADDRESS missing in $ENVFILE}"
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY missing in $ENVFILE}"
: "${ARBITER_ADDRESS:?ARBITER_ADDRESS missing in $ENVFILE}"
: "${ARBITER_PRIVATE_KEY:?ARBITER_PRIVATE_KEY missing in $ENVFILE}"
: "${RECIPIENT_ADDRESS:?RECIPIENT_ADDRESS missing in $ENVFILE}"
: "${USDC_ADDRESS:?USDC_ADDRESS missing in $ENVFILE}"
RESERVE="${RESERVE_AMOUNT:-30000000}"          # 30 USDC, 6 decimals
VERIFY="${VERIFY:-1}"                          # set VERIFY=0 to skip verification

echo "==> 1/4  Deploying RefundProtocol ONLY (forge script)..."
DEPLOY_OUTPUT=$(
  cd "$ROOT/contracts/refund-protocol"
  "$FORGE" script script/DeployRefundProtocol.s.sol --rpc-url "$RPC" --broadcast --evm-version cancun --sender "$DEPLOYER_ADDRESS" 2>&1
)
RP=$(echo "$DEPLOY_OUTPUT" | grep "RefundProtocol:" | awk '{print $2}')
if [[ -z "$RP" ]]; then
  echo "FATAL: could not parse RefundProtocol address from deploy output:" >&2
  echo "$DEPLOY_OUTPUT" >&2
  exit 1
fi
echo "      RefundProtocol=$RP"

echo "==> 2/4  Configuring arbiter reserve (setLockupSeconds + approve + depositArbiterFunds)..."
"$CAST" send "$RP" "setLockupSeconds(address,uint256)" "$RECIPIENT_ADDRESS" 120 --rpc-url "$RPC" --private-key "$ARBITER_PRIVATE_KEY" >/dev/null
"$CAST" send "$USDC_ADDRESS" "approve(address,uint256)" "$RP" "$RESERVE" --rpc-url "$RPC" --private-key "$ARBITER_PRIVATE_KEY" >/dev/null
"$CAST" send "$RP" "depositArbiterFunds(uint256)" "$RESERVE" --rpc-url "$RPC" --private-key "$ARBITER_PRIVATE_KEY" >/dev/null
echo "      reserve=$((RESERVE / 1000000)) USDC deposited, lockup=120s for recipient"

if [[ "$VERIFY" == "1" ]]; then
  echo "==> 3/4  Verifying RefundProtocol on arcscan (Blockscout, no API key)..."
  # Constructor: (address _arbiter, address _usdc, string eip712Name, string eip712Version)
  CTOR_ARGS=$("$CAST" abi-encode "constructor(address,address,string,string)" "$ARBITER_ADDRESS" "$USDC_ADDRESS" "RefundProtocol" "1")
  VERIFY_OUTPUT=$(
    cd "$ROOT/contracts/refund-protocol"
    "$FORGE" verify-contract "$RP" src/RefundProtocol.sol:RefundProtocol \
      --chain-id 5042002 --verifier blockscout \
      --verifier-url https://testnet.arcscan.app/api/ \
      --constructor-args "$CTOR_ARGS" 2>&1 || true
  )
  echo "$VERIFY_OUTPUT" | grep -Ei "(submitted|success|already|error|fail)" | head -3 || true
  echo "      check: https://testnet.arcscan.app/address/$RP"
else
  echo "==> 3/4  Skipping verification (VERIFY=0)"
fi

echo "==> 4/4  Writing RefundProtocol address into backend/.env + root .env..."
update_env() {
  local file="$1"
  sed -i.bak \
    -e "s|^REFUND_PROTOCOL_ADDRESS=.*|REFUND_PROTOCOL_ADDRESS=$RP|" \
    "$file"
  rm -f "$file.bak"
}
update_env "$ROOT/backend/.env"
update_env "$ROOT/.env"

echo ""
echo "==> Deploy complete."
echo "    RefundProtocol (NEW): $RP"
echo "    FinneCaseRegistry:    UNCHANGED (existing deployment preserved)"
echo "    Arbiter:              $ARBITER_ADDRESS"
echo "    USDC:                 $USDC_ADDRESS"
echo "    Explorer:             https://testnet.arcscan.app/address/$RP"
echo "    Next: restart the backend (npm start in backend/) — the EIP-712 domain"
echo "    check at boot will confirm the new contract binds signatures correctly."
