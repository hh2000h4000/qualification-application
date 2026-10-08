#!/usr/bin/env bash
# What became of the last mails the site tried to send, and the last portal errors.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
SITE="${SQ_SITE:-rpos.localhost}"
cd "$HOME/frappe-bench" || exit 1

echo "--- last recipients"
bench --site "$SITE" execute frappe.get_all --kwargs '{"doctype": "Email Queue Recipient", "fields": ["recipient", "status", "creation", "error"], "order_by": "creation desc", "limit": 6}'
echo "--- last queue rows"
bench --site "$SITE" execute frappe.get_all --kwargs '{"doctype": "Email Queue", "fields": ["name", "status", "creation", "error"], "order_by": "creation desc", "limit": 4}'
echo "--- portal errors"
bench --site "$SITE" execute frappe.get_all --kwargs '{"doctype": "Error Log", "filters": {"method": ["like", "%Supplier Qualification%"]}, "fields": ["creation", "error"], "order_by": "creation desc", "limit": 2}' | cut -c1-1500
echo "--- now"
date '+%Y-%m-%d %H:%M:%S'
