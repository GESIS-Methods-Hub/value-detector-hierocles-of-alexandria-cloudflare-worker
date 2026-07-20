#!/usr/bin/env bash

set -euo pipefail

# -----------------------------
# CONFIG
# -----------------------------
PREFIX="mhhoa"

# -----------------------------
# GENERATE RANDOM KEY
# -----------------------------
RANDOM_PART=$(openssl rand -hex 32)

API_KEY="${PREFIX}_${RANDOM_PART}"

# -----------------------------
# HASH (for D1 storage)
# -----------------------------
API_KEY_HASH=$(printf "%s" "$API_KEY" | openssl dgst -sha256 -binary | xxd -p -c 256)

# -----------------------------
# OUTPUT
# -----------------------------
echo "----------------------------------------"
echo "API KEY (SHOW THIS ONCE TO USER)"
echo "----------------------------------------"
echo "$API_KEY"
echo ""

echo "----------------------------------------"
echo "D1 INSERT VALUES"
echo "https://dash.cloudflare.com/543d10d40ca98b5b3d758ea26ee2fd60/workers/d1/databases/8ed48afe-92fb-4602-8506-fec172fb2f80/studio"
echo "table api_keys"
echo "----------------------------------------"
echo "key_hash:   $API_KEY_HASH"
echo "----------------------------------------"
