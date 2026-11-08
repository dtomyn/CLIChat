# Branch naming and commits

## Branches
| Kind | Pattern | Example |
|---|---|---|
| Feature (a story) | `feature/AB<id>-<short-description>` | `feature/AB1234-photo-age-rule` |
| Bug fix | `bugfix/AB<id>-<short-description>` | `bugfix/AB1207-payment-timeout` |
| Hotfix to production | `hotfix/AB<id>-<short-description>` | `hotfix/AB1251-renewal-email` |
| Release | `release/<version>` | `release/1.4.0` |

- Lower case, words joined with hyphens, under 50 characters.
- Branch from `main` (hotfixes from the release tag) and keep it short-lived: merge within a sprint.

## Commits
- First line under 72 characters, in the imperative: `Reject photos older than 6 months`.
- Mention the work item so Azure DevOps links it: `Reject photos older than 6 months AB#1234`.
- One logical change per commit. Don't mix formatting with behaviour changes.

## Merging
- Pull request into `main` with at least one reviewer and a passing build.
- Squash merge; the squash message keeps the `AB#<id>`.
