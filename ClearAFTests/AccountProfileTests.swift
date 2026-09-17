import Foundation
import Testing
import UIKit
import SwiftUI
@testable import ClearAF

struct AccountProfileTests {
    @Test func accountNameCanSubmitTrimsWhitespaceAndBlocksWhileSaving() {
        #expect(!AccountName.canSubmit(" ", isSaving: false))
        #expect(!AccountName.canSubmit("Valid Patient", isSaving: true))
        #expect(AccountName.canSubmit("  Valid Patient  ", isSaving: false))
    }

    @Test func letterpressReadingColorsMeetContrastInBothAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            for surface in [Letterpress.canvas, Letterpress.surface] {
                for text in [Letterpress.ink, Letterpress.inkSecondary, Letterpress.action] {
                    #expect(contrast(UIColor(text).resolvedColor(with: traits), UIColor(surface).resolvedColor(with: traits)) >= 4.5)
                }
            }
        }
    }

    @MainActor @Test func failedSaveKeepsFormVisibleWithoutPublishingSuccess() async {
        let state = AccountSaveState()
        await state.perform { throw URLError(.notConnectedToInternet) }

        #expect(state.errorMessage != nil)
        #expect(state.successMessage == nil)
        #expect(!state.isSaving)
    }

    @MainActor @Test func accountChangeDuringSaveCannotPublishSuccess() async {
        let state = AccountSaveState()
        await state.perform { throw AccountFailure.accountChanged }

        #expect(state.errorMessage != nil)
        #expect(state.successMessage == nil)
    }

    @Test func onboardingPayloadIncludesOnlyNameAndCompletion() throws {
        let data = try JSONEncoder().encode(UpdateProfileRequest.onboarding(name: "Taylor Patient"))
        let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["name"] as? String == "Taylor Patient")
        #expect(json["onboardingCompleted"] as? Bool == true)
        #expect(Set(json.keys) == ["name", "onboardingCompleted"])
    }

    @Test func nameEditPayloadDoesNotEraseLegacyProfileFields() throws {
        let data = try JSONEncoder().encode(UpdateProfileRequest.nameEdit("Updated Patient"))
        let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json.count == 1)
        #expect(json["name"] as? String == "Updated Patient")
    }

    @Test func registrationMetadataOmitsUnselectedSkinClassification() {
        let metadata = SupabaseService.registrationMetadata(name: "Taylor Patient", skinType: nil)

        #expect(Set(metadata.keys) == ["name"])
        #expect(metadata["name"] == .string("Taylor Patient"))
    }

    @Test func secondaryAndErrorTextMeetContrastOnSystemFormBackgrounds() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            for background in [UIColor.systemBackground, .secondarySystemBackground, .tertiarySystemBackground, .systemGroupedBackground, .secondarySystemGroupedBackground] {
                for (label, color) in [("secondary", Letterpress.inkSecondary), ("error", Letterpress.error)] {
                    let ratio = contrast(UIColor(color).resolvedColor(with: traits), background.resolvedColor(with: traits))
                    #expect(ratio >= 4.5, "\(label) \(style.rawValue): \(ratio)")
                }
            }
        }
    }

    private func contrast(_ first: UIColor, _ second: UIColor) -> Double {
        let values = [first, second].map { color -> Double in
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            func linear(_ value: CGFloat) -> Double {
                let component = Double(value)
                return component <= 0.04045 ? component / 12.92 : pow((component + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
        }.sorted(by: >)
        return (values[0] + 0.05) / (values[1] + 0.05)
    }
}
