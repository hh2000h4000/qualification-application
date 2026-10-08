"""What the public portal calls. An applicant is a guest holding a session token (`utils/otp.py`)."""

import json

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit

from supplier_qualification.utils import applications, notifications, otp


def _arabic():
	# The portal is Arabic only, and a guest's browser language says nothing about that.
	frappe.local.lang = "ar"


@frappe.whitelist(allow_guest=True)
def get_config():
	"""What the form is built from: each track's required documents, and the supply categories."""
	documents = {}
	for row in frappe.get_single("Qualification Settings").required_documents:
		documents.setdefault(row.track, []).append(row.document_name)
	return {
		"documents": documents,
		"supply_categories": frappe.get_all(
			"Qualification Supply Category", pluck="name", order_by="creation"
		),
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="email", limit=5, seconds=60 * 60)
def send_code(email):
	_arabic()
	email = otp.normalise_email(email)
	notifications.send_verification_code(email, otp.issue_code(email))


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="email", limit=20, seconds=60 * 60)
def verify_code(email, code):
	_arabic()
	return {"token": otp.redeem_code(otp.normalise_email(email), code)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def get_draft(token, track):
	_arabic()
	return applications.get_draft(otp.session_email(token), applications.check_track(track))


@frappe.whitelist(allow_guest=True, methods=["POST"])
def save_draft(token, track, data, step=0):
	_arabic()
	applications.save_draft(otp.session_email(token), applications.check_track(track), _parse(data), step)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def upload_file(token, track):
	_arabic()
	email = otp.session_email(token)
	upload = frappe.request.files.get("file")
	if not upload:
		frappe.throw(_("No file was received."))
	return applications.attach_file(email, applications.check_track(track), upload.filename, upload.read())


@frappe.whitelist(allow_guest=True, methods=["POST"])
def submit(token, track, data):
	_arabic()
	reference = applications.submit(otp.session_email(token), applications.check_track(track), _parse(data))
	return {"reference": reference}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def my_applications(token):
	_arabic()
	return applications.overview(otp.session_email(token))


@frappe.whitelist(allow_guest=True, methods=["POST"])
def sign_out(token):
	otp.end_session(token)


def _parse(data):
	data = json.loads(data) if isinstance(data, str) else data
	if not isinstance(data, dict):
		frappe.throw(_("The form could not be read."))
	return data
