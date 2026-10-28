# Relaxed for testing

Things that the PRD / CLAUDE.md say are required, but that are deliberately **not enforced** while the project is being built, so flows can be tested without extra steps. Each one is switched by an `.env` flag. **Before going live, set the flags to `true` and re-test.**

Owner instruction, 2026-10-10: "keep nothing required for now; tell me this list when the project is complete."

| Flag in `.env` | What it enforces when `true` | Used from | Status |
|---|---|---|---|
| `REQUIRE_VERIFICATION_DOCUMENTS` | Doctor, hospital and vendor registration must include their certificates / license documents | Phase 1 (doctor), Phase 2 (hospital), Phase 3 (vendor) | `false` (relaxed) |

## Log of relaxations made
- 2026-10-12 — **Doctor registration and resubmission** now read `REQUIRE_VERIFICATION_DOCUMENTS`: with `false` a doctor can register with no certificate at all. With `true` at least one document is required (`422` on `documents`). The upload form itself always shows the file fields. Hospital and vendor registration will use the same flag in Phase 2 / 3.
- 2026-10-10 — Flag `REQUIRE_VERIFICATION_DOCUMENTS` added to `.env` and `.env.example`. No form uses it yet. File type and size checks still apply whenever a file *is* uploaded.
- 2026-10-24 — **Hospital invitation page and resubmission** now read `REQUIRE_VERIFICATION_DOCUMENTS`: with `false` a hospital admin can apply with no license or registration document. With `true` at least one is required (and a resubmitted application must have at least one in total).
