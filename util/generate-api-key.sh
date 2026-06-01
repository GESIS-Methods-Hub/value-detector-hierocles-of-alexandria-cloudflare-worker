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
echo "----------------------------------------"
echo "key_hash:   $API_KEY_HASH"
echo "----------------------------------------"
