# Aeio — Release & Code-Signing Guide

This document describes the manual steps required to configure production signing, notarization, and automated GitHub Actions release builds for Aeio.

---

## 1. Secrets Reference & Generation

All signing credentials and private keys must be stored in your GitHub repository secrets (**Settings → Secrets and variables → Actions**). Never commit these values into source control.

| Secret Name | Description | Platform | Official Documentation |
| :--- | :--- | :--- | :--- |
| `APPLE_SIGNING_IDENTITY` | Full name of Apple Developer ID Certificate (e.g. `Developer ID Application: Your Name (TEAM_ID)`) | macOS | [Apple Developer Certificates](https://developer.apple.com/support/certificates/) |
| `APPLE_ID` | Your Apple Developer account email address | macOS | [Apple ID Portal](https://appleid.apple.com/) |
| `APPLE_PASSWORD` | App-specific password generated for notarization | macOS | [Sign in with App-Specific Passwords](https://support.apple.com/en-us/102654) |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID | macOS | [Locate your Team ID](https://developer.apple.com/help/account/manage-your-team/locate-your-team-id/) |
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` code-signing certificate | Windows | [Microsoft SignTool Documentation](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool) |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password protecting the `.pfx` certificate file | Windows | [Microsoft Certificate Export](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/exporting-a-test-certificate) |
| `TAURI_SIGNING_PRIVATE_KEY` | Private signing key generated for secure updates | All | [Tauri Updater Signing Guide](https://v2.tauri.app/plugin/updater/) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password protecting the Tauri private key | All | [Tauri Updater Configuration](https://v2.tauri.app/plugin/updater/) |

---

## 2. Generating the Tauri Updater Keypair

The built-in auto-updater verifies release binaries using minisign keypairs.

1. In your local terminal, install and run the Tauri CLI signer generator:
   ```bash
   npx @tauri-apps/cli signer generate -w ~/.tauri/aeio.key
   ```
2. The command will output:
   - A **public key** string (e.g. `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk...`)
   - A path to your **private key** (`~/.tauri/aeio.key`)
3. Copy the **public key** into `src-tauri/tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "<PASTE_YOUR_PUBLIC_KEY_HERE>",
       "endpoints": [
         "https://your-domain.com/downloads/latest.json"
       ]
     }
   }
   ```
4. Read your private key file and store its contents as the GitHub secret:
   ```bash
   cat ~/.tauri/aeio.key
   ```
   Save this as `TAURI_SIGNING_PRIVATE_KEY` in GitHub repo secrets.

---

## 3. Adding Secrets to GitHub Repository

1. Navigate to your repository on GitHub: `https://github.com/jaggureddy11/aeio`.
2. Click **Settings** → **Secrets and variables** → **Actions**.
3. Under **Repository secrets**, click **New repository secret**.
4. Add each secret listed in Section 1.

---

## 4. Triggering an Automated Signed Release

Once secrets and the updater public key are in place:

1. Update the version string in `package.json` and `src-tauri/tauri.conf.json` (e.g. `0.1.0`).
2. Commit and tag the release:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. GitHub Actions will launch `.github/workflows/release.yml`, executing parallel runners:
   - `macos-latest`: Builds universal Apple Silicon & Intel `.dmg` installer, signs with `APPLE_SIGNING_IDENTITY`, notarizes via `altool`/`notarytool`, and staples the ticket.
   - `windows-latest`: Builds signed `.msi` Windows installer.
4. The signed installers will be uploaded directly as assets to GitHub Releases under draft mode for your final check.

---

## 5. Post-Download Signature Verification

After downloading the generated release assets on a clean machine:

### macOS (`.app` / `.dmg`)
Run the macOS code-signing validation utility:
```bash
codesign -dv --verbose=4 /Applications/Aeio.app
```
Confirm:
- `Authority=Developer ID Application: Your Name (TEAM_ID)`
- `Authority=Developer ID Certification Authority`
- `Authority=Apple Root CA`
- `TeamIdentifier=YOUR_TEAM_ID`
- `Sealed Resources=version 2 rules...`

Check Gatekeeper notarization status:
```bash
spctl --assess --type execute --verbose /Applications/Aeio.app
# Should report: /Applications/Aeio.app: accepted, source=Notarized Developer ID
```

### Windows (`.msi`)
Verify the Authenticode signature using `signtool`:
```cmd
signtool verify /pa /v Aeio.msi
```
Confirm:
- `Successfully verified: Aeio.msi`
- `Signer Certificate: Your Company / Publisher`
