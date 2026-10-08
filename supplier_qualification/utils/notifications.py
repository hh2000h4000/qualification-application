"""Every email the portal sends leaves through here."""

import frappe
from frappe import _


def has_outgoing_email():
	return bool(frappe.db.exists("Email Account", {"enable_outgoing": 1, "default_outgoing": 1}))


def send_verification_code(email, code):
	"""Email the code.

	A site with no outgoing account at all is still being set up: the code goes
	to the server log so the portal can be tried, and nowhere a visitor can see.
	"""
	if not has_outgoing_email():
		logger = frappe.logger("supplier_qualification", allow_site=True)
		logger.setLevel("INFO")  # Frappe's loggers start at ERROR
		logger.info(f"verification code for {email}: {code}")
		return

	send(
		email,
		_("Your verification code"),
		_(
			"Your verification code for the supplier qualification portal is {0}. It is valid for 10 minutes."
		).format(f"<b>{code}</b>"),
	)


def send_application_received(application):
	send(
		application.email,
		_("Qualification application {0} received").format(application.name),
		_(
			"Your application was received and referred to the qualification committee. Keep the reference number {0} to follow it up."
		).format(f"<b>{application.name}</b>"),
		required=False,
	)


def send_decision(application, note=None):
	"""Tell the applicant where their application now stands."""
	if application.status == "Qualified":
		body = _("Your organisation has been qualified, with a qualification percentage of {0}%.").format(
			f"<b>{application.final_percentage:g}</b>"
		)
	elif application.status == "Not Qualified":
		body = _("We regret to inform you that your organisation was not qualified.")
	else:
		body = "{}<br><br>{}".format(
			_("The qualification committee has a note on your application:"),
			frappe.utils.escape_html(note or ""),
		)

	send(
		application.email,
		_("Update on qualification application {0}").format(application.name),
		"{}<br><br>{}".format(
			body, _("You can follow your application on the portal, under My Applications.")
		),
		required=False,
	)


def send(recipient, subject, message, required=True):
	"""Send now. A mail the applicant is waiting for fails loudly; a courtesy one never blocks the work."""
	try:
		frappe.sendmail(recipients=[recipient], subject=subject, message=message, delayed=False)
	except Exception:
		frappe.log_error(title="Supplier Qualification: email not sent")
		if required:
			frappe.throw(_("The email could not be sent. Try again in a few minutes."))
