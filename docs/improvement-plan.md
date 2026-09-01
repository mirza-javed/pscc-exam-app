# PSCC Exam App: mobile-first improvement plan

## Goal

Make the PSCC Exam App fast, clear, and dependable for staff using phones while preserving efficient desktop workflows for bulk work and analytics.

## Step 1 — Fix the essential mobile workflows

**Focus:** navigation, marks entry, and safe submission. These changes should be implemented first because they affect the most frequent and highest-risk staff task.

### 1.1 Simplify primary navigation

- Replace the three wide top-level tabs and nested report tabs with separate primary screens:
  - **Home**
  - **Enter marks**
  - **Reports**
  - **More**
- Keep the Streamlit sidebar for desktop and secondary controls. On phones, use it only as a compact drawer.
- Do not put nested tabs inside the Reports screen. Use clearly labelled sections or distinct routes instead.

### 1.2 Build a phone-first marks-entry experience

- Keep the existing data editor as an optional **Desktop grid / bulk mode**.
- Create a default **Mobile entry mode** with one cadet per row or card:
  - Cadet name and kit number
  - Large numeric marks input
  - Visible maximum marks
  - An **Absent** control
  - Clear entered / missing status
- Use the numeric keyboard for marks fields and move focus to the next cadet after entry where possible.
- Add shortcut actions such as **Mark all present** and a quick absent control.

### 1.3 Use progressive filters

- Present filters in this order, one per row on mobile:
  1. Examination
  2. Grade
  3. Section
  4. Subject
- Reveal or update each next choice only after its dependency is selected.
- Retain the current exam/class/subject selections when staff move between screens.

### 1.4 Make saving clear and safe

- Add a persistent action bar during marks entry showing:
  - `Entered: 12 of 24`
  - unsaved-change status
  - a full-width **Save marks** button
- Validate marks against the subject maximum before saving.
- Show errors beside the affected cadet and place focus on the first invalid entry.
- Add a review/confirmation step before committing a complete class.
- Replace balloons and duplicate confirmations with one success toast and a saved timestamp.

### Step 1 success criteria

- A teacher can select a class and enter/save a full set of marks on a 375px-wide phone without horizontal page scrolling.
- Every tap target is at least 44px high.
- Invalid marks cannot be saved without clear recovery guidance.
- Unsaved work is visibly indicated.

## Step 2 — Improve clarity, reporting, and visual consistency

**Focus:** reduce cognitive load, make reports usable on small screens, and strengthen the visual system.

### 2.1 Create a role-aware home screen

- Teachers should see **Continue marks entry**, assigned classes, and pending work.
- Examination staff should see class completion, recent submissions, exceptions, and quick report actions.
- Keep the initial view concise; put detailed analytics behind a clear **View details** action.

### 2.2 Rework mobile analytics

- Show a short summary first: class average, pass rate, absences, and cadets needing support.
- Display Top 3 and support-needed cadets as compact ranked cards or lists.
- Place the merit table behind an expandable **View full merit list** section and provide download as an alternative.
- Use horizontal charts on small screens with fewer labels; avoid charts that require zooming or rotated text.

### 2.3 Simplify reporting and result cards

- Turn the four-column result-card selector into a guided vertical form:
  1. Grade
  2. Section
  3. Cadet
  4. Exam term
- Add cadet search by name or kit number rather than relying only on long dropdowns.
- Stack report actions on mobile: **Download Excel report**, then **Download printable report**.
- Use the actual report-generation date instead of a hard-coded date.

### 2.4 Refine the visual language

- Use Material Symbols for navigation and action icons instead of emojis.
- Replace the large hero banner on phones with a compact app bar showing the college name, role, and profile/menu action.
- Use consistent 8px-based spacing: 8, 16, 24, and 32px.
- Prefer card grouping and clear headings over repeated heavy dividers.
- Use task-led labels in sentence case, such as **Save marks** and **Download Excel report**.
- Keep one primary action per screen; visually subordinate secondary actions.

### 2.5 Make theming robust and accessible

- Replace broad CSS selectors such as `.stApp *` with targeted styles and semantic theme tokens.
- Ensure the result-card HTML has dedicated light and dark theme styles rather than hard-coded light colours.
- Verify normal text contrast at 4.5:1 or better in both themes.
- Preserve visible keyboard focus states and do not use colour as the only status indicator.

### Step 2 success criteria

- All core filters and report actions remain readable and operable at phone width.
- Light and dark modes have consistent surfaces, text, borders, and interaction states.
- A staff member can find a cadet’s result card in under 30 seconds.

## Step 3 — Add reliability and mobile-app readiness

**Focus:** improve resilience on unreliable networks and make the app feel trustworthy when installed or used on a phone.

### 3.1 Complete PWA readiness

- Add the referenced `icon-192.png` and `icon-512.png` assets.
- Add install guidance and validate the web-app manifest.
- Add a service worker and a useful offline/poor-connection fallback if installation is a product goal.

### 3.2 Improve network and data reliability

- Provide loading skeletons for data that takes longer than a moment to load.
- Provide a clear retry action if Google Sheets cannot be reached.
- Preserve draft marks locally during an interrupted connection or accidental refresh.
- Add visible save audit details: staff member, timestamp, class, subject, and number of records saved.
- Offer a correction or undo path for recent submissions, subject to role permissions.

### 3.3 Strengthen accessibility and quality assurance

- Test with large system text, reduced motion, keyboard navigation, and screen readers.
- Ensure all controls have descriptive visible labels or accessibility labels.
- Test phone widths at 375px and 430px, plus tablet and landscape layouts.
- Verify no important content sits behind fixed headers, action bars, or device safe areas.
- Add mobile workflow tests for entering marks, saving, generating a report, and handling a failed network request.

### Step 3 success criteria

- The app gives staff a clear recovery path for failed loads and failed saves.
- The PWA manifest and icon assets load without broken references.
- Core workflows work at small-phone, large-phone, tablet, and landscape sizes.

## Suggested delivery order

1. Mobile marks-entry flow, progressive filters, and persistent save/progress bar.
2. Primary-screen navigation and report-card selection flow.
3. Role-aware home screen and mobile analytics summary.
4. Theme/CSS cleanup and accessibility pass.
5. PWA assets, offline handling, audit trail, and automated mobile checks.

## Acceptance checklist

- [ ] No horizontal page scrolling on small phones.
- [ ] All primary interactions have 44px or larger tap targets.
- [ ] Desktop grid and bulk upload remain available for power users.
- [ ] Mobile mark entry is list-based and supports numeric marks plus absence.
- [ ] Filters follow a clear dependency order.
- [ ] Save feedback is concise, auditable, and recoverable.
- [ ] Result cards, analytics, and downloads work without cramped multi-column layouts.
- [ ] Light and dark themes meet accessibility contrast requirements.
- [ ] PWA assets and offline/slow-network behaviour have been verified.
