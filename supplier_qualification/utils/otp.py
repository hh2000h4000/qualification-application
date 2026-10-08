"""An applicant has no account: a code sent to the organisation's email is the sign-in.

The code buys a short session token, and every applicant endpoint asks the token
whose application it may touch. Nothing the browser sends is trusted for that.
"""

import hashlib
import hmac
import secrets

import frappe
from frappe import _
from frappe.utils import validate_email_address

CODE_TTL = 10 * 60
SESSION_TTL = 2 * 60 * 60
MAX_ATTEMPTS = 5


def normalise_email(email):
	email = (email or "").strip().lower()
	if not validate_email_address(email):
		frappe.throw(_("Enter a valid email address."))
	return email


def issue_code(email):
	"""A fresh six-digit code for this address; the one before it stops working."""
	code = f"{secrets.randbelow(10**6):06d}"
	frappe.cache.set_value(
		_code_key(email), {"digest": _digest(code), "attempts": 0}, expires_in_sec=CODE_TTL
	)
	return code


def redeem_code(email, code):
	"""Trade a correct code for a session token. A code is spent once, and dies after five wrong tries."""
	key = _code_key(email)
	entry = frappe.cache.get_value(key, expires=True)
	if not entry:
		frappe.throw(_("The verification code has expired. Request a new one."))

	if not hmac.compare_digest(entry["digest"], _digest(str(code or "").strip())):
		entry["attempts"] += 1
		if entry["attempts"] >= MAX_ATTEMPTS:
			frappe.cache.delete_value(key)
		else:
			frappe.cache.set_value(key, entry, expires_in_sec=CODE_TTL)
		frappe.throw(_("The verification code is not correct."))

	frappe.cache.delete_value(key)
	token = secrets.token_urlsafe(32)
	frappe.cache.set_value(_session_key(token), email, expires_in_sec=SESSION_TTL)
	return token


def session_email(token):
	"""The address a token was issued to, or a refusal the page answers by asking for a new code."""
	email = frappe.cache.get_value(_session_key(token), expires=True) if token else None
	if not email:
		frappe.throw(_("Your session has ended. Verify your email again."), frappe.PermissionError)
	return email


def end_session(token):
	if token:
		frappe.cache.delete_value(_session_key(token))


def _digest(code):
	return hashlib.sha256(code.encode()).hexdigest()


def _code_key(email):
	return f"supplier_qualification:code:{email}"


def _session_key(token):
	return f"supplier_qualification:session:{token}"
