app_name = "supplier_qualification"
app_title = "Supplier Qualification"
app_publisher = "RPOS"
app_description = "Supplier and contractor qualification portal on Frappe / ERPNext v15"
app_email = "hh2000h4000@gmail.com"
app_license = "MIT"

# A qualified applicant becomes an ERPNext Supplier.
required_apps = ["frappe/erpnext"]

# The DocTypes name the committee roles in their permissions, so the roles are
# made before the first model sync rather than after it.
before_install = "supplier_qualification.setup.install.ensure_roles"
after_install = "supplier_qualification.setup.install.after_install"
after_migrate = "supplier_qualification.setup.install.ensure_roles"
