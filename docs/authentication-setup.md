# Google Sign-In setup

The Next.js Exam Portal uses Auth.js with Google Sign-In. Staff may use personal Google accounts. Google verifies the email address; the server then requires exactly one matching row in the `Staff_Directory` sheet. Matching ignores only surrounding spaces and email letter case. There is no domain allowlist, and a manually entered email or Staff ID never grants access.

1. In Google Auth Platform, set the app audience to **External** so personal Gmail accounts can use it. If the publishing status is **Testing**, add each teacher's Google email under **Test users** as well. Google's test-user list and the app's `Staff_Directory` approval list are separate checks. If the app is published **In production**, the test-user list is not required for basic sign-in.
2. Create an OAuth client of type **Web application** in that same Google Cloud project. Add `http://localhost:3000/api/auth/callback/google` for local development and `https://YOUR_APP_DOMAIN/api/auth/callback/google` for production as authorized redirect URIs. The URI must match the browser's app URL exactly, including the port. This is a user OAuth client; the Sheets service account is not a substitute.
3. Set the OAuth client's **Client ID** as `AUTH_GOOGLE_ID` and its **Client secret** as `AUTH_GOOGLE_SECRET` in local `.env.local` and the deployment environment. Also set a long random `AUTH_SECRET`. Keep these out of Git and restart the Next.js server after changing `.env.local`. The existing Google Sheets service-account credentials are still required for backend staff-directory reads.
   Vercel is recognized by Auth.js automatically. For a self-hosted production server behind a trusted reverse proxy, also set `AUTH_TRUST_HOST=true`.
4. The `Staff_Directory` sheet must have an `Email` column and an `Active` column containing `TRUE` or `FALSE`. Only `Active = TRUE` grants access. Missing or blank values, other values, and duplicate email rows are denied. The `Status` column is not used for authentication.

The Auth.js session expires after eight hours. Each protected API request rereads the staff directory, so disabling a staff row denies its next request. Roles and permissions are calculated on the server from the current staff row and teaching assignments. The browser retains only the theme preference between visits.

If Google shows **401 `invalid_client`**, check that `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` come from the same Web application OAuth client and are present in the environment of the running Next.js server. Restart the server after adding them. If Google shows **403 `access_denied`** while the app is in Testing mode, check the Google Auth Platform test-user list. A later app-level denial means the verified email lacks a unique `Active = TRUE` row in `Staff_Directory`.

This setup applies to the repository's single supported application: the Next.js deployment. The retired Streamlit entry point has been removed.
