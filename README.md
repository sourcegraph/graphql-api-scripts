# Sourcegraph Configuration Migration Scripts

This folder contains scripts to export and import Sourcegraph site configuration and code host configurations between instances.

## Prerequisites

- Node.js (v14 or later)
- Access token with site-admin privileges on both source and target Sourcegraph instances

## Usage

### Exporting Configuration

To export configuration from a Sourcegraph instance:

```bash
node export-config.js <sourcegraph-url> <access-token> <output-directory>
```

Example:
```bash
node export-config.js https://sourcegraph.example.com sg-token-12345 ./config-backup
```

This will create the following files in the output directory:
- `site-config.json` - The Sourcegraph site configuration
- `external-services.json` - All external service (code host) configurations
- `export-summary.json` - A summary of the export process

### Importing Configuration

**NOTE**: The exporting process does not include sensitive access tokens for code hosts or identity providers. After importing configurations, update the associated access token fields that specify `"NEEDS_UPDATING"`.

To import configuration to a Sourcegraph instance:

Manually copy and paste the contents of the `site-config.json` file into the edit field of the Sourcegraph instance. A limitation in the Sourcegraph GraphQL API prevents this from being done programmatically.

The commands below will import the external service configurations:

```bash
node import-config.js <target-sourcegraph-url> <access-token> <input-directory>
```

Example:
```bash
node import-config.js https://new-sourcegraph.example.com sg-token-67890 ./config-backup
```

This will:
1. Update the site configuration on the target instance
2. Add external service configurations that don't already exist
3. Create an import summary file

## Notes

- The import script skips external services with the same display name and kind to avoid duplicates
- Both scripts require site-admin privileges
- Configuration import may require a restart of the Sourcegraph instance to take effect

