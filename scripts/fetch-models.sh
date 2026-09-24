#!/usr/bin/env bash
# Aeio — Model Fetch & Integrity Verification Script
# Downloads and validates pinned weights for all-MiniLM-L6-v2 (Apache 2.0)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="$PROJECT_ROOT/src-tauri/resources/models/all-MiniLM-L6-v2"

mkdir -p "$TARGET_DIR"

# Pinned SHA256 hashes matching official upstream sentence-transformers release
CONFIG_SHA256="953f9c0d463486b10a6871cc2fd59f223b2c70184f49815e7efbcab5d8908b41"
TOKENIZER_SHA256="be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037"
WEIGHTS_SHA256="53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db"

compute_sha256() {
    local file="$1"
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file" | awk '{print $1}'
    elif command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file" | awk '{print $1}'
    else
        echo "Error: neither shasum nor sha256sum is available" >&2
        exit 1
    fi
}

verify_or_download() {
    local filename="$1"
    local url="$2"
    local expected_sha="$3"
    local filepath="$TARGET_DIR/$filename"

    if [ -f "$filepath" ]; then
        local current_sha
        current_sha="$(compute_sha256 "$filepath")"
        if [ "$current_sha" = "$expected_sha" ]; then
            echo "[aeio::models] $filename already verified (SHA256: $expected_sha)"
            return 0
        fi
        echo "[aeio::models] $filename hash mismatch! Re-downloading..."
        rm -f "$filepath"
    fi

    echo "[aeio::models] Downloading $filename from $url ..."
    curl -sL --fail --retry 3 --retry-delay 2 "$url" -o "$filepath.tmp"

    local downloaded_sha
    downloaded_sha="$(compute_sha256 "$filepath.tmp")"
    if [ "$downloaded_sha" != "$expected_sha" ]; then
        echo "[aeio::models] FATAL: Checksum mismatch for $filename!" >&2
        echo "  Expected: $expected_sha" >&2
        echo "  Actual:   $downloaded_sha" >&2
        rm -f "$filepath.tmp"
        exit 1
    fi

    mv "$filepath.tmp" "$filepath"
    echo "[aeio::models] Verified $filename successfully."
}

echo "=== Aeio: Fetching & Verifying Semantic Embedding Models ==="

verify_or_download \
    "config.json" \
    "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/raw/main/config.json" \
    "$CONFIG_SHA256"

verify_or_download \
    "tokenizer.json" \
    "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json" \
    "$TOKENIZER_SHA256"

verify_or_download \
    "model.safetensors" \
    "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/model.safetensors" \
    "$WEIGHTS_SHA256"

echo "=== Model integrity verification passed. Ready for build. ==="
