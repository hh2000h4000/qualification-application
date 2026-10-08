import frappe

from supplier_qualification.constants import (
	ROLE_ADMIN,
	ROLE_CHAIR,
	ROLE_MEMBER,
	TRACK_CONSTRUCTION,
	TRACK_OM,
	TRACK_SUPPLIER,
)

SUPPLY_CATEGORIES = (
	"مواد ومستلزمات بناء",
	"أثاث ومكتبيات",
	"تقنية معلومات وأجهزة",
	"خدمات نظافة ومستلزماتها",
	"مواد غذائية وضيافة",
	"طباعة وخدمات إعلانية",
	"أخرى",
)

REQUIRED_DOCUMENTS = {
	TRACK_CONSTRUCTION: (
		"صورة شهادة السجل التجاري أو الترخيص سارية الصلاحية",
		"صورة شهادة الزكاة والدخل سارية الصلاحية",
		"صورة شهادة التأمينات الاجتماعية سارية الصلاحية",
		"صورة شهادة العضوية في الغرفة التجارية",
		"صورة شهادة التوطين (نطاقات)",
		"صورة شهادة تصنيف المقاولين",
		"ملف الجهة (معلومات عامة عن المالك والمديرين ومعلومات التواصل وسابقة الأعمال)",
	),
	TRACK_OM: (
		"صورة من السجل التجاري",
		"صورة من شهادة تصنيف المقاولين (تخصص التشغيل والصيانة)",
		"صورة من شهادة التأمينات الاجتماعية",
		"صورة من شهادة الزكاة والدخل",
		"صورة من شهادة الاشتراك في الغرفة التجارية",
		"صورة من شهادة التوطين (نطاقات)",
	),
	TRACK_SUPPLIER: (
		"صورة من السجل التجاري",
		"صورة من شهادة الزكاة والدخل",
		"صورة من شهادة الاشتراك في الغرفة التجارية",
		"صورة من شهادة التأمينات الاجتماعية (إن وجد موظفون مسجلون)",
	),
}


def ensure_roles():
	for role in (ROLE_ADMIN, ROLE_CHAIR, ROLE_MEMBER):
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(
				ignore_permissions=True
			)


def after_install():
	"""Seed what the portal's form is built from. A site that already has its own is left alone."""
	for category in SUPPLY_CATEGORIES:
		if not frappe.db.exists("Qualification Supply Category", category):
			frappe.get_doc({"doctype": "Qualification Supply Category", "category_name": category}).insert(
				ignore_permissions=True
			)

	settings = frappe.get_single("Qualification Settings")
	if not settings.required_documents:
		for track, documents in REQUIRED_DOCUMENTS.items():
			for document_name in documents:
				settings.append("required_documents", {"track": track, "document_name": document_name})
		settings.save(ignore_permissions=True)
