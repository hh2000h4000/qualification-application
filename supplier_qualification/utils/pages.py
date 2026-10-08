"""What both portal pages need from the server before their script runs."""

import os

import frappe


def page_context(context):
	# The pages post to whitelisted methods; a signed-in session will not accept that without its token.
	context.csrf_token = frappe.sessions.get_csrf_token()
	# The browser keeps the stylesheet and scripts until one of them changes on disk.
	folder = frappe.get_app_path("supplier_qualification", "public", "portal")
	context.build = int(max(os.path.getmtime(os.path.join(folder, name)) for name in os.listdir(folder)))
