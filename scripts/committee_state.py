"""Where the committee stands on a site: who is on it, what each application is waiting for.

Run through wsl-committee-state.sh. Reads only.
"""

import os

import frappe

SITE = os.environ.get("SQ_SITE", "rpos.localhost")
ROLES = ("Qualification Member", "Qualification Chair", "Qualification Admin")

frappe.init(site=SITE, sites_path=".")
frappe.connect()

print("--- committee")
members = frappe.get_all("Qualification Committee Member", fields=["user", "full_name", "is_chair", "active"])
for member in members:
	held = [role for role in frappe.get_roles(member.user) if role in ROLES]
	enabled = frappe.db.get_value("User", member.user, "enabled")
	print(
		f"{member.user} | {member.full_name} | chair={member.is_chair} active={member.active} "
		f"user_enabled={enabled} roles={held}"
	)
if not members:
	print("(no members)")

voters = {m.user for m in members if m.active and not m.is_chair}
print("--- applications")
for app in frappe.get_all(
	"Qualification Application", fields=["name", "company_name", "status", "vote_round"], order_by="creation"
):
	voted = set(
		frappe.get_all(
			"Qualification Vote",
			filters={"application": app.name, "vote_round": app.vote_round},
			pluck="member",
		)
	)
	print(f"{app.name} | {app.status} | round {app.vote_round} | voted: {sorted(voted) or '-'}")
	if voters - voted:
		print(f"    still to vote: {sorted(voters - voted)}")
	if voted - voters:
		print(f"    voted but not a voting member now: {sorted(voted - voters)}")

frappe.destroy()
