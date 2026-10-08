import frappe
from frappe.tests.utils import FrappeTestCase

from supplier_qualification.constants import TRACK_CONSTRUCTION, TRACK_SUPPLIER
from supplier_qualification.utils import applications, otp

EMAIL = "applicant@vendor.example"


def form(**values):
	return {
		"companyName": "مؤسسة البناء",
		"crNumber": "1010123456",
		"responsiblePerson": "أحمد",
		"city": "الرياض",
		"ackName": "مؤسسة البناء",
		"ackEmployee": "أحمد",
		"ackDate": "2026-10-08",
		"ackConfirmed": True,
		**values,
	}


class TestVerification(FrappeTestCase):
	def test_a_correct_code_buys_a_session_and_is_spent(self):
		code = otp.issue_code(EMAIL)
		token = otp.redeem_code(EMAIL, code)

		self.assertEqual(otp.session_email(token), EMAIL)
		self.assertRaises(frappe.ValidationError, otp.redeem_code, EMAIL, code)

	def test_five_wrong_tries_kill_the_code(self):
		code = otp.issue_code(EMAIL)
		wrong = "000000" if code != "000000" else "111111"
		for _ in range(otp.MAX_ATTEMPTS):
			self.assertRaises(frappe.ValidationError, otp.redeem_code, EMAIL, wrong)

		self.assertRaises(frappe.ValidationError, otp.redeem_code, EMAIL, code)

	def test_no_token_no_entry(self):
		self.assertRaises(frappe.PermissionError, otp.session_email, "made-up")
		self.assertRaises(frappe.PermissionError, otp.session_email, None)

	def test_signing_out_ends_the_session(self):
		token = otp.redeem_code(EMAIL, otp.issue_code(EMAIL))
		otp.end_session(token)

		self.assertRaises(frappe.PermissionError, otp.session_email, token)


class TestApplicant(FrappeTestCase):
	def test_a_draft_comes_back_as_it_was_saved(self):
		applications.save_draft(EMAIL, TRACK_SUPPLIER, {"companyName": "مؤسسة"}, step=2)
		applications.save_draft(EMAIL, TRACK_SUPPLIER, {"companyName": "مؤسسة البناء"}, step=3)

		self.assertEqual(
			applications.get_draft(EMAIL, TRACK_SUPPLIER),
			{"data": {"companyName": "مؤسسة البناء"}, "step": 3},
		)
		self.assertIsNone(applications.get_draft(EMAIL, TRACK_CONSTRUCTION))
		self.assertIsNone(applications.get_draft("someone@else.example", TRACK_SUPPLIER))

	def test_submitting_builds_the_application_and_ends_the_draft(self):
		applications.save_draft(EMAIL, TRACK_CONSTRUCTION, {}, 0)
		uploaded = applications.attach_file(EMAIL, TRACK_CONSTRUCTION, "cr.png", b"cr scan")["file_url"]

		reference = applications.submit(
			EMAIL,
			TRACK_CONSTRUCTION,
			form(
				capital="500000",
				hasDisputes="لا",
				documents=[
					{"name": "السجل التجاري", "expiry": "2027-01-01", "file": uploaded},
					{"name": "الزكاة", "ref": "https://drive.example/z"},
					{"name": "التأمينات"},
				],
				engineers=[{"name": "سالم", "job": "مهندس مدني", "years": "7"}, {"name": ""}],
				projects=[{"name": "جامع", "contractValue": "1200000", "contractDuration": "14"}],
				budgetYears=[{"year": "2025", "note": "مدققة"}, {"year": ""}],
			),
		)

		application = frappe.get_doc("Qualification Application", reference)
		self.assertTrue(reference.startswith("Q-"))
		self.assertEqual(application.status, "Awaiting Committee")
		self.assertEqual((application.capital, application.has_disputes), (500000, "No"))
		self.assertEqual([row.attached for row in application.documents], [1, 1, 0])
		self.assertEqual(len(application.engineers), 1)
		self.assertEqual(application.engineers[0].years_of_experience, 7)
		self.assertEqual(application.projects[0].contract_duration_months, 14)
		self.assertEqual(len(application.budget_years), 1)

		self.assertIsNone(applications.get_draft(EMAIL, TRACK_CONSTRUCTION))
		self.assertEqual(
			frappe.db.get_value("File", {"file_url": uploaded}, "attached_to_name"),
			reference,
		)

	def test_a_file_the_applicant_did_not_upload_is_not_attached(self):
		reference = applications.submit(
			EMAIL,
			TRACK_SUPPLIER,
			form(documents=[{"name": "السجل التجاري", "file": "/private/files/someone-elses.pdf"}]),
		)

		row = frappe.get_doc("Qualification Application", reference).documents[0]
		self.assertFalse(row.file)
		self.assertFalse(row.attached)

	def test_no_declaration_no_submission(self):
		self.assertRaises(
			frappe.ValidationError, applications.submit, EMAIL, TRACK_SUPPLIER, form(ackConfirmed=False)
		)
		self.assertRaises(
			frappe.ValidationError, applications.submit, EMAIL, TRACK_SUPPLIER, form(ackDate="")
		)

	def test_a_damaged_pdf_is_refused_in_words(self):
		self.assertRaises(
			frappe.ValidationError, applications.attach_file, EMAIL, TRACK_SUPPLIER, "cr.pdf", b"%PDF-1.4"
		)

	def test_only_safe_file_types_are_kept(self):
		self.assertRaises(
			frappe.ValidationError, applications.attach_file, EMAIL, TRACK_SUPPLIER, "run.exe", b"MZ"
		)

	def test_an_applicant_sees_their_own_applications_and_drafts_and_no_one_elses(self):
		me = "overview@vendor.example"
		reference = applications.submit(me, TRACK_SUPPLIER, form())
		applications.save_draft(me, TRACK_CONSTRUCTION, {"companyName": "مؤسسة"}, step=1)
		applications.submit("other@vendor.example", TRACK_SUPPLIER, form())

		mine = applications.overview(me)

		self.assertEqual([row.name for row in mine["applications"]], [reference])
		self.assertEqual(mine["applications"][0].status, "Awaiting Committee")
		self.assertEqual([(row.track, row.step) for row in mine["drafts"]], [(TRACK_CONSTRUCTION, 1)])

	def test_the_chairs_note_reaches_the_applicant_while_it_is_waiting_on_them(self):
		me = "inquiry@vendor.example"
		reference = applications.submit(me, TRACK_SUPPLIER, form())
		application = frappe.get_doc("Qualification Application", reference)
		application.append("chair_decisions", {"decision_type": "Raise Inquiry", "note": "أين شهادة الزكاة؟"})
		application.status = "Chair Inquiry"
		application.save()

		self.assertEqual(applications.overview(me)["applications"][0].chair_note, "أين شهادة الزكاة؟")
