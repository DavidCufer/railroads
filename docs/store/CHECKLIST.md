# Owner checklist — publishing Iron & Steam on Google Play

Steps only you can do. Everything the repo can prepare is in `docs/store/`. Never put the keystore or its
passwords in the repo, in chat, or in an issue.

## 1. Developer account
1. Go to <https://play.google.com/console> and sign up with your Google account. One-time fee (about $25).
2. Verify your identity as Google asks. A personal account needs a phone and an address, and (for accounts made
   after Nov 2023) must run a closed test (step 6) before applying for production.

## 2. Upload keystore and the four GitHub secrets
1. On your computer, follow "Signed release builds" in the README to make `release.keystore.jks`.
   Use alias `ironandsteam`. Keep the file and both passwords in a password manager, and a backup copy.
2. In GitHub: Settings → Secrets and variables → Actions → add `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
   `KEY_ALIAS`, `KEY_PASSWORD` (values as the README table says).
3. Delete the local `.jks` from any folder that is a git repo.

## 3. Build the bundle
1. GitHub → Actions → "Release" → Run workflow (on `main`, after the orchestrator has merged Phase 71).
2. When it finishes, download the artifact `app-release-aab` (the `.aab`). If the secrets are missing it still builds,
   but unsigned; Play will not take that one.

## 4. Create the app
1. Play Console → Create app. Name: **Iron & Steam**. Default language English. App (not a website). **Game**.
   Free. Accept the declarations.
2. Package name is fixed by the first upload: `com.davidc.ironandsteam`.

## 5. Play App Signing
1. Release → Setup → App signing: choose "Use Play App Signing" (the default). Your keystore becomes the *upload* key
   and Google holds the real signing key.

## 6. Closed test (needed for new personal accounts)
1. Testing → Closed testing → Create track → create the release and upload the `.aab`. Release notes: copy from
   `listing.md`.
2. Add testers: a Google Group or an e-mail list, at least **12 testers**. They must all opt in with the link Play shows
   (Testers tab → "Copy link") and stay opted in for **14 days in a row**.
3. After 14 days, "Apply for production" becomes available (step 10).

## 7. Store listing (Grow → Store presence → Main store listing)
- App name, short description, full description: copy from `docs/store/listing.md`.
- App icon: `docs/store/icon-512.png`. Feature graphic: `docs/store/feature-graphic.png`.
- Phone screenshots: all `docs/store/screenshots/phone-*.png`. 7-inch/10-inch tablet: `tablet10-*.png`.
- Category: Games → Simulation. Contact e-mail (public): yours. Tags: from `listing.md`.

## 8. App content forms (Policy → App content)
- **Privacy policy:** paste the public URL (step 9).
- **Ads:** No, the app contains no ads.
- **App access:** All functionality is available without special access (no login).
- **Content rating:** start the questionnaire, category "Game". Answer No to violence, sexual content, language,
  controlled substances, gambling, user interaction and location sharing. Expect a low rating (everyone / 3+).
- **Target audience:** 13 and older. (Not designed for children, so the Families policy does not apply.)
- **Data safety:** "No data collected" and "No data shared". The app does not collect or transmit anything.
- **News app / COVID / government / financial features:** No.

## 9. Host the privacy policy
Play needs a public web page, not a repo file path. Options:
1. GitHub Pages: repo Settings → Pages → deploy from a branch → put `privacy.md` content in `/docs/privacy.html` or use
   a `docs/` folder; URL will be `https://davidcufer.github.io/railroads/privacy`. (Easiest.)
2. A public GitHub Gist of the text (use the raw/"Gist" page URL).
3. A page on any site you own.
Before publishing, replace `OWNER-EMAIL-PLACEHOLDER` in `privacy.md` with your real contact address.

## 10. Apply for production
After the 14-day closed test: Production → Create release (reuse the bundle, bump nothing unless it changed) →
Apply for production → answer the short questionnaire about the test. Review usually takes a few days.

## Bumping the version later
Edit `version` in `package.json` (and `APP_VERSION` in `src/data/app.ts`; a test keeps them equal). versionCode is
derived (1.0.0 → 10000, 1.0.1 → 10001), so every upload needs a higher version.

## Notes
- Saves live per app ID. This is the first Play release, so there are no earlier player saves to carry over.
- Release builds can't expose `window.__game` or the debug HUD (the app URL has no query string), and WebView
  debugging is off (`capacitor.config.ts`).
