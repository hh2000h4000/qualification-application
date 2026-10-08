#!/usr/bin/env bash
# Print one application as the site stored it:  bash wsl-show-application.sh S-2026-0001
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
SITE="${SQ_SITE:-rpos.localhost}"
cd "$HOME/frappe-bench" || exit 1
bench --site "$SITE" execute frappe.get_all --kwargs "{\"doctype\": \"Qualification Application\", \"filters\": {\"name\": \"$1\"}, \"fields\": [\"name\", \"track\", \"email\", \"status\", \"company_name\", \"cr_number\", \"city\", \"ack_confirmed\"]}"
bench --site "$SITE" execute frappe.get_all --kwargs "{\"doctype\": \"Qualification Document\", \"filters\": {\"parent\": \"$1\"}, \"fields\": [\"idx\", \"expiry_date\", \"file\", \"reference_link\", \"attached\"], \"order_by\": \"idx\"}"
bench --site "$SITE" execute frappe.get_all --kwargs "{\"doctype\": \"File\", \"filters\": {\"attached_to_name\": \"$1\"}, \"fields\": [\"file_url\", \"is_private\", \"attached_to_doctype\"]}"
bench --site "$SITE" execute frappe.db.count --args '["Qualification Draft"]'
