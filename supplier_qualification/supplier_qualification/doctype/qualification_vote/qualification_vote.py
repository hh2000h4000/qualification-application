import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


class QualificationVote(Document):
	def autoname(self):
		# One vote per member per round: a second one collides on the name.
		self.name = f"{self.application}-R{self.vote_round}-{self.member}"

	def validate(self):
		if not 0 <= flt(self.percentage) <= 100:
			frappe.throw(_("The percentage must be between 0 and 100."))
		self.voted_at = now_datetime()
