# Magic NetSuite SDF Deploy Tool

Companion exe that deploys NetSuite customizations from a JSON spec through
the SuiteCloud CLI (SDF): script records + deployments (structured spec) and
raw SDF objects such as custom record types and advanced PDF/HTML templates
(`objects` array). Redeploying the same IDs updates the existing objects.
Invoked automatically by the Magic NetSuite MCP server for the
`netsuite_sdf_deploy` tool.

- The reusable SDF project self-scaffolds in `sdf-project/` beside this exe.
- Account -> SuiteCloud authid mapping is cached in `accounts.json`. Unknown
  accounts trigger an interactive `suitecloud account:setup` browser login.
- Requires a JDK (17+) on PATH â€” the SuiteCloud CLI SDK is a Java jar.
- The SuiteCloud SDK jar is downloaded to `%USERPROFILE%\.suitecloud-sdk` on
  first use if missing.

Manual usage:
`sdfDeploy.exe deploy <spec.json|->` | `cleanup <scriptId> [--inactivate]` | `list` | `resolve-account <accountId>` | `list-objects --account <id> [--type <t...>] [--scriptid <id>]` | `import-object --account <id> --type <t> --scriptid <id...> [--no-template]`

Object import/update workflow (objects only, not scripts): `list-objects` to
discover -> `import-object` returns the object's SDF xml -> edit it -> `deploy`
with an objects[] entry using the same scriptid to update it on the account.
