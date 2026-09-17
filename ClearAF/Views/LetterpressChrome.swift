import SwiftUI
import UIKit

extension Letterpress {
    static let tabLabelSize: CGFloat = 11
    static let screenTitleSize: CGFloat = 34

    /// Unread tab badge colour (spec §1: ochre is reserved for unread/prescription). The graphics-only
    /// `attentionMark` clears only ~3.7:1 against the badge's white numeral in light mode — under the 4.5:1
    /// minimum — so the badge falls back to the darker `attentionText`, which clears 4.5:1 in both
    /// appearances (7.1:1 light, ~10.9:1 dark). `UIColor(named:)` (not `UIColor(Letterpress.attentionText)`)
    /// because this feeds UIKit appearance proxies, matching the rest of this file.
    static var unreadBadgeColor: UIColor { UIColor(named: "lp.attention.text")! }

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
        let badge = Letterpress.unreadBadgeColor
        let badgeText: [NSAttributedString.Key: Any] = [.foregroundColor: UIColor(named: "lp.canvas")!]
        let item = UITabBarItem.appearance()
        item.setTitleTextAttributes(normal, for: .normal)
        item.setTitleTextAttributes(selected, for: .selected)
        item.badgeColor = badge
        item.setBadgeTextAttributes(badgeText, for: .normal)

        if #available(iOS 26, *) {
            // Liquid Glass tab bar: leave the background/material alone so it stays native, but the
            // UITabBarItem badge proxy above isn't honoured by the Liquid Glass badge, so force the same
            // colour through an *unconfigured* UITabBarAppearance — only its badge slots are touched
            // (no configureWithDefaultBackground/OpaqueBackground call), so the system still draws its own
            // glass background rather than a second, manually simulated one (spec §4.8).
            let badgesOnly = UITabBarAppearance()
            for layout in [badgesOnly.stackedLayoutAppearance, badgesOnly.inlineLayoutAppearance, badgesOnly.compactInlineLayoutAppearance] {
                layout.normal.badgeBackgroundColor = badge
                layout.normal.badgeTextAttributes = badgeText
            }
            UITabBar.appearance().standardAppearance = badgesOnly
            UITabBar.appearance().scrollEdgeAppearance = badgesOnly
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
