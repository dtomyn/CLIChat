---
name: dev-pack
title: Developer workflow
emoji: 👩‍💻
description: The program's test-first developer workflow: read the Azure DevOps story and the technical design (TDD) section, write the unit tests first, follow the coding standards and branch naming, and write a pull request description that traces to the story (AB#id) and the design (TD-###), with the checks to run before asking for review.
extensions:
readTools: list_office_files, read_document, read_spreadsheet
writeTools: save_draft_document
---

# Developer workflow

Every change starts from an approved story and its technical design, is proven by tests written first, and arrives in a pull request that a reviewer can trace back to both. Follow the program standards in this pack's reference files, not personal preference.

Reference files (in this skill's folder):
- `references/coding-standards.md`: naming, structure, error handling, logging, security and tests
- `references/pr-template.md`: the pull request description to fill in
- `references/branch-naming.md`: branch and commit message rules

## 1. Read before you write
1. Read the story: its title, acceptance criteria and its Azure DevOps ID (`AB#1234`). If Azure DevOps tools are connected, read the work item; otherwise ask for the acceptance criteria. **Never guess an acceptance criterion.**
2. Find the technical design section it implements (`TD-###` in the TDD, for example `Knowledge/Technical Design - Permit Renewal.md`). Note the components, endpoints, data and rules it names.
3. List what is unclear as questions for the story owner before writing code.

## 2. Tests first
1. Turn each acceptance criterion into at least one unit test (positive, negative and boundary where it applies). Name tests after the behaviour: `rejects_photo_older_than_6_months`.
2. Put the story and design IDs in the test name or a comment (`// AB#1234 TD-105`) so coverage can be traced.
3. Run the tests and confirm they **fail** for the right reason before writing the code.

## 3. Code to the standards
Make the tests pass with the smallest change, then tidy up. Follow `references/coding-standards.md`. Keep secrets out of code and config (Key Vault or the platform's secret store). Don't change behaviour the story didn't ask for.

## 4. Branch, commit and pull request
1. Branch and commit as `references/branch-naming.md` says (for example `feature/AB1234-photo-age-rule`, commits mention `AB#1234`).
2. Write the pull request description from `references/pr-template.md`: what and why, `AB#<id>` and the `TD-###` sections, the tests added, how it was verified, risks and rollback. When asked to save it, use `save_draft_document`.

## 5. Before you ask for review
- All tests pass locally, including the new ones, and the build has no new warnings.
- Every acceptance criterion maps to a test (list the mapping in the PR).
- No secrets, personal data or debug code in the change. Logs don't contain personal data.
- The PR links the story (`AB#<id>`) and names the design sections (`TD-###`). If the code differs from the TDD, say so and raise it with the designer; don't silently diverge.
