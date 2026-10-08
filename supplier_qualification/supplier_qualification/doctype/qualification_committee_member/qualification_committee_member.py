import frappe
from frappe.model.document import Document

from supplier_qualification.constants import ROLE_CHAIR, ROLE_MEMBER


class QualificationCommitteeMember(Document):
	def on_update(self):
		self._sync_roles()

	def on_trash(self):
		self._sync_roles(removed=True)

	def _sync_roles(self, removed=False):
		"""The roster is where committee access is given; the user's roles follow it."""
		wanted = set()
		if self.active and not removed:
			wanted = {ROLE_CHAIR if self.is_chair else ROLE_MEMBER}

		user = frappe.get_doc("User", self.user)
		user.flags.ignore_permissions = True
		held = {row.role for row in user.roles}
		to_add = wanted - held
		to_remove = ({ROLE_CHAIR, ROLE_MEMBER} - wanted) & held
		if to_add:
			user.add_roles(*to_add)
		if to_remove:
			user.remove_roles(*to_remove)
