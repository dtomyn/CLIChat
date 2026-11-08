# Release pipeline checklist

What `lint_pipeline` checks, and what a person still has to confirm.

## Checked from the YAML
- [ ] A stage (Azure Pipelines) or job (GitHub Actions) deploys to each environment in order: STE → UAT → PRD.
- [ ] The PRD deployment targets a named environment (`environment: permit-prd`), or has a manual validation step. That is where the approval gate lives.
- [ ] PRD depends on the UAT stage or job (`dependsOn` / `needs`), directly or through the chain; no empty `dependsOn: []`.
- [ ] Every Azure task has a major version (`AzureCLI@2`, not `AzureCLI`).
- [ ] Every GitHub action is pinned to a release tag or commit SHA (`actions/checkout@v4`), never a branch (`@main`).
- [ ] Container images have a fixed tag, not `:latest`.

## Confirm outside the YAML
- [ ] The PRD environment has approvals and checks (Azure DevOps › Environments › Approvals and checks) or required reviewers (GitHub › Settings › Environments).
- [ ] Secrets come from a variable group linked to Key Vault, or repository / environment secrets. None are written in the YAML.
- [ ] The same build artefact (image digest) is promoted through every environment; PRD is never built separately.
- [ ] Branch policies on `main`: a reviewer and a passing build before merge.

## Example (Azure Pipelines)
```yaml
- stage: DeployPRD
  dependsOn: DeployUAT
  jobs:
    - deployment: deploy_prd
      environment: permit-prd        # approvals and checks are set on this environment
      strategy:
        runOnce:
          deploy:
            steps:
              - task: AzureCLI@2
```
