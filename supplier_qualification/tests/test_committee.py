import frappe
from frappe.tests.utils import FrappeTestCase

from supplier_qualification.constants import TRACK_SUPPLIER
from supplier_qualification.tests.test_data_model import make_application, make_member
from supplier_qualification.utils import committee

FIRST = "sq-member-one@example.com"
SECOND = "sq-member-two@example.com"
CHAIR = "sq-chair@example.com"


class TestCommittee(FrappeTestCase):
	def setUp(self):
		for name in frappe.get_all("Qualification Committee Member", pluck="name"):
			frappe.delete_doc("Qualification Committee Member", name, force=True)
		make_member(FIRST)
		make_member(SECOND)
		make_member(CHAIR, is_chair=1)
		self.application = make_application(TRACK_SUPPLIER, company_name=frappe.generate_hash(length=8)).name

	def status(self):
		return frappe.db.get_value("Qualification Application", self.application, "status")

	def everyone_votes(self):
		committee.cast_vote(FIRST, self.application, "Qualified", 80)
		committee.cast_vote(SECOND, self.application, "Qualified", 60, negotiate=1, negotiation_note="السعر")

	def test_the_application_reaches_the_chair_when_the_last_member_has_scored(self):
		committee.cast_vote(FIRST, self.application, "Qualified", 80)
		self.assertEqual(self.status(), "Under Committee Vote")

		committee.cast_vote(SECOND, self.application, "Not Qualified", 40)
		self.assertEqual(self.status(), "Pending Chair")

	def test_a_member_changes_their_score_only_while_the_round_is_open(self):
		committee.cast_vote(FIRST, self.application, "Qualified", 80)
		committee.cast_vote(FIRST, self.application, "Qualified", 70)
		self.assertEqual(frappe.db.count("Qualification Vote", {"application": self.application}), 1)

		committee.cast_vote(SECOND, self.application, "Qualified", 60)
		self.assertRaises(
			frappe.ValidationError, committee.cast_vote, FIRST, self.application, "Qualified", 90
		)

	def test_the_chair_cannot_decide_before_the_members_have(self):
		committee.cast_vote(FIRST, self.application, "Qualified", 80)
		self.assertRaises(
			frappe.ValidationError,
			committee.decide,
			CHAIR,
			self.application,
			"Approve Result",
			"Qualified",
			80,
		)

	def test_a_manager_alone_decides_without_waiting_for_anyone(self):
		for reviewer in (FIRST, SECOND):
			frappe.delete_doc("Qualification Committee Member", reviewer, force=True)

		self.assertTrue(committee.get_application(CHAIR, self.application)["can_decide"])
		committee.decide(CHAIR, self.application, "Approve Result", "Qualified", 90)
		self.assertEqual(self.status(), "Qualified")

	def test_any_approver_may_decide(self):
		make_member("sq-chair-two@example.com", is_chair=1)
		self.everyone_votes()

		committee.decide("sq-chair-two@example.com", self.application, "Approve Result", "Qualified", 80)
		self.assertEqual(self.status(), "Qualified")

	def test_the_setting_lets_an_approver_decide_before_the_reviews_are_in(self):
		frappe.db.set_single_value("Qualification Settings", "approve_before_reviews", 1)
		committee.cast_vote(FIRST, self.application, "Qualified", 80)

		mine = next(row for row in committee.list_applications(CHAIR) if row.name == self.application)
		self.assertTrue(mine.can_decide)
		committee.decide(CHAIR, self.application, "Approve Result", "Not Qualified", 20)
		self.assertEqual(self.status(), "Not Qualified")

	def test_qualifying_creates_the_supplier_once(self):
		self.everyone_votes()
		committee.decide(CHAIR, self.application, "Approve Result", "Qualified", 75)

		application = frappe.get_doc("Qualification Application", self.application)
		self.assertEqual((application.status, application.final_percentage), ("Qualified", 75))
		self.assertEqual(
			frappe.db.get_value("Supplier", application.supplier, "supplier_name"), application.company_name
		)
		self.assertEqual(application.chair_decisions[-1].decided_by, CHAIR)
		self.assertRaises(
			frappe.ValidationError,
			committee.decide,
			CHAIR,
			self.application,
			"Approve Result",
			"Qualified",
			75,
		)

	def test_not_qualified_creates_no_supplier(self):
		self.everyone_votes()
		committee.decide(CHAIR, self.application, "Approve Result", "Not Qualified", 30)

		application = frappe.get_doc("Qualification Application", self.application)
		self.assertEqual(application.status, "Not Qualified")
		self.assertFalse(application.supplier)

	def test_a_revote_opens_a_new_round_and_keeps_the_old_scores(self):
		self.everyone_votes()
		committee.decide(CHAIR, self.application, "Request Revote", note="راجعوا المستندات")
		self.assertEqual(self.status(), "Revote Requested")

		mine = next(row for row in committee.list_applications(FIRST) if row.name == self.application)
		self.assertFalse(mine.voted)
		self.everyone_votes()

		self.assertEqual(self.status(), "Pending Chair")
		self.assertEqual(frappe.db.count("Qualification Vote", {"application": self.application}), 4)
		self.assertEqual(len(committee.get_application(CHAIR, self.application)["votes"]), 2)

	def test_an_inquiry_holds_the_application_and_the_chair_decides_later(self):
		self.everyone_votes()
		self.assertRaises(frappe.ValidationError, committee.decide, CHAIR, self.application, "Raise Inquiry")

		committee.decide(CHAIR, self.application, "Raise Inquiry", note="أين شهادة الزكاة؟")
		self.assertEqual(self.status(), "Chair Inquiry")

		committee.decide(CHAIR, self.application, "Approve Result", "Qualified", 70)
		self.assertEqual(self.status(), "Qualified")

	def test_a_member_sees_their_own_score_and_the_chair_sees_all(self):
		self.everyone_votes()

		member = committee.get_application(FIRST, self.application)
		self.assertEqual(member["my_vote"].percentage, 80)
		self.assertNotIn("votes", member)
		self.assertFalse(member["can_vote"])

		chair = committee.get_application(CHAIR, self.application)
		self.assertEqual((len(chair["votes"]), chair["average"]), (2, 70))
		self.assertTrue(chair["can_decide"])

	def test_the_application_is_read_in_its_own_words_without_the_committees_side(self):
		frappe.local.lang = "ar"
		sections = committee.describe(frappe.get_doc("Qualification Application", self.application))

		labels = [field["label"] for section in sections for field in section["fields"]]
		self.assertIn("رقم السجل التجاري", labels)
		self.assertNotIn("جولة التصويت", labels)

	def test_administrator_sitting_as_a_member_is_a_member_not_the_chair(self):
		make_member("Administrator")

		seat = committee.roles_of("Administrator")
		self.assertEqual((seat["member"], seat["chair"]), (True, False))

		committee.cast_vote("Administrator", self.application, "Qualified", 90)
		self.assertTrue(committee.get_application("Administrator", self.application)["my_vote"])

	def test_a_user_outside_the_committee_is_refused(self):
		self.assertRaises(frappe.PermissionError, committee.require, "Guest", "member", "chair", "admin")
		self.assertRaises(frappe.PermissionError, committee.require, FIRST, "chair")
