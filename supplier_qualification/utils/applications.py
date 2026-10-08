"""The applicant's side: a draft kept on the server, files attached to it, and the submission built from it.

The portal's form speaks its own field names; this is the one place they are
turned into the DocType's.
"""

import json
import os

import frappe
from frappe import _
from frappe.utils import cint, flt

from supplier_qualification.constants import TRACK_PREFIX
from supplier_qualification.utils import notifications

MAX_DRAFT_BYTES = 300_000
MAX_FILE_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".xls", ".xlsx"}

YES_NO = {"نعم": "Yes", "لا": "No", "Yes": "Yes", "No": "No"}

#: portal key -> (fieldname, converter)
SCALARS = {
	"companyName": ("company_name", str),
	"capital": ("capital", flt),
	"crNumber": ("cr_number", str),
	"crDate": ("cr_date", str),
	"responsiblePerson": ("responsible_person", str),
	"position": ("position", str),
	"foundingYear": ("founding_year", cint),
	"city": ("city", str),
	"street": ("street", str),
	"poBox": ("po_box", str),
	"postalCode": ("postal_code", str),
	"phone": ("phone", str),
	"fax": ("fax", str),
	"email2": ("secondary_email", str),
	"categoryOther": ("category_other", str),
	"activityDesc": ("activity_description", str),
	"hasOperationalStaff": ("has_operational_staff", YES_NO.get),
	"residentCleanerCommitted": ("resident_cleaner_committed", cint),
	"orgChartRef": ("org_chart_reference", str),
	"vehiclesCount": ("vehicles_count", cint),
	"hasUniforms": ("has_uniforms", YES_NO.get),
	"equipmentRef": ("equipment_reference", str),
	"hasQualitySystem": ("has_quality_system", YES_NO.get),
	"qualityDetails": ("quality_details", str),
	"qualityRef": ("quality_reference", str),
	"hasDisputes": ("has_disputes", YES_NO.get),
	"disputeDetails": ("dispute_details", str),
	"hasAccountingSystem": ("has_accounting_system", YES_NO.get),
	"bankStatementRef": ("bank_statement_reference", str),
	"ackName": ("ack_company_name", str),
	"ackEmployee": ("ack_employee", str),
	"ackDate": ("ack_date", str),
	"ackConfirmed": ("ack_confirmed", cint),
}

#: portal key -> fieldname, for the single files beside a link
FILES = {
	"orgChartFile": "org_chart_file",
	"equipmentFile": "equipment_file",
	"qualityFile": "quality_file",
	"bankStatementFile": "bank_statement_file",
}

STAFF = {
	"name": ("full_name", str),
	"job": ("job_title", str),
	"specialty": ("specialty", str),
	"years": ("years_of_experience", cint),
	"certRef": ("certificates_reference", str),
}
PROJECT = {
	"name": ("project_name", str),
	"components": ("components", str),
	"sitesCount": ("sites_count", cint),
	"owner": ("owner_name", str),
	"ownerAddress": ("owner_address", str),
	"ownerContact": ("owner_contact", str),
	"contractValue": ("contract_value", flt),
	"contractDuration": ("contract_duration_months", cint),
	"startDate": ("start_date", str),
	"endDate": ("end_date", str),
}

#: portal key -> (table fieldname, column map, the column a row cannot be without)
TABLES = {
	"engineers": ("engineers", STAFF, "name"),
	"supervisors": ("supervisors", STAFF, "name"),
	"technicians": ("technicians", STAFF, "name"),
	"projects": ("projects", PROJECT, "name"),
}


def check_track(track):
	if track not in TRACK_PREFIX:
		frappe.throw(_("Unknown qualification track."))
	return track


# --------------------------------------------------------------------------- draft
def get_draft(email, track):
	draft = _draft_name(email, track)
	if not draft:
		return None
	data, step = frappe.db.get_value("Qualification Draft", draft, ["data", "step"])
	return {"data": json.loads(data or "{}"), "step": step}


def save_draft(email, track, data, step=0):
	payload = json.dumps(data, ensure_ascii=False)
	if len(payload.encode()) > MAX_DRAFT_BYTES:
		frappe.throw(_("The form is too large to save."))

	draft = frappe.get_doc("Qualification Draft", _ensure_draft(email, track))
	draft.data = payload
	draft.step = cint(step)
	draft.save(ignore_permissions=True)


def attach_file(email, track, filename, content):
	"""Keep an uploaded file, privately, with the applicant's draft. Returns what the form stores."""
	if os.path.splitext(filename or "")[1].lower() not in ALLOWED_EXTENSIONS:
		frappe.throw(_("This file type is not accepted. Upload a PDF, an image, or a Word or Excel file."))
	if len(content) > MAX_FILE_BYTES:
		frappe.throw(_("The file is larger than 10 MB."))

	file = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"content": content,
			"is_private": 1,
			"attached_to_doctype": "Qualification Draft",
			"attached_to_name": _ensure_draft(email, track),
		}
	)
	try:
		file.insert(ignore_permissions=True)
	except frappe.ValidationError:
		raise
	except Exception:
		# Frappe opens a PDF to inspect it; a damaged one fails there, not in anything the applicant did wrong.
		frappe.throw(_("The file could not be read. Check that it opens on your device and upload it again."))
	return {"file_url": file.file_url, "file_name": file.file_name}


def _draft_name(email, track):
	return frappe.db.get_value("Qualification Draft", {"email": email, "track": track})


def _ensure_draft(email, track):
	return (
		_draft_name(email, track)
		or frappe.get_doc({"doctype": "Qualification Draft", "email": email, "track": track})
		.insert(ignore_permissions=True)
		.name
	)


# --------------------------------------------------------------------------- submission
def submit(email, track, data):
	"""Turn the applicant's form into an application, and hand its files over with it."""
	if not cint(data.get("ackConfirmed")):
		frappe.throw(_("Confirm the declaration before submitting."))
	for key in ("companyName", "crNumber", "responsiblePerson"):
		if not data.get(key):
			frappe.throw(
				_(
					"Complete the organisation details: name, commercial registration number and responsible person."
				)
			)
	for key in ("ackName", "ackEmployee", "ackDate"):
		if not data.get(key):
			frappe.throw(_("Complete the declaration: organisation name, responsible employee and date."))

	draft = _draft_name(email, track)
	# Only what this applicant uploaded can be attached; a pasted path to another file is dropped.
	own_files = set(
		frappe.get_all(
			"File",
			filters={"attached_to_doctype": "Qualification Draft", "attached_to_name": draft},
			pluck="file_url",
		)
		if draft
		else []
	)

	def own(url):
		return url if url in own_files else None

	application = frappe.new_doc("Qualification Application")
	application.track = track
	application.email = email
	_fill(application, data, SCALARS)
	for key, fieldname in FILES.items():
		application.set(fieldname, own(data.get(key)))

	for key, (fieldname, columns, required) in TABLES.items():
		for row in data.get(key) or []:
			if row.get(required):
				_fill(application.append(fieldname, {}), row, columns)

	for row in data.get("documents") or []:
		file, link = own(row.get("file")), row.get("ref")
		application.append(
			"documents",
			{
				"document_name": row.get("name"),
				"expiry_date": row.get("expiry") or None,
				"file": file,
				"reference_link": link,
				"attached": 1 if (file or link) else 0,
			},
		)

	for row in data.get("budgetYears") or []:
		file = own(row.get("file"))
		if row.get("year") or file or row.get("note"):
			application.append(
				"budget_years",
				{
					"fiscal_year": row.get("year"),
					"file": file,
					"attached": 1 if file else 0,
					"note": row.get("note"),
				},
			)

	for category in data.get("supplyCategories") or []:
		if frappe.db.exists("Qualification Supply Category", category):
			application.append("supply_categories", {"category": category})

	application.insert(ignore_permissions=True)

	used = [url for url in own_files if _uses(application, url)]
	for name in frappe.get_all(
		"File", filters={"file_url": ("in", used), "attached_to_name": draft}, pluck="name"
	):
		frappe.db.set_value(
			"File",
			name,
			{"attached_to_doctype": application.doctype, "attached_to_name": application.name},
		)
	if draft:
		frappe.delete_doc("Qualification Draft", draft, ignore_permissions=True, force=True)

	notifications.send_application_received(application)
	return application.name


def _fill(target, source, columns):
	for key, (fieldname, convert) in columns.items():
		value = source.get(key)
		if value not in (None, ""):
			target.set(fieldname, convert(value))


def _uses(application, url):
	rows = [application, *application.documents, *application.budget_years]
	return any(url in row.as_dict().values() for row in rows)


# --------------------------------------------------------------------------- follow-up
def overview(email):
	"""Everything an applicant has with us: what was submitted and where it stands, and what is still a draft."""
	submitted = frappe.get_all(
		"Qualification Application",
		filters={"email": email},
		fields=["name", "track", "company_name", "submitted_at", "status", "final_percentage"],
		order_by="submitted_at desc",
	)
	for application in submitted:
		application.chair_note = _chair_note(application)

	drafts = frappe.get_all(
		"Qualification Draft",
		filters={"email": email},
		fields=["track", "step", "modified"],
		order_by="modified desc",
	)
	return {"applications": submitted, "drafts": drafts}


def _chair_note(application):
	"""What the chair asked or objected to, while the application waits on it."""
	if application.status not in ("Chair Reservation", "Chair Inquiry"):
		return None
	notes = frappe.get_all(
		"Qualification Chair Decision",
		filters={"parent": application.name, "parenttype": "Qualification Application"},
		fields=["note"],
		order_by="idx desc",
		limit=1,
	)
	return notes[0].note if notes else None
