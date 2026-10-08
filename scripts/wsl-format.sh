#!/usr/bin/env bash
# Format the Windows working tree in place (the mirror is a copy; formatting it would be undone).
set -uo pipefail
export PATH="$HOME/.local/bin:$HOME/frappe-bench/env/bin:$PATH"
cd /mnt/d/project/supplier_qualification || exit 1
ruff check --fix . | tail -1
ruff format . | tail -1
