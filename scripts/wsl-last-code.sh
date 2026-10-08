#!/usr/bin/env bash
# The last verification codes the portal wrote to the log — which it does only
# while the site has no outgoing email account (`utils/notifications.py`).
set -uo pipefail
SITE="${SQ_SITE:-rpos.localhost}"
cd "$HOME/frappe-bench" || exit 1
grep -h "verification code for" "sites/$SITE/logs/supplier_qualification.log" logs/supplier_qualification.log 2> /dev/null | tail -3
