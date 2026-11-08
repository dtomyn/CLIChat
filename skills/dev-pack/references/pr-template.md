# Pull request template

Copy this into the pull request description (or save it as `.github/pull_request_template.md`).

```markdown
## What and why
<One or two sentences: what changes and the business reason.>

## Traceability
- Story: AB#<id> <story title>
- Design: TD-### <section title> (link to the TDD section)
- Requirements: BR-### / FD-### (if the story names them)

## Acceptance criteria → tests
| Acceptance criterion | Test |
|---|---|
| <criterion 1> | <test name> |

## How it was verified
- [ ] Unit tests added first and passing
- [ ] Ran locally against <environment or mock>
- [ ] Screenshots or output attached (UI or API changes)

## Risks and rollback
<What could go wrong, who is affected, and how to roll back (revert, feature flag, config).>

## Checklist
- [ ] Follows the coding standards
- [ ] No secrets, personal data or debug code
- [ ] Config changes listed for every environment (STE, UAT, PRD)
- [ ] Differences from the TDD raised with the designer
```
