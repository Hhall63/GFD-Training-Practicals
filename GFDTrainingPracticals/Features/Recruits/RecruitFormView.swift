import PhotosUI
import SwiftUI

/// Create or edit a recruit. Pass `recruit: nil` to create a new one.
struct RecruitFormView: View {
    let recruit: Recruit?

    @Environment(\.managedObjectContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var cohort = ""
    @State private var badgeNumber = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var photoImage: UIImage?

    private var canSave: Bool { !firstName.isEmpty && !lastName.isEmpty && !cohort.isEmpty }

    var body: some View {
        Form {
            Section {
                HStack {
                    Spacer()
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        if let photoImage {
                            Image(uiImage: photoImage)
                                .resizable().scaledToFill()
                                .frame(width: 96, height: 96)
                                .clipShape(Circle())
                        } else {
                            Circle()
                                .fill(Brand.navy.opacity(0.15))
                                .frame(width: 96, height: 96)
                                .overlay {
                                    Image(systemName: "camera.fill").foregroundStyle(Brand.navy)
                                }
                        }
                    }
                    Spacer()
                }
                .listRowBackground(Color.clear)
            }

            Section("Recruit Info") {
                TextField("First Name", text: $firstName)
                TextField("Last Name", text: $lastName)
                TextField("Class / Cohort (e.g. Academy 2026-A)", text: $cohort)
                TextField("Badge / ID Number (optional)", text: $badgeNumber)
            }
        }
        .navigationTitle(recruit == nil ? "New Recruit" : "Edit Recruit")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }.disabled(!canSave)
            }
        }
        .onChange(of: photoItem) { _, newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self) {
                    photoImage = UIImage(data: data)
                }
            }
        }
        .onAppear(perform: loadExistingValues)
    }

    private func loadExistingValues() {
        guard let recruit else { return }
        firstName = recruit.firstName
        lastName = recruit.lastName
        cohort = recruit.recruitClassOrCohort
        badgeNumber = recruit.badgeOrIdNumber ?? ""
        photoImage = recruit.photoImage
    }

    private func save() {
        let target = recruit ?? Recruit.create(
            firstName: firstName, lastName: lastName, cohort: cohort,
            badgeNumber: badgeNumber.isEmpty ? nil : badgeNumber, in: context
        )
        if recruit != nil {
            target.firstName = firstName
            target.lastName = lastName
            target.recruitClassOrCohort = cohort
            target.badgeOrIdNumber = badgeNumber.isEmpty ? nil : badgeNumber
        }
        if let photoImage {
            target.photoImage = photoImage
        }
        try? context.save()
        dismiss()
    }
}
