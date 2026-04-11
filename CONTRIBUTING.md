# Contributing to OpenClaw Automation Pack

Welcome! This document outlines conventions and safety rules for contributing scripts to this automation pack.

## Project Philosophy

This automation pack follows a pragmatic, safety-first approach:
- **Small, focused scripts:** Each script does one thing well
- **Safety by default:** Dry-run mode, explicit confirmation, backups
- **Real-world utility:** Scripts should solve actual problems in OpenClaw + HA setups
- **Gradual improvement:** Add small, real improvements over time

## Script Conventions

### File Structure and Naming

1. **File location:** All scripts go in the `scripts/` directory
2. **Naming convention:** `ha-<purpose>.mjs` for Home Assistant scripts
   - Examples: `ha-hacs-update.mjs`, `ha-disable-orphans.mjs`
3. **Shared utilities:** Prefix with underscore: `_env.mjs`, `_logger.mjs`, `_retry.mjs`
4. **Executable scripts:** Make shell scripts executable (`chmod +x`) and use `.sh` extension

### Code Style

1. **JavaScript/Node.js:**
   - Use ES modules (`import/export`)
   - Follow Prettier formatting (run `npm run format`)
   - Use async/await for asynchronous operations
   - Include JSDoc comments for public functions

2. **Shebang:** Start executable Node.js scripts with:
   ```javascript
   #!/usr/bin/env node
   ```

3. **Error handling:**
   - Use try/catch blocks for async operations
   - Exit with appropriate codes (see Exit Codes section)
   - Provide helpful error messages with remediation steps

### Command-Line Interface

All scripts should follow these conventions:

1. **Help text:** Include a `--help` flag with clear usage instructions
2. **Dry-run mode:** Support `--dry-run` for safe preview of changes
3. **JSON output:** Support `--json` flag for machine-readable output
4. **Explicit confirmation:** Require `--yes` or `--force` for destructive operations
5. **Verbose mode:** Support `--verbose` for detailed output

Example argument parsing structure:
```javascript
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--help') {
    printHelp();
    process.exit(0);
  } else if (arg === '--dry-run') {
    args.dryRun = true;
  }
  // ... handle other args
}
```

### Output and Logging

1. **Use the shared logger:** Import and use `_logger.mjs` for consistent output
2. **Progress indicators:** Show progress for long-running operations
3. **Success/failure clarity:** Clearly indicate whether operations succeeded
4. **Secret protection:** Never log or output credentials or tokens

### Exit Codes

Use these exit codes consistently:

| Code | Meaning | Usage |
|------|---------|-------|
| 0 | Success | Script completed successfully |
| 1 | General error | Unspecified failure |
| 2 | Invalid arguments | Missing or incorrect command-line arguments |
| 3 | Configuration error | Missing env vars, invalid credentials |
| 4 | API/network error | HA API unreachable or returned error |
| 5 | Operation failed | Specific operation (rename, update, etc.) failed |
| 6 | Dry-run mode | Script ran in dry-run mode (successful preview) |

### Environment Configuration

1. **Use the shared env loader:** Import `_env.mjs` for consistent environment loading
2. **Support multiple env sources:** Check both default location and `.env` in CWD
3. **Validate required variables:** Use `requireKeys()` to ensure necessary env vars exist
4. **Document required variables:** List required env vars in script help text

### Testing

1. **Write tests:** Add tests to the `test/` directory for new functionality
2. **Test argument parsing:** Verify CLI arguments are parsed correctly
3. **Test failure paths:** Ensure errors are handled gracefully
4. **Run tests:** Use `npm test` before submitting changes

## Safety Rules

### Core Safety Principles

1. **No silent destruction:** Scripts must not make destructive changes without explicit confirmation
2. **Backup before modification:** Create backups of critical data before making changes
3. **Graceful degradation:** Handle API failures, network issues, and partial failures
4. **Idempotency:** Where possible, scripts should be safe to run multiple times

### Required Safety Features

Every script that modifies HA state MUST include:

1. **Dry-run mode (`--dry-run`):** Show what would happen without making changes
2. **Explicit confirmation (`--yes` or `--force`):** Require flag for destructive operations
3. **Progress feedback:** Show what's happening during execution
4. **Error recovery:** Attempt to clean up or revert on failure when possible
5. **Validation:** Validate inputs and preconditions before making changes

### Security Guidelines

1. **Never hardcode credentials:** Use environment variables only
2. **Protect sensitive data:** Don't log or output tokens, passwords, or keys
3. **File permissions:** Set appropriate permissions on credential files (600)
4. **Input validation:** Validate and sanitize all inputs, especially entity IDs
5. **Rate limiting:** Implement respectful API usage with appropriate delays

### Rollback Considerations

When designing scripts, consider:

1. **What can go wrong?** Identify failure modes and plan recovery
2. **How to undo?** Document rollback procedures for each operation
3. **When to abort?** Define conditions that should trigger early exit
4. **What to backup?** Determine what data needs backup before changes

## Development Workflow

### Setting Up for Development

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd openclaw-automation-pack
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up testing environment:**
   ```bash
   cp .env.test .env
   # Edit .env with test credentials
   ```

### Making Changes

1. **Create a branch:**
   ```bash
   git checkout -b feature/description
   ```

2. **Implement changes:**
   - Follow script conventions above
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes:**
   ```bash
   npm run ci  # Runs formatting, linting, and tests
   ```

4. **Commit with descriptive message:**
   ```bash
   git commit -m "feat: add ha-new-script.mjs for specific purpose"
   ```

5. **Push and create pull request**

### Commit Message Convention

Use descriptive commit messages:
- `feat:` for new features/scripts
- `fix:` for bug fixes
- `docs:` for documentation changes
- `test:` for adding or updating tests
- `chore:` for maintenance tasks

Example: `feat: add ha-backup-config.mjs for pre-mutation backups`

### Code Review Checklist

Before submitting, ensure your script:

- [ ] Follows naming conventions
- [ ] Includes help text (`--help`)
- [ ] Supports dry-run mode
- [ ] Requires explicit confirmation for destructive changes
- [ ] Uses shared utilities (_env.mjs, _logger.mjs)
- [ ] Has appropriate error handling
- [ ] Includes tests for new functionality
- [ ] Updates documentation if needed
- [ ] Passes linting and formatting checks

## Adding New Scripts

### Template Structure

New scripts should follow this template:

```javascript
#!/usr/bin/env node

/**
 * Brief description of script purpose
 * 
 * More detailed explanation of what the script does,
 * why it's useful, and any important considerations.
 * 
 * Usage:
 *   node scripts/ha-new-script.mjs [options]
 */

import { loadEnvFile, requireKeys } from './_env.mjs';
import { logger } from './_logger.mjs';
import { withRetry } from './_retry.mjs';

function printHelp() {
  console.log(`Usage: node ha-new-script.mjs [options]

Options:
  --dry-run            Show what would be done without making changes
  --json               Output results in JSON format
  --yes                Required to proceed with destructive changes
  --help               Show this help message

Examples:
  node ha-new-script.mjs --dry-run
  node ha-new-script.mjs --json --yes
`);
}

async function main() {
  // Parse arguments
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  // Load environment
  const env = loadEnvFile();
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);
  
  // Implementation
  try {
    logger.info('Starting script...');
    
    if (args.dryRun) {
      logger.info('DRY RUN: No changes will be made');
      // Show what would be done
      process.exit(6); // Dry-run exit code
    }
    
    if (!args.yes && operationIsDestructive) {
      logger.error('Destructive operation requires --yes flag');
      process.exit(2);
    }
    
    // Main logic here
    
    logger.success('Script completed successfully');
  } catch (error) {
    logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--help') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--yes' || arg === '--force') {
      args.yes = true;
    }
  }
  return args;
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
```

### Testing New Scripts

1. **Unit tests:** Add tests to `test/` directory
2. **Integration testing:** Test with a real HA instance (use test credentials)
3. **Dry-run testing:** Verify dry-run mode works correctly
4. **Error testing:** Test failure scenarios and error handling
5. **Edge cases:** Test with unusual inputs and boundary conditions

## Maintenance and Updates

### Regular Maintenance Tasks

1. **Update dependencies:** Periodically run `npm update`
2. **Review scripts:** Ensure scripts still work with current HA versions
3. **Security audit:** Review credentials handling and security practices
4. **Documentation updates:** Keep docs current with script changes

### Breaking Changes

If you need to make breaking changes:

1. **Deprecate, don't remove:** Add deprecation warnings before removing features
2. **Provide migration path:** Document how to update existing usage
3. **Version appropriately:** Consider major version bump for breaking changes
4. **Communicate clearly:** Update changelog and documentation

## Getting Help

- **Check existing issues:** Search for similar issues or questions
- **Review documentation:** Read `README.md`, `docs/`, and this file
- **Ask for review:** Request code review before submitting major changes
- **Test thoroughly:** Always test in a safe environment before production use

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.

---

Thank you for contributing to making Home Assistant automation safer and more reliable!

[Back to README](../README.md)