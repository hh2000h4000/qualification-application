"""What the committee page calls. Every caller is a signed-in ERPNext user holding a committee role."""

import frappe

from supplier_qualification.utils import committee


def _user():
	# The committee's screens are Arabic, whatever language the user's desk is in.
	frappe.local.lang = "ar"
	return frappe.session.user


@frappe.whitelist()
def whoami():
	user = _user()
	return {
		"full_name": frappe.utils.get_fullname(user),
		**committee.require(user, "member", "chair", "admin"),
	}


@frappe.whitelist()
def list_applications():
	user = _user()
	committee.require(user, "member", "chair", "admin")
	return committee.list_applications(user)


@frappe.whitelist()
def get_application(name):
	user = _user()
	committee.require(user, "member", "chair", "admin")
	return committee.get_application(user, name)


@frappe.whitelist(methods=["POST"])
def vote(name, decision, percentage, note=None, negotiate=0, negotiation_note=None):
	user = _user()
	committee.require(user, "member")
	committee.cast_vote(user, name, decision, percentage, note, negotiate, negotiation_note)


@frappe.whitelist(methods=["POST"])
def decide(name, decision_type, result=None, percentage=None, note=None):
	user = _user()
	committee.require(user, "chair")
	committee.decide(user, name, decision_type, result, percentage, note)
