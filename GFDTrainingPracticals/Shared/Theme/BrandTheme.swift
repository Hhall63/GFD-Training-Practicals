import SwiftUI

/// Greensboro Fire Department brand colors, sampled from the department badge.
enum Brand {
    static let navy = Color("BrandNavy")
    static let red = Color("BrandRed")
    static let gold = Color("BrandGold")

    static let badgeImage = Image("GFDBadge")
    static let workHardBeHumbleImage = Image("WorkHardBeHumble")
}

extension View {
    /// The standard large primary action button style used throughout the app
    /// (Pass/Fail buttons, Start/Stop timer, Next, Sign In).
    func brandPrimaryButton(color: Color = Brand.navy) -> some View {
        self
            .font(.title3.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(color, in: RoundedRectangle(cornerRadius: 14))
    }
}
