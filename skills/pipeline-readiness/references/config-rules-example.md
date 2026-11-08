# Config rules file

`compare_configs` reads a rules file that says which settings are expected to differ between environments. With a rules file, every setting not listed as env-specific must match in every environment.

## Markdown table (recommended)
| Key | Rule |
|---|---|
| API_BASE_URL | env-specific |
| DB_HOST | env-specific |
| LOG_LEVEL | env-specific |
| replicas | env-specific |
| FEATURE_* | must-match |
| BUILD_TIMESTAMP | ignore |
| DEBUG_TOOLS_ENABLED | optional |

## Rules
| Rule | Meaning |
|---|---|
| `env-specific` | Values are expected to differ (host names, URLs, sizes). Still reported if missing |
| `must-match` | Must be the same everywhere (the default for unlisted keys when a rules file is given) |
| `optional` | May be missing in some environments |
| `ignore` | Not compared at all |

## Keys
- A key without dots (`replicas`) matches that setting anywhere, including inside YAML (`Deployment/permit-api.spec.replicas`).
- `*` is a wildcard: `FEATURE_*`, `Deployment/*.spec.replicas`.
- The most specific pattern wins (exact before wildcard, longer before shorter).

## Other formats
- Lines: `DB_HOST: env-specific` or `- DB_HOST — env-specific`.
- JSON: `{ "envSpecific": ["DB_HOST", "API_BASE_URL"], "ignore": ["BUILD_TIMESTAMP"], "optional": [] }`.

Image tags and versions (`image`, `*_VERSION`, `tag`) are always reported as drift (unless the key is set to `ignore`), so a release manager sees what runs where.
