#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--update" ]]; then
  echo "Updating deterministic golden files..."
  REGEN_GOLDENS=1 npm run test:goldens
  exit 0
fi

echo "Checking deterministic golden files..."
npm run test:goldens
