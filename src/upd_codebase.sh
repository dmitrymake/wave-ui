#!/usr/bin/env bash
set -euo pipefail

output_file="codebase.txt"

# Ищем файлы .js и .svelte в текущей директории (.) и папке lib
find . lib -type f \( -name '*.js' -o -name '*.svelte' \) -print0 2>/dev/null |
  while IFS= read -r -d '' file; do
    printf ' %s \n' "$file"
    cat -- "$file"
    printf '\n'
  done >"$output_file"
