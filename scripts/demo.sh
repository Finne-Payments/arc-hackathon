#!/usr/bin/env bash
# Finné demo — deploys contracts to Arc testnet and runs real protected payouts
# on chain. The backend's indexer detects them and builds payouts/receipts
# dynamically (no seed data — the DB starts empty and fills from real usage).
#
# Usage: ./scripts/demo.sh
# Prereqs: Foundry (~/.foundry/bin on PATH), Node 20+.
#          git submodule deps present: `git submodule update --init --recursive`
#          Arc testnet wallets funded at https://faucet.circle.com/
#          MongoDB (Atlas connection string in backend/.env).
#
# Environment variables (set these before running):
#   DEPLOYER_PRIVATE_KEY  — funded deployer wallet key
#   ARBITER_PRIVATE_KEY   — funded arbiter wallet key (deposits reserve)
#   ARBITER_ADDRESS       — arbiter wallet address
#   OPERATOR_ADDRESS      — operator wallet address (hash-anchor only)
#   PAYER_ADDRESS         — payer wallet address
#   RECIPIENT_ADDRESS     — recipient wallet address
#   REGISTRY_OPERATOR_PRIVATE_KEY — operator key for the backend anchor worker
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORGE="${FORGE:-$HOME/.foundry/bin/forge}"
export DAPP_EVM_VERSION=cancun  # workaround for forge's bad default evm version
RPC="https://rpc.testnet.arc.io"
USDC="0x3600000000000000000000000000000000000000"  # Arc testnet native USDC

echo "==> 1/3  Deploying contracts to Arc testnet..."
cd "$ROOT/contracts/refund-protocol"
DEPLOY_OUTPUT=$(
  USDC_ADDRESS=$USDC \
  $FORGE script script/Deploy.s.sol --rpc-url "$RPC" --broadcast 2>&1
)
RP=$(echo "$DEPLOY_OUTPUT" | grep "RefundProtocol:" | awk '{print $2}')
REGISTRY=$(echo "$DEPLOY_OUTPUT" | grep "FinneCaseRegistry:" | awk '{print $2}')
echo "      RefundProtocol=$RP  Registry=$REGISTRY"

echo "==> 2/3  Writing backend .env..."
cat > "$ROOT/backend/.env" <<EOF
MONGO_URL=mongodb+srv://USER:PASSWORD@YOUR_CLUSTER.mongodb.net/finne?retryWrites=true&w=majority
BACKEND_PORT=4000
INTERNAL_TOKEN=dev-internal
DEMO_MODE=true
ARC_RPC_URL=$RPC
ARC_CHAIN_ID=5042002
ARC_CHAIN_NAME=Arc Testnet
ARC_EXPLORER_URL=https://testnet.arcscan.app
REFUND_PROTOCOL_ADDRESS=$RP
CASE_REGISTRY_ADDRESS=$REGISTRY
USDC_ADDRESS=$USDC
REGISTRY_OPERATOR_PRIVATE_KEY=$REGISTRY_OPERATOR_PRIVATE_KEY
RESPONSE_WINDOW_HOURS=72
EOF

echo "==> 3/3  Starting backend (indexer + anchor worker) + making real payouts..."
pkill -f "node.*server" 2>/dev/null || true
npm start > /tmp/finne-backend.log 2>&1 &
sleep 3
cd "$ROOT/contracts/refund-protocol"
USDC_ADDRESS=$USDC REFUND_PROTOCOL_ADDRESS=$RP \
$FORGE script script/PayTranches.s.sol --rpc-url "$RPC" --broadcast 2>&1 | grep "Paid tranches"
sleep 3

echo ""
echo "==> Demo ready on Arc testnet."
echo "    Backend:  http://localhost:4000/healthz"
echo "    Payouts:  curl -s http://localhost:4000/payouts -H 'x-finne-session: reviewer'"
echo "    Explorer: https://testnet.arcscan.app"
