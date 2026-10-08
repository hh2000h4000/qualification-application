#!/usr/bin/env bash
# Put the working tree on the site it is tried on: sync, link the assets, migrate, clear the cache.
# No tests are ever run here — that is wsl-check.sh, on the throwaway site.
set -uo pipefail
export PATH="$HOME/.local/bin:$HOME/frappe-bench/env/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

SITE="${SQ_SITE:-rpos.localhost}"

bash "$HOME/ruzmh_pos/scripts/wsl-sync.sh" || exit 1
cd "$HOME/frappe-bench" || exit 1
ln -sfn "$HOME/frappe-bench/apps/supplier_qualification/supplier_qualification/public" sites/assets/supplier_qualification
bench --site "$SITE" migrate 2>&1 | grep -iE "error|traceback" | head -5
bench --site "$SITE" clear-cache
bench --site "$SITE" clear-website-cache
echo "deployed to $SITE"
