#!/usr/bin/env bash
# =============================================================================
# deploy-arc.sh — deploy Finné contracts to Arc testnet + make demo payouts.
#
# This is the canonical, repeatable deploy path. It reads money-moving keys
# ONLY from contracts/.env.deploy (gitignored) and never touches backend/.env
# for money material. After a successful run it writes the deployed contract
# addresses + the registry operator key into backend/.env and the root .env so
# the backend boots against the live chain.
#
# Why cast send and not `forge script --broadcast` for the USDC-touching steps:
# Arc testnet's native USDC invokes an `isBlocklisted` compliance precompile
# (0x1800…0001) that forge's local EVM simulator cannot execute, so any forge
# script that moves USDC reverts in simulation and forge refuses to broadcast.
# `cast send` sends raw transactions to the live chain where the precompile
# exists, sidestepping the simulator entirely.
#
# Prereqs:
#   - Foundry (~/.foundry/bin on PATH)
#   - contracts/.env.deploy populated (see contracts/.env.deploy header)
#   - The accounts in contracts/.env.deploy faucet-funded on Arc testnet
# Usage:  ./scripts/deploy-arc.sh
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
: "${OPERATOR_ADDRESS:?OPERATOR_ADDRESS missing in $ENVFILE}"
: "${PAYER_PRIVATE_KEY:?PAYER_PRIVATE_KEY missing in $ENVFILE}"
: "${RECIPIENT_ADDRESS:?RECIPIENT_ADDRESS missing in $ENVFILE}"
: "${REFUND_TO_ADDRESS:?REFUND_TO_ADDRESS missing in $ENVFILE}"
: "${USDC_ADDRESS:?USDC_ADDRESS missing in $ENVFILE}"
RESERVE="${RESERVE_AMOUNT:-30000000}"          # 30 USDC, 6 decimals
TRANCHE="${PAY_TRANCHE_AMOUNT:-10000000}"      # 10 USDC, 6 decimals

echo "==> 1/4  Deploying RefundProtocol + FinneCaseRegistry (forge script)..."
DEPLOY_OUTPUT=$(
  cd "$ROOT/contracts/refund-protocol"
  "$FORGE" script script/DeployContracts.s.sol --rpc-url "$RPC" --broadcast --evm-version cancun --sender "$DEPLOYER_ADDRESS" 2>&1
)
RP=$(echo "$DEPLOY_OUTPUT" | grep "RefundProtocol:" | awk '{print $2}')
REGISTRY=$(echo "$DEPLOY_OUTPUT" | grep "FinneCaseRegistry:" | awk '{print $2}')
if [[ -z "$RP" || -z "$REGISTRY" ]]; then
  echo "FATAL: could not parse contract addresses from deploy output:" >&2
  echo "$DEPLOY_OUTPUT" >&2
  exit 1
fi
echo "      RefundProtocol=$RP  FinneCaseRegistry=$REGISTRY"

echo "==> 2/4  Configuring arbiter reserve (setLockupSeconds + approve + depositArbiterFunds via cast)..."
"$CAST" send "$RP" "setLockupSeconds(address,uint256)" "$RECIPIENT_ADDRESS" 120 --rpc-url "$RPC" --private-key "$ARBITER_PRIVATE_KEY" >/dev/null
"$CAST" send "$USDC_ADDRESS" "approve(address,uint256)" "$RP" "$RESERVE" --rpc-url "$RPC" --private-key "$ARBITER_PRIVATE_KEY" >/dev/null
"$CAST" send "$RP" "depositArbiterFunds(uint256)" "$RESERVE" --rpc-url "$RPC" --private-key "$ARBITER_PRIVATE_KEY" >/dev/null
echo "      reserve=$((RESERVE / 1000000)) USDC deposited"

echo "==> 3/4  Making 3 demo protected payouts (approve + pay x3 via cast)..."
"$CAST" send "$USDC_ADDRESS" "approve(address,uint256)" "$RP" "$((TRANCHE * 3))" --rpc-url "$RPC" --private-key "$PAYER_PRIVATE_KEY" >/dev/null
for i in 1 2 3; do
  "$CAST" send "$RP" "pay(address,uint256,address)" "$RECIPIENT_ADDRESS" "$TRANCHE" "$REFUND_TO_ADDRESS" --rpc-url "$RPC" --private-key "$PAYER_PRIVATE_KEY" >/dev/null
done
echo "      3 x $((TRANCHE / 1000000)) USDC paid to recipient"

echo "==> 4/4  Writing deployed addresses into backend/.env + root .env..."
# The operator key is the ONE permitted backend key (hash-anchor only). All
# other money keys stay in contracts/.env.deploy.
update_env() {
  local file="$1"
  sed -i.bak \
    -e "s|^REFUND_PROTOCOL_ADDRESS=.*|REFUND_PROTOCOL_ADDRESS=$RP|" \
    -e "s|^CASE_REGISTRY_ADDRESS=.*|CASE_REGISTRY_ADDRESS=$REGISTRY|" \
    -e "s|^REGISTRY_OPERATOR_PRIVATE_KEY=.*|REGISTRY_OPERATOR_PRIVATE_KEY=$OPERATOR_PRIVATE_KEY|" \
    "$file"
  rm -f "$file.bak"
}
update_env "$ROOT/backend/.env"
update_env "$ROOT/.env"

echo ""
echo "==> Deploy complete."
echo "    RefundProtocol:    $RP"
echo "    FinneCaseRegistry: $REGISTRY"
echo "    Explorer:          https://testnet.arcscan.app"
echo "    Next: start the backend (npm start in backend/) — the indexer will"
echo "    backfill the 3 payouts and the anchor worker will post receipt hashes."
