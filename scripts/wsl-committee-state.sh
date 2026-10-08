#!/usr/bin/env bash
# Who is on the committee and what each application is waiting for. Reads only.
set -uo pipefail
cd "$HOME/frappe-bench/sites" || exit 1
../env/bin/python "$HOME/ruzmh_pos/supplier_qualification/scripts/committee_state.py"
