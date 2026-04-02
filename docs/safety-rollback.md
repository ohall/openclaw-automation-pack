# Safety and Rollback Procedures

This document outlines safety practices and rollback procedures for using the OpenClaw Automation Pack scripts with Home Assistant.

## Core Safety Principles

### 1. Dry-Run First
Many scripts support a `--dry-run` flag that shows what would happen without making changes. Always use this first:

```bash
# Example with ha-disable-orphans.mjs
node scripts/ha-disable-orphans.mjs --dry-run
```

### 2. Explicit Confirmation
For destructive operations, use `--yes` or `--force` flags to confirm you understand the consequences:

```bash
# Will prompt or require --yes
node scripts/ha-disable-orphans.mjs --yes
```

### 3. Backup Before Changes
Critical operations that modify your HA configuration should create backups:

```bash
# Always backup before major changes
node scripts/ha-backup-config.mjs
```

## Rollback Strategies

### Immediate Undo (API-Based Changes)
Some operations can be immediately reversed through the API:

| Operation | Rollback Method |
|-----------|-----------------|
| Entity rename | Use `ha-entity-rename.mjs` to rename back |
| Entity disable | Edit entity in HA UI → Enable |
| HA restart | Wait for restart or manually restart |
| HACS update | Can't be undone via API (see backups) |

### Configuration Rollback (File-Based)
For configuration file changes:

1. **HA Snapshot:** Create a full snapshot before major changes
2. **File backups:** Use `ha-backup-config.mjs` (when available) for YAML files
3. **Git:** If using Git for configuration, commit before changes

## Script-Specific Safety

### ha-hacs-update.mjs
- **Safety:** Only triggers updates that are already available
- **Rollback:** Updates can't be undone, but you can restore from backup
- **Best practice:** Run `ha-scan-update-entities.mjs` first to see what will update

### ha-disable-orphans.mjs
- **Safety:** Defaults to dry-run mode
- **Rollback:** Disabled entities can be re-enabled in HA UI
- **Best practice:** Review the orphan list first, use allowlist/denylist

### ha-entity-rename.mjs
- **Safety:** Creates backup of original entity_id mappings
- **Rollback:** Script can rename back using backup file
- **Best practice:** Test with single entity first, verify automations still work

### ha-restart-and-wait.mjs
- **Safety:** Waits for HA to become healthy after restart
- **Rollback:** If restart fails, script exits with error
- **Best practice:** Check HA logs before restarting

## Emergency Procedures

### If a Script Fails Mid-Operation
1. **Check script output:** Look for error messages
2. **Verify HA state:** Check if HA is still accessible
3. **Review logs:** Check `ha-log-scan.sh` for errors
4. **Manual intervention:** Use HA UI to fix partial changes

### If HA Becomes Unresponsive
1. **Wait:** The `ha-restart-and-wait.mjs` script includes timeout logic
2. **Check network:** Verify HA instance is reachable
3. **Manual restart:** Use systemd/docker commands if needed
4. **Restore backup:** Use latest snapshot if necessary

## Pre-Flight Checklist

Before running any automation script:

- [ ] **Test connectivity:** `curl -f $HA_BASE_URL/api/`
- [ ] **Check token:** Verify token has correct permissions
- [ ] **Review changes:** Use `--dry-run` or `--verbose` flags
- [ ] **Create backup:** Snapshot or backup critical files
- [ ] **Schedule appropriately:** Avoid peak usage times
- [ ] **Monitor during execution:** Watch script output

## Monitoring and Validation

### After Script Execution
1. **Verify expected outcome:** Check that the intended change occurred
2. **Test functionality:** Ensure automations and entities still work
3. **Check logs:** Run `ha-log-scan.sh` for new errors
4. **Document:** Note what was changed and when

### Health Checks
```bash
# Quick health check
curl -s -H "Authorization: Bearer $HA_LONG_LIVED_ACCESS_TOKEN" \
  "$HA_BASE_URL/api/" | grep -q "API running" && echo "OK" || echo "FAILED"

# Check core health
curl -s -H "Authorization: Bearer $HA_LONG_LIVED_ACCESS_TOKEN" \
  "$HA_BASE_URL/api/hassio/core/info" | jq '.result' 2>/dev/null || echo "Unable to check"
```

## Best Practices for Automation

### 1. Start Small
- Test with a single entity or component first
- Gradually increase scope as confidence grows

### 2. Implement Monitoring
- Set up alerts for failed automation runs
- Monitor HA health after automated changes
- Log all automation activities

### 3. Regular Audits
- Periodically review what your automations are doing
- Check token usage and permissions
- Update scripts as HA APIs evolve

### 4. Documentation
- Keep a change log of automated modifications
- Document rollback procedures for each script
- Maintain an inventory of what's automated

## Common Pitfalls and Solutions

### API Rate Limiting
**Problem:** HA may rate-limit frequent API calls
**Solution:** Implement retry logic with exponential backoff

### Network Issues
**Problem:** Script fails due to temporary network problems
**Solution:** Add connection timeout and retry mechanisms

### HA Updates Breaking APIs
**Problem:** HA update changes API behavior
**Solution:** Test scripts after HA updates, implement version checking

### Token Expiry/Revocation
**Problem:** Token stops working (revoked or corrupted)
**Solution:** Regular token validation, automated alerts on auth failures

---

**Remember:** Automation should make your life easier, not create emergencies. When in doubt, run in dry-run mode first, and always have a rollback plan.

[Back to Creating HA LLATs](../docs/creating-ha-llat.md)