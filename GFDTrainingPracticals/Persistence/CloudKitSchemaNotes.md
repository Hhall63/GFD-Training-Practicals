# CloudKit setup notes (dev reference only, not shown in-app)

1. In Xcode, select the project > target > **Signing & Capabilities**, and sign in with the
   department's Apple Developer account. Set `DEVELOPMENT_TEAM` (currently blank in
   `project.yml`) to that team's ID.
2. Add the **iCloud** capability with **CloudKit** checked, and use the container identifier
   already referenced in `Resources/GFDTrainingPracticals.entitlements`:
   `iCloud.com.greensborofd.trainingpracticals`. Xcode will offer to create this container in
   your Developer account automatically the first time you build to a device.
3. Add the **Background Modes** capability with **Remote notifications** checked, so the app
   can react to CloudKit push notifications about changes made on other devices.
4. The very first time you run the app on a device signed into the shared department iCloud
   account, Core Data's CloudKit mirroring will initialize the CloudKit schema automatically
   from `GFDModel.xcdatamodeld`. Open **CloudKit Dashboard** (icloud.developer.apple.com) for
   this container afterward to confirm the record types (`CD_AdminAccount`, `CD_Recruit`,
   `CD_TestTemplate`, `CD_TestLine`, `CD_TestSession`, `CD_TestLineResult`, `CD_Attachment`)
   were created in the **Development** environment.
5. Before submitting to the App Store, promote the schema from Development to Production in
   CloudKit Dashboard ("Deploy Schema Changes to Production").
6. Every department device needs to be signed into **the same shared department iCloud
   account** (Settings > [Apple ID at top] > iCloud, on each iPad/iPhone) for data to sync
   between evaluators. This is a one-time setup step per device, not something the app can
   automate.
