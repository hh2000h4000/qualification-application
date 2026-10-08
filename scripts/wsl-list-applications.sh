#!/usr/bin/env bash
# The latest applications on the site, newest first.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
SITE="${SQ_SITE:-rpos.localhost}"
cd "$HOME/frappe-bench" || exit 1
bench --site "$SITE" execute frappe.get_all --kwargs '{"doctype": "Qualification Application", "fields": ["name", "track", "email", "status", "company_name", "submitted_at"], "order_by": "creation desc", "limit": 10}'
