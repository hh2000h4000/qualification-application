"""The committee's side: members score an application, the chair decides, a qualified applicant becomes a Supplier.

An application moves along one line, and every move is made here:

Who does what comes from the roster: a member marked "can approve" decides, the others review.
A committee of one approver is a manager deciding alone; nothing here assumes there are two people.

    Awaiting Committee -> Under Committee Vote -> Pending Chair -> Qualified | Not Qualified
                                 ^                     |
                                 +-- Revote Requested <+        (a new voting round; the old votes stay)
                                                       +-> Chair Reservation | Chair Inquiry -> (the chair decides again)
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

from supplier_qualification.constants import ROLE_ADMIN
from supplier_qualification.utils import notifications

APPLICATION = "Qualification Application"
VOTE = "Qualification Vote"

#: Statuses in which members may still score.
VOTING = ("Awaiting Committee", "Under Committee Vote", "Revote Requested")
#: Statuses in which the decision is the chair's to make.
WITH_CHAIR = ("Pending Chair", "Chair Reservation", "Chair Inquiry")

RESULTS = ("Qualified", "Not Qualified")
#: What the chair may do short of a verdict, and where it leaves the application.
HOLDS = {
	"Record Reservation": "Chair Reservation",
	"Raise Inquiry": "Chair Inquiry",
	"Request Revote": "Revote Requested",
}

BREAKS = ("Tab Break", "Section Break", "Column Break")


def roles_of(user):
	"""What this user is on the committee, read from the roster itself.

	Not from their roles: Administrator holds every role there is, and so looked
	like the chair of a committee they sit on as a member.
	"""
	seat = frappe.db.get_value(
		"Qualification Committee Member", {"user": user, "active": 1}, ["is_chair"], as_dict=True
	)
	roles = set(frappe.get_roles(user))
	return {
		"member": bool(seat and not seat.is_chair),
		"chair": bool(seat and seat.is_chair),
		"admin": ROLE_ADMIN in roles or "System Manager" in roles,
	}


def require(user, *wanted):
	"""Refuse anyone who holds none of the wanted committee roles."""
	held = roles_of(user)
	if not any(held[role] for role in wanted):
		frappe.throw(_("You do not have access to the qualification committee."), frappe.PermissionError)
	return held


# --------------------------------------------------------------------------- reading
def list_applications(user):
	"""Every application, newest first, each saying whether this user has scored its current round."""
	rows = frappe.get_all(
		APPLICATION,
		fields=["name", "company_name", "track", "submitted_at", "status", "vote_round", "final_percentage"],
		order_by="submitted_at desc",
	)
	votes = {}
	for vote in frappe.get_all(VOTE, fields=["application", "vote_round", "member"]):
		votes.setdefault((vote.application, vote.vote_round), set()).add(vote.member)

	approver = roles_of(user)["chair"]
	reviewers, early = _reviewers(), _early_decisions()
	for row in rows:
		voted = votes.get((row.name, row.vote_round), set())
		row.voted = user in voted
		row.can_decide = approver and _ready(row.status, voted, reviewers, early)
	return rows


def get_application(user, name):
	"""One application as this user may see it: a member gets their own score, the chair gets everyone's."""
	roles = roles_of(user)
	application = frappe.get_doc(APPLICATION, name)
	out = {
		"name": application.name,
		"company_name": application.company_name,
		"track": application.track,
		"status": application.status,
		"vote_round": application.vote_round,
		"supplier": application.supplier,
		"sections": describe(application),
		"can_vote": roles["member"] and application.status in VOTING,
		"can_decide": roles["chair"] and ready_for_decision(application),
	}

	vote_fields = ["member_name", "decision", "percentage", "note", "negotiate", "negotiation_note"]
	this_round = {"application": name, "vote_round": application.vote_round}
	if roles["member"]:
		mine = frappe.get_all(VOTE, filters={**this_round, "member": user}, fields=vote_fields)
		out["my_vote"] = mine[0] if mine else None
	if roles["chair"] or roles["admin"]:
		votes = frappe.get_all(VOTE, filters=this_round, fields=vote_fields, order_by="voted_at")
		out["votes"] = votes
		out["average"] = round(sum(flt(v.percentage) for v in votes) / len(votes)) if votes else None
		out["decisions"] = [
			{
				"decision_type": row.decision_type,
				"result": row.result,
				"percentage": row.percentage,
				"note": row.note,
				"decided_by": frappe.utils.get_fullname(row.decided_by),
				"decided_at": row.decided_at,
			}
			for row in application.chair_decisions
		]
	return out


def describe(application):
	"""The application as the committee reads it: the form's own sections and labels, unanswered questions left out.

	Driven by the DocType, so a field added to the form shows up here without a second list to keep in step.
	"""
	doctype = application.doctype
	current = {"title": _("Application"), "fields": [], "tables": []}
	sections = [current]

	for df in application.meta.fields:
		if df.fieldtype == "Tab Break" and df.label == "Committee":
			break
		if df.fieldtype in BREAKS:
			if df.label:
				current = {"title": _(df.label, context=doctype), "fields": [], "tables": []}
				sections.append(current)
			continue

		value = application.get(df.fieldname)
		if not value:
			continue
		if df.fieldtype in ("Table", "Table MultiSelect"):
			columns = [c for c in frappe.get_meta(df.options).fields if c.fieldtype not in BREAKS]
			current["tables"].append(
				{
					"title": _(df.label, context=doctype),
					"columns": [_(c.label, context=df.options) for c in columns],
					"rows": [[_show(c, row.get(c.fieldname)) for c in columns] for row in value],
				}
			)
		else:
			current["fields"].append({"label": _(df.label, context=doctype), **_show(df, value)})

	return [section for section in sections if section["fields"] or section["tables"]]


def _show(df, value):
	"""A value the way a reader wants it: a file to open, a link to follow, or text."""
	if not value:
		return {"kind": "text", "value": ""}
	if df.fieldtype == "Attach":
		return {"kind": "file", "value": value}
	if df.fieldtype == "Check":
		return {"kind": "text", "value": _("Yes")}
	if df.fieldtype == "Select":
		return {"kind": "text", "value": _(value)}
	if df.fieldtype == "Data" and str(value).startswith(("http://", "https://")):
		return {"kind": "link", "value": value}
	return {"kind": "text", "value": frappe.format_value(value, df)}


# --------------------------------------------------------------------------- members
def cast_vote(user, name, decision, percentage, note=None, negotiate=0, negotiation_note=None):
	"""Record a member's score for the current round, or replace it while the round is open."""
	application = frappe.get_doc(APPLICATION, name, for_update=True)
	if application.status not in VOTING:
		frappe.throw(_("This application is no longer open for the members' evaluation."))
	if decision not in RESULTS or percentage in (None, ""):
		frappe.throw(_("Choose a decision and a proposed qualification percentage."))

	this_round = {"application": name, "vote_round": application.vote_round, "member": user}
	existing = frappe.db.exists(VOTE, this_round)
	vote = frappe.get_doc(VOTE, existing) if existing else frappe.get_doc({"doctype": VOTE, **this_round})
	vote.update(
		{
			"decision": decision,
			"percentage": flt(percentage),
			"note": note,
			"negotiate": cint(negotiate),
			"negotiation_note": negotiation_note if cint(negotiate) else None,
		}
	)
	vote.save(ignore_permissions=True)

	application.status = "Pending Chair" if _reviewers() <= _voted(application) else "Under Committee Vote"
	application.save(ignore_permissions=True)


def _reviewers():
	"""Who must evaluate before an approver is asked: the active members who cannot approve."""
	return set(
		frappe.get_all("Qualification Committee Member", filters={"active": 1, "is_chair": 0}, pluck="user")
	)


def _voted(application):
	return set(
		frappe.get_all(
			VOTE,
			filters={"application": application.name, "vote_round": application.vote_round},
			pluck="member",
		)
	)


def _early_decisions():
	return bool(frappe.db.get_single_value("Qualification Settings", "approve_before_reviews"))


def _ready(status, voted, reviewers, early):
	"""Whether an approver may decide now.

	Asked of the roster as it is today rather than read off the status alone, so a
	committee with no reviewers — or one whose last reviewer left — is never stuck
	waiting for a score nobody will give.
	"""
	if status in WITH_CHAIR:
		return True
	return status in VOTING and (early or reviewers <= voted)


def ready_for_decision(application):
	return _ready(application.status, _voted(application), _reviewers(), _early_decisions())


# --------------------------------------------------------------------------- the chair
def decide(user, name, decision_type, result=None, percentage=None, note=None):
	"""The chair's move: a verdict, or one of the holds that keep the application open."""
	application = frappe.get_doc(APPLICATION, name, for_update=True)
	if not ready_for_decision(application):
		frappe.throw(_("A decision can be made only after every reviewer has evaluated the application."))

	entry = {"decision_type": decision_type, "note": note, "decided_by": user, "decided_at": now_datetime()}

	if decision_type == "Approve Result":
		if result not in RESULTS or percentage in (None, ""):
			frappe.throw(_("Choose the final result and the final qualification percentage."))
		if not 0 <= flt(percentage) <= 100:
			frappe.throw(_("The percentage must be between 0 and 100."))
		application.final_result = result
		application.final_percentage = flt(percentage)
		application.status = result
		if result == "Qualified":
			application.supplier = _supplier_for(application)
		entry.update({"result": result, "percentage": flt(percentage)})
	elif decision_type in HOLDS:
		if not note:
			frappe.throw(_("Write a note explaining the decision."))
		application.status = HOLDS[decision_type]
		if decision_type == "Request Revote":
			# A new round: the members score again, and what they said before stays on record under the old one.
			application.vote_round += 1
	else:
		frappe.throw(_("Unknown decision."))

	application.append("chair_decisions", entry)
	application.save(ignore_permissions=True)

	if decision_type != "Request Revote":
		notifications.send_decision(application, note)


def _supplier_for(application):
	"""The ERPNext Supplier a qualified applicant becomes; an organisation already there is linked, not doubled."""
	existing = frappe.db.get_value("Supplier", {"supplier_name": application.company_name})
	if existing:
		return existing

	group = (
		frappe.db.get_single_value("Qualification Settings", "supplier_group")
		or frappe.db.get_single_value("Buying Settings", "supplier_group")
		or frappe.db.get_value("Supplier Group", {"is_group": 0})
	)
	if not group:
		frappe.throw(_("Set a Supplier Group in Qualification Settings before qualifying an applicant."))

	details = [
		(_("Qualification Application"), application.name),
		(_("Commercial Registration No.", context=APPLICATION), application.cr_number),
		(_("Responsible Person", context=APPLICATION), application.responsible_person),
		(_("Email", context=APPLICATION), application.email),
		(_("Phone", context=APPLICATION), application.phone),
		(_("City", context=APPLICATION), application.city),
	]
	return (
		frappe.get_doc(
			{
				"doctype": "Supplier",
				"supplier_name": application.company_name,
				"supplier_group": group,
				"supplier_type": "Company",
				"supplier_details": "\n".join(f"{label}: {value}" for label, value in details if value),
			}
		)
		.insert(ignore_permissions=True)
		.name
	)
