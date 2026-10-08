#!/usr/bin/env bash
# Why outgoing mail fails: the account's SMTP settings (never its password), and
# whether this machine can reach the mail server on each port at all.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
SITE="${SQ_SITE:-rpos.localhost}"
cd "$HOME/frappe-bench" || exit 1

echo "--- email accounts on $SITE"
bench --site "$SITE" execute frappe.get_all --kwargs '{"doctype": "Email Account", "fields": ["name", "email_id", "service", "auth_method", "enable_outgoing", "default_outgoing", "smtp_server", "smtp_port", "use_tls", "use_ssl_for_outgoing"]}'

echo "--- reaching smtp.gmail.com"
env/bin/python - <<'PY'
import smtplib, socket, ssl

for port, mode in ((587, "starttls"), (465, "ssl")):
	try:
		if mode == "ssl":
			server = smtplib.SMTP_SSL("smtp.gmail.com", port, timeout=10, context=ssl.create_default_context())
		else:
			server = smtplib.SMTP("smtp.gmail.com", port, timeout=10)
			server.ehlo()
			server.starttls(context=ssl.create_default_context())
		server.ehlo()
		print(f"port {port} ({mode}): OK")
		server.quit()
	except (OSError, smtplib.SMTPException, socket.timeout) as error:
		print(f"port {port} ({mode}): FAILED - {type(error).__name__}: {error}")
PY
