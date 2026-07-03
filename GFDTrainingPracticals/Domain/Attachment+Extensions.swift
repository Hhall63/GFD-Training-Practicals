import CoreData
import UIKit

extension Attachment {
    var photoImage: UIImage? {
        get { photoAsset.flatMap(UIImage.init) }
        set { photoAsset = newValue?.jpegData(compressionQuality: 0.7) }
    }

    @discardableResult
    static func create(
        for lineResult: TestLineResult,
        photo: UIImage?,
        note: String?,
        in context: NSManagedObjectContext
    ) -> Attachment {
        let attachment = Attachment(context: context)
        attachment.id = UUID()
        attachment.capturedAt = Date()
        attachment.noteText = note
        attachment.photoImage = photo
        attachment.lineResult = lineResult
        return attachment
    }
}
