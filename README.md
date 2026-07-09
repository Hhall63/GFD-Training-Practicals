# GFD Recruit Testing

A web app for Greensboro Fire Department to run practical skills tests on new recruits:
build reusable test templates (instructions, graded pass/fail steps, and timers with
pass/fail cutoffs), run them live against a recruit, capture photo evidence on any failed
step, and export results to a spreadsheet.

**Runs entirely free, forever** — no Apple/app store fee, no server to pay for or
maintain. It's a normal website that works from Safari/Chrome on any iPhone, iPad,
Android phone, or computer, and can be "installed" to a phone's Home Screen so it opens
full-screen like a real app. The trade-off from the original native-app plan: it needs an
internet connection to work (no offline mode) — camera photo capture for failed steps is
still fully supported.

This was built without access to a Mac, but that's no longer a constraint here — this
runs from any computer (Windows, Mac, Linux, Chromebook).

## What you need

- **Node.js** (free) — download from [nodejs.org](https://nodejs.org) if you don't have it.
- **A free Google account** — to create a Firebase project. Firebase is Google's
  free-tier backend service; it's what stores the recruits, tests, and results, and syncs
  them across every device, with no server for anyone to run or pay for.
- No credit card is required for the free ("Spark") plan this app uses.

## 1. Create your Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a
   new project (any name, e.g. "gfd-recruit-testing").
2. In the project, go to **Build → Authentication → Sign-in method** and enable the
   **Email/Password** provider.
3. Go to **Build → Firestore Database → Create database**. Choose **Production mode**
   and any nearby region.
4. Go to **Project settings** (gear icon) → scroll to **Your apps** → click the **Web**
   icon (`</>`) → register an app (any nickname) → copy the `firebaseConfig` values shown.

There's no Storage step — Google now requires the paid Blaze plan just to turn on
Firebase Storage, even though its usage quotas didn't change. To keep this app fully free
with no credit card, photos are compressed in the browser and stored directly in
Firestore instead (see `src/lib/image.js`). The trade-off is photos are downscaled rather
than full camera resolution — still clear enough to document a failed step.

## 2. Configure this project

```
cd web
npm install
cp .env.example .env
```
Paste the values you copied into `.env` (one per line, matching the variable names).

## 3. Try it locally

```
npm run dev
```
Open the URL it prints (usually `http://localhost:5173`). The very first time you open
it, you'll see a **Create the first administrator account** screen — there's no server
to seed one from. After that, sign in with the account you just created.

## 4. Deploy it for real (free, permanent hosting)

Install the Firebase command-line tool once:
```
npm install -g firebase-tools
firebase login
```
Then, from the `web` folder:
```
firebase use --add
```
Pick the Firebase project you created in Step 1. Then, whenever you want to publish (this
first time, and any time you make changes later):
```
npm run deploy
```
This builds the app and uploads it, along with the security rules in `firestore.rules`
(these are what keep the data private to logged-in admins only — make sure the first
`firebase deploy` includes them, which `npm run deploy` does automatically).

Firebase will print a URL like `https://gfd-recruit-testing.web.app` — that's the real,
permanent address for the app. Share that with your evaluators.

## 5. Put it on department iPhones/iPads

Open the URL in Safari, tap the **Share** button, then **Add to Home Screen**. It gets a
GFD badge icon and opens full-screen, just like an installed app — no App Store needed.

## Notes

- **Camera capture** needs a secure connection, which Firebase Hosting provides
  automatically (the deployed URL is always `https://`) — no extra setup needed.
- **No offline mode**: every screen needs a live connection to load and save data. If
  that becomes a problem later, it's a bigger rework (a different, paid architecture),
  not a quick toggle.
- **Photos live in Firestore, not Firebase Storage**: Storage now requires the paid
  Blaze plan to enable at all, so photos are downscaled/compressed to JPEG in the
  browser and stored as data URLs directly on the relevant Firestore document. This
  keeps everything on the free Spark plan with no credit card, at the cost of
  lower-resolution photos than the original camera capture.
- **Security rules**: `firestore.rules` restricts all reads/writes to signed-in, active
  admin accounts — nobody can see or change recruit data without logging in, even though
  the app's URL is public.

## Project layout

```
web/
  firebase.json, firestore.rules                   Firebase config + security rules
  .env.example                                     Copy to .env with your Firebase project's values
  src/
    firebase.js                                    Firebase SDK setup
    context/AuthContext.jsx                         Login/session state
    lib/                                            Shared constants, CSV export, timer logic, image compression
    components/                                     Shared UI (top bar, etc.)
    pages/
      LoginPage, SetupAdminPage, AdminsPage          Auth + admin account management
      HomePage                                       Test list (Home Screen)
      RecruitConfirmPage                             Pick + confirm the recruit being tested
      LiveTestRunnerPage                              The live test itself
      ResultsPage                                     Pass/Fail summary after a test
      RecruitsAdminPage, TemplatesAdminPage,
      TemplateEditorPage                              Build recruits and test templates
      reporting/                                      Recruit history, pass rates, cohort
                                                        dashboard, CSV export
```
