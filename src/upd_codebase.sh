#!/usr/bin/env bash
set -euo pipefail

output_file="codebase.txt"

# Ищем .js, .svelte и .php
find . lib -type f \( -name '*.js' -o -name '*.svelte' -o -name '*.php' \) -print0 2>/dev/null |
  while IFS= read -r -d '' file; do
    printf ' %s \n' "$file"
    cat -- "$file"
    printf '\n'
  done >"$output_file"
