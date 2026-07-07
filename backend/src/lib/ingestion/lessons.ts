/**
 * Transferable decomposition rules distilled from the 5 hand-mapped GOLD forms
 * (spec Part 2.3). Inlined as committed constants so the ingestion prompts
 * reproduce the gold decomposition style on novel uploads.
 */
export const GOLD_LESSONS = `DECOMPOSITION RULES (learned from 5 hand-built gold forms — follow exactly):

A. ONE STEP PER PRINTED SECTION. Each grey "STEP N. ___" banner (or a clearly
   numbered/titled section) is one wizard step. Use the banner text verbatim as
   the step label. Never split or merge a printed section. If a PDF has no
   banners, segment by major headings.

B. CHOOSE-ONE CHECKBOX GRID → ONE QUESTION. A row/grid of mutually-exclusive
   checkboxes (e.g. "Type of Account": Individual / Joint / Trust / LLC / ...)
   becomes ONE single-choice-cards question whose options each carry the right
   pdfField. Never emit one question per checkbox.

C. MASTER SELECTOR REVEALS CLUSTERS. The account/ownership-type selector gates
   downstream questions and steps. Encode with showIf on dependent questions and
   requiredIf on dependent steps (e.g. entity tax-form only for LLC/Corp/Trust;
   trust details only for trust).

D. ENTITY / JOINT / TRUST ⇒ A SECONDARY-HOLDER STEP. When the type implies more
   than one party, model a separate step (or repeat block) for the additional
   holder/owner — required only on those paths.

E. CANONICAL IDENTITY/FINANCIAL FIELDS ARE REUSED. Tag SSN/EIN, full name,
   email, date of birth, phones, legal/mailing address parts, entity name, and
   account registration type with canonicalField so they auto-fill across forms.

F. "OTHER" / YES-NO REVEAL DETAIL. An "Other (describe)" option reveals a
   free-text follow-up; a Yes/No gate reveals its detail sub-fields (showIf).

G. REPEATED ROW BLOCKS → REPEAT BLOCK. Identical repeating rows (beneficial
   owners, gifts, multiple holders) become one repeat-block with maxItems.

H. PER-ITEM MATRIX → COMPOSITE. A labeled cluster (address = street/city/
   state/zip/country; signature = signature/printed-name/date; phones =
   home/business/mobile) becomes one composite question with subFields.

I. DERIVED TOTALS ARE NOT QUESTIONS. Section subtotals/totals are computed, not
   asked.

J. REFERENCE / NARRATIVE TEXT IS NOT A QUESTION. Long legal/eligibility prose
   (e.g. lists of investor categories) produces ZERO questions — only the
   actual fillable acknowledgements/inputs become questions.

K. PDF FIELD NAMES ARE OPAQUE. Map answers to AcroForm fields by label +
   position, never by the meaningless field name; repeated suffixes (_2, _3)
   indicate instance ordering for repeat blocks.`;

/**
 * Compact structural digest of the 5 hand-built GOLD forms — the canonical
 * decomposition style to imitate (used as rolling context for page-by-page
 * ingestion of new forms).
 */
export const GOLD_FORMS_DIGEST = `GOLD FORM STRUCTURES (imitate this decomposition style):
1. Investor Profile (7 steps): Account Registration; USA PATRIOT Act source-of-funds; Primary Account Holder (kind→individual/entity, name, SSN/EIN, contact, address, employment, citizenship); Secondary Account Holder (required only for joint/trustee/entity-manager); Objectives & Investment Detail; Trusted Contact (decline→yes/no gates contact+address); Signatures (certs + account-owner + firm).
2. Statement of Financial Condition (2 steps): assets/liabilities composite table (totals are DERIVED, never asked); attestation + signature.
3. Brokerage Alt Investment Order/Disclosure (3 steps): order details; risk/suitability acknowledgements (all-required checklist); RMD Yes/No → conditional certification + conditional joint signer.
4. Brokerage Accredited Investor Verification 506(c) (2 steps): 17 investor-category NARRATIVE = ZERO questions; "confirm pre-filled identity" block + verifier attestation.
5. Investor Profile Additional Holder (2 steps): reuses the holder block for an additional party.
COMMON: one step per printed section; choose-one grids → one single-choice; entity/joint → secondary-holder step; SSN/EIN/address/email/DOB/registration-type are CANONICAL (reused across forms for auto-fill).`;
