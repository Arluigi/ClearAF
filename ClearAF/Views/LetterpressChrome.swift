import SwiftUI
import UIKit

extension Letterpress {
    static let tabLabelSize: CGFloat = 11
    static let screenTitleSize: CGFloat = 34

    /// Native bars (spec §2, §4.8, §6 tab bar): Newsreader screen titles, Plex inline titles, mono tab labels,
    /// ink selection, unread badge in attention.text. The system keeps its own materials and geometry.
    ///
    /// Like `applyControlAppearance`'s segmented fonts, these `UIFontMetrics.scaledFont(for:)` results are
    /// resolved once at launch (see `ClearAFApp.swift`) and baked into plain `UIFont`s — a live Dynamic Type
    /// change doesn't rescale them until the app relaunches. Unlike the control appearance, there's no
    /// `observeContentSizeChanges` hook here re-running this: bars and titles are rarer to catch mid-change and
    /// SwiftUI's own `Text` within them still scales, so this is accepted as the same cosmetic gap.
    @MainActor static func applyChromeAppearance() {
        let ink = UIColor(named: "lp.ink")!
        let tertiary = UIColor(named: "lp.ink.tertiary")!
        let largeTitle = UIFont(name: displayFontName(size: screenTitleSize, italic: false), size: screenTitleSize)
            ?? .preferredFont(forTextStyle: .largeTitle)
        let inlineTitle = UIFont(name: UIWeight.medium.fontName, size: 17) ?? .preferredFont(forTextStyle: .headline)
        let navigation = UINavigationBar.appearance()
        navigation.largeTitleTextAttributes = [.font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: largeTitle), .foregroundColor: ink]
        navigation.titleTextAttributes = [.font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: inlineTitle), .foregroundColor: ink]

        let tabFont = UIFont(name: DataWeight.medium.fontName, size: tabLabelSize) ?? .preferredFont(forTextStyle: .caption2)
        let normal: [NSAttributedString.Key: Any] = [.font: tabFont, .foregroundColor: tertiary]
        let selected: [NSAttributedString.Key: Any] = [.font: tabFont, .foregroundColor: ink]
        let badge = UIColor(named: "lp.attention.text")!
        let badgeText: [NSAttributedString.Key: Any] = [.foregroundColor: UIColor(named: "lp.canvas")!]
        let item = UITabBarItem.appearance()
        item.setTitleTextAttributes(normal, for: .normal)
        item.setTitleTextAttributes(selected, for: .selected)
        item.badgeColor = badge
        item.setBadgeTextAttributes(badgeText, for: .normal)

        if #available(iOS 26, *) {
            // Liquid Glass tab bar: leave the system appearance object alone so the material stays native.
        } else {
            let appearance = UITabBarAppearance()
            appearance.configureWithDefaultBackground()
            for layout in [appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance, appearance.compactInlineLayoutAppearance] {
                layout.normal.titleTextAttributes = normal
                layout.selected.titleTextAttributes = selected
                layout.normal.iconColor = tertiary
                layout.selected.iconColor = ink
                layout.normal.badgeBackgroundColor = badge
                layout.normal.badgeTextAttributes = badgeText
            }
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
    }
}

extension View {
    /// Sheets use the system glass on iOS 26 (spec §4.8) and the paper canvas on earlier systems.
    @ViewBuilder func letterpressSheetBackground() -> some View {
        if #available(iOS 26, *) {
            self
        } else {
            presentationBackground(Letterpress.canvas)
        }
    }
}
