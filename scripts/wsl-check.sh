#!/usr/bin/env bash
# The fast loop for this app: sync, lint, migrate the throwaway site, run the named test modules.
#
#   bash wsl-check.sh                 # lint only
#   bash wsl-check.sh test_applicant  # lint + supplier_qualification.tests.test_applicant
#
# Tests run on test.localhost and nowhere else: ERPNext's `before_tests` hook
# empties `Item Price` on whichever site the suite touches.
set -uo pipefail
export PATH="$HOME/.local/bin:$HOME/frappe-bench/env/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

TEST_SITE="test.localhost"

bash "$HOME/ruzmh_pos/scripts/wsl-sync.sh" || exit 1
cd "$HOME/ruzmh_pos/supplier_qualification" || exit 1
ruff check . || exit 1
ruff format --check . || exit 1

[ "$#" -eq 0 ] && exit 0

cd "$HOME/frappe-bench" || exit 1
bench --site "$TEST_SITE" migrate 2>&1 | grep -iE "error|traceback" | head -5
for module in "$@"; do
	echo "=== $module ==="
	bench --site "$TEST_SITE" run-tests --module "supplier_qualification.tests.$module" 2>&1 | tail -25
done
