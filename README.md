# GFD Recruit Testing

A native iPhone/iPad app for Greensboro Fire Department to run practical skills tests on
new recruits: build reusable test templates (instructions, graded pass/fail steps, and
timers with pass/fail cutoffs), run them live against a recruit, capture photo/note
evidence on any failed step, and export results to a spreadsheet — all with **zero
ongoing cost** (no server, no subscriptions; syncing between department devices uses
Apple's free CloudKit).

This is a real Xcode project's source code, written without access to a Mac — **you'll
need a Mac with Xcode to build, run, and submit it.** These steps get you from this
folder to a running app in the Simulator.

## 1. One-time tools setup (on your Mac)

1. Install **Xcode** from the Mac App Store (free), and open it once to accept the
   license and let it install additional components.
2. Install **[XcodeGen](https://github.com/yonaskolb/XcodeGen)** — this project's actual
   `.xcodeproj` file isn't checked in; XcodeGen generates it from `project.yml` so the
   project stays easy to review and diff in Git. With [Homebrew](https://brew.sh)
   installed:
   ```
   brew install xcodegen
   ```

## 2. Generate and open the project

From this folder in Terminal:
```
xcodegen generate
open GFDTrainingPracticals.xcodeproj
```
Re-run `xcodegen generate` any time `project.yml` changes (e.g. after pulling new
changes that touch project settings).

## 3. Sign the app with your Apple Developer account

In Xcode, select the project in the navigator, then the **GFDTrainingPracticals**
target, then the **Signing & Capabilities** tab:
1. Choose the department's Apple Developer team from the **Team** dropdown.
2. Xcode will offer to create the iCloud container (`iCloud.com.greensborofd.trainingpracticals`)
   automatically the first time you build — accept that.

See `GFDTrainingPracticals/Persistence/CloudKitSchemaNotes.md` for the full CloudKit
setup checklist (this only needs doing once).

## 4. Run it

Pick an iPhone or iPad Simulator from the scheme selector at the top of the Xcode window
and press the ▶ button (or `Cmd+R`). The very first launch shows a one-time **Create the
first administrator account** screen (there's no server to seed one from) — after that,
sign in with the account you just created.

Note: the iOS Simulator has no camera, so the photo-attachment feature automatically
falls back to picking a photo from the Simulator's photo library instead of taking one —
this only matters for testing; a real device uses the actual camera.

## 5. Try the real multi-device / offline sync

Every department device needs to be **signed into the same shared department iCloud
account** (Settings → [Apple ID] → iCloud) for test results to sync between evaluators —
this is a one-time step per device, not something the app can do for you. To verify it
end-to-end: run the app on two devices/simulators signed into that same iCloud account,
put one in Airplane Mode, complete a test, then reconnect and confirm the other device
sees it.

## 6. App Store submission

See the **"App Store Submission Checklist"** section of the project plan for the full
list (Apple Developer Program enrollment, privacy nutrition label, screenshots, a demo
login for Apple's reviewer, TestFlight beta, etc.).

## Project layout

```
project.yml                          XcodeGen project spec (edit this, not the .xcodeproj)
GFDTrainingPracticals/
  App/                                App entry point + root navigation
  Persistence/                        Core Data + CloudKit model and setup
  Domain/                             Typed helpers/extensions over the Core Data entities
  Features/
    Auth/                             Login, first-run admin setup, admin management
    Home/                             Home Screen (test list)
    Recruits/                         Add/edit recruits
    Templates/                        Build test templates (instruction/graded/timer steps)
    TestRunner/                       Recruit confirmation → live test → results
    Export/                           CSV (Excel) export
    Reporting/                        Recruit history, pass rates, cohort dashboard
  Shared/                             Branding/theme, reusable UI bits, small utilities
  Resources/                          Assets.xcassets (branding), Info.plist, entitlements
```
