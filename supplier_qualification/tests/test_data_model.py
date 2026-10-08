import frappe
from frappe.tests.utils import FrappeTestCase

from supplier_qualification.constants import (
	ROLE_CHAIR,
	ROLE_MEMBER,
	TRACK_CONSTRUCTION,
	TRACK_SUPPLIER,
)


def make_user(email):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0}
		).insert(ignore_permissions=True)
	return email


def make_application(track=TRACK_SUPPLIER, **values):
	return frappe.get_doc(
		{
			"doctype": "Qualification Application",
			"track": track,
			"email": "  Info@Vendor.Example ",
			"company_name": "Vendor",
			"cr_number": "1010000000",
			"responsible_person": "Owner",
			**values,
		}
	).insert()


def make_member(email, **values):
	return frappe.get_doc(
		{"doctype": "Qualification Committee Member", "user": make_user(email), **values}
	).insert()


class TestDataModel(FrappeTestCase):
	def test_reference_number_carries_the_track_and_counts_within_it(self):
		first = make_application(TRACK_SUPPLIER)
		second = make_application(TRACK_SUPPLIER)
		other = make_application(TRACK_CONSTRUCTION)

		year = frappe.utils.now_datetime().year
		self.assertTrue(first.name.startswith(f"S-{year}-"))
		self.assertTrue(other.name.startswith(f"Q-{year}-"))
		self.assertEqual(int(second.name[-4:]), int(first.name[-4:]) + 1)

	def test_email_is_stored_the_way_it_will_be_typed_again(self):
		self.assertEqual(make_application().email, "info@vendor.example")

	def test_a_member_votes_once_per_round(self):
		application = make_application()
		vote = {
			"doctype": "Qualification Vote",
			"application": application.name,
			"vote_round": 1,
			"member": make_user("sq-voter@example.com"),
			"decision": "Qualified",
			"percentage": 80,
		}
		frappe.get_doc(vote).insert()
		self.assertRaises(frappe.DuplicateEntryError, frappe.get_doc(vote).insert)
		frappe.get_doc({**vote, "vote_round": 2}).insert()

	def test_a_percentage_above_a_hundred_is_refused(self):
		vote = frappe.get_doc(
			{
				"doctype": "Qualification Vote",
				"application": make_application().name,
				"member": make_user("sq-voter@example.com"),
				"decision": "Qualified",
				"percentage": 120,
			}
		)
		self.assertRaises(frappe.ValidationError, vote.insert)

	def test_the_roster_gives_the_role_and_takes_it_back(self):
		approver = make_member("sq-first@example.com", is_chair=1)
		reviewer = make_member("sq-second@example.com")
		self.assertIn(ROLE_CHAIR, frappe.get_roles(approver.user))
		self.assertIn(ROLE_MEMBER, frappe.get_roles(reviewer.user))

		# A second approver does not unseat the first.
		reviewer.is_chair = 1
		reviewer.save()
		self.assertIn(ROLE_CHAIR, frappe.get_roles(reviewer.user))
		self.assertNotIn(ROLE_MEMBER, frappe.get_roles(reviewer.user))
		self.assertIn(ROLE_CHAIR, frappe.get_roles(approver.user))

		reviewer.delete()
		self.assertNotIn(ROLE_CHAIR, frappe.get_roles(reviewer.user))
