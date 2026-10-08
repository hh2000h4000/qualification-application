from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import get_datetime, now_datetime

from supplier_qualification.constants import TRACK_PREFIX


class QualificationApplication(Document):
	def before_insert(self):
		if not self.submitted_at:
			self.submitted_at = now_datetime()

	def autoname(self):
		"""Q-2026-0001: the track's letter, the year submitted, a counter per track and year."""
		year = get_datetime(self.submitted_at or now_datetime()).year
		self.name = make_autoname(f"{TRACK_PREFIX[self.track]}-{year}-.####")

	def validate(self):
		# The applicant follows the application up by this address, typed again later.
		self.email = (self.email or "").strip().lower()
