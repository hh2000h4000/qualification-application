import frappe

from supplier_qualification.utils.pages import page_context

no_cache = 1


def get_context(context):
	# The committee signs in with its ERPNext accounts, and comes back here afterwards.
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/qualification_committee"
		raise frappe.Redirect
	page_context(context)
