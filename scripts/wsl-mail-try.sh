#!/usr/bin/env bash
# Ask the running portal for a verification code, the way the page does, and say what became of the mail.
#   bash wsl-mail-try.sh someone@example.com
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
SITE="${SQ_SITE:-rpos.localhost}"
TO="$1"
cd "$HOME/frappe-bench" || exit 1

echo "--- asking for a code for $TO"
curl -s -X POST -H "Host: $SITE" -H "Accept: application/json" \
	--data-urlencode "email=$TO" \
	http://127.0.0.1:8000/api/method/supplier_qualification.api.applicant.send_code | head -c 600
echo
echo "--- the mail queue"
bench --site "$SITE" execute frappe.get_all --kwargs '{"doctype": "Email Queue", "fields": ["name", "status", "sender", "creation", "error"], "order_by": "creation desc", "limit": 2}'
