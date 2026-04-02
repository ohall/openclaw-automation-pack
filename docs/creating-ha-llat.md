# How to Create a Home Assistant Long-Lived Access Token (LLAT)

A Long-Lived Access Token (LLAT) is a personal access token that allows external scripts and applications to interact with your Home Assistant instance via the REST API without requiring your username and password.

## Why Use LLATs?

- **Security:** More secure than storing passwords in plaintext
- **Revocable:** Can be easily revoked without changing your password
- **Scoped:** Can be given specific permissions (though most HA tokens have full access)
- **No expiration:** Unlike session tokens, LLATs don't expire (unless manually revoked)

## Steps to Create a LLAT

### 1. Open Your Home Assistant Web UI

Navigate to your Home Assistant instance in a web browser (e.g., `http://homeassistant.local:8123`).

### 2. Go to Your Profile

Click on your username/profile picture in the bottom-left corner of the sidebar.

### 3. Create Token

Scroll down to the **"Long-lived access tokens"** section and click **"CREATE TOKEN"**.

### 4. Name Your Token

Give your token a descriptive name that indicates its purpose, for example:
- `OpenClaw Automation Pack`
- `HA API for scripts`
- `HACS updater`

**Note:** The name helps you identify the token later if you need to revoke it.

### 5. Copy the Token

**IMPORTANT:** Copy the token immediately after creation. Home Assistant will only show it once. If you lose it, you'll need to create a new token.

### 6. Store the Token Securely

Create an environment file to store your token:

```bash
# Create the directory if it doesn't exist
mkdir -p ~/.openclaw/credentials

# Create or edit the environment file
nano ~/.openclaw/credentials/homeassistant-api.env
```

Add your credentials:
```bash
HA_BASE_URL=http://homeassistant.local:8123
HA_LONG_LIVED_ACCESS_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

### 7. Set File Permissions (Recommended)

Restrict access to the file to protect your token:
```bash
chmod 600 ~/.openclaw/credentials/homeassistant-api.env
```

## Alternative: Use a .env File

You can also create a `.env` file in the current working directory of the automation pack:

```bash
echo "HA_BASE_URL=http://homeassistant.local:8123" > .env
echo "HA_LONG_LIVED_ACCESS_TOKEN=your_token_here" >> .env
chmod 600 .env
```

The scripts will check for `.env` in the current directory if the default path doesn't exist.

## Testing Your Token

Use a simple curl command to verify your token works:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  http://homeassistant.local:8123/api/
```

You should see a JSON response like:
```json
{"message": "API running."}
```

Or test with one of the included scripts:
```bash
node scripts/ha-scan-update-entities.mjs --help
```

## Security Best Practices

1. **Never commit tokens to version control** - The `.gitignore` excludes `.env` files
2. **Use minimal permissions** - While HA tokens typically have full access, be mindful of what your scripts can do
3. **Regularly audit tokens** - Periodically review and revoke unused tokens from your HA profile
4. **Store tokens securely** - Use file permissions and avoid sharing token files
5. **Rotate tokens annually** - Consider creating new tokens periodically for critical applications

## Troubleshooting

### Token doesn't work
- Verify the token was copied correctly (no extra spaces or characters)
- Check that the HA_BASE_URL is correct and accessible
- Ensure your HA instance is running and the API is enabled

### "Unauthorized" error
- The token may have been revoked from your HA profile
- Check if the token still exists in your profile's token list

### Connection refused
- Verify your HA_BASE_URL (include port 8123 if needed)
- Check if your HA instance is accessible from the machine running the scripts

## Revoking a Token

If you need to revoke a token (e.g., if it's compromised or no longer needed):

1. Go to your HA profile
2. Scroll to "Long-lived access tokens"
3. Find the token by name and click the trash icon
4. Confirm deletion

The token will be immediately invalidated.

---

**Next:** Read about [Safety and Rollback Procedures](../docs/safety-rollback.md) for using these automation scripts.