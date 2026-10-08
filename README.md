# Supplier Qualification

Supplier and contractor qualification portal on Frappe / ERPNext v15.

An applicant picks a track (construction contractor, O&M contractor, general
supplier), signs in with a one-time code sent to the organisation's email, fills
the track's form, uploads its documents and receives a reference number. The
committee reviews the application, an approver decides, and a qualified
applicant becomes an ERPNext `Supplier`.

## Install

    bench get-app https://github.com/hh2000h4000/qualification-application
    bench --site your-site install-app supplier_qualification
    bench build --app supplier_qualification
    bench restart        # or stop and start `bench start` on a development bench

The install seeds the supply categories and each track's required documents;
both are edited afterwards in **Qualification Settings**.

## Set up

1. **Outgoing email.** Add an Email Account with *Enable Outgoing* and *Default
   Outgoing*. Until one exists the verification code is written to
   `logs/supplier_qualification.log` instead of being sent, so the portal can be
   tried but not used.
2. **The committee.** In the *Supplier Qualification* workspace open *Committee
   and Permissions* and add each person as a Qualification Committee Member:
   - *Can Approve* off: a **reviewer**, who evaluates an application and passes it on.
   - *Can Approve* on: an **approver**, who reads the reviews and decides.

   A committee of one approver is a manager deciding alone. With reviewers, an
   application reaches the approvers once every reviewer has evaluated it, unless
   *Approver May Decide Before Reviews Are Complete* is switched on in the settings.

## Pages

| Page | Who | What |
|---|---|---|
| `/qualification` | applicants (no account) | apply, upload documents, follow their applications |
| `/qualification_committee` | committee members (ERPNext users) | review, decide |
| *Supplier Qualification* workspace | administrators | applications, committee, settings |

## Development

    bench --site test-site run-tests --app supplier_qualification

The scripts in `scripts/` are the author's own loop for a Windows tree mirrored
into WSL; they assume that layout and are not needed to run the app.
