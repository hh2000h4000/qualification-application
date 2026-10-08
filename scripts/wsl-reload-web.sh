#!/usr/bin/env bash
# Make the running `bench serve` start a fresh Python process, and say whether the site answers.
#
# A web process that was already running when an app was pip-installed does not
# have it on its path, and every request fails at `import`. Werkzeug's reloader
# starts a new interpreter when a loaded file's time changes; that is all this does.
# The worker and the scheduler are not reloaded by this — they need `bench start` again.
set -uo pipefail
SITE="${SQ_SITE:-rpos.localhost}"

touch "$HOME/frappe-bench/apps/frappe/frappe/hooks.py"
for _ in $(seq 1 20); do
	sleep 1
	code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $SITE" http://127.0.0.1:8000/api/method/ping || true)
	[ "$code" = "200" ] && break
done
echo "ping: $code"
curl -s -o /dev/null -w 'portal page: %{http_code}\n' -H "Host: $SITE" http://127.0.0.1:8000/qualification
curl -s -H "Host: $SITE" http://127.0.0.1:8000/api/method/supplier_qualification.api.applicant.get_config | head -c 300
echo
