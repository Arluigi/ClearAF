import Testing
import UIKit
@testable import ClearAF

struct LetterpressFormatTests {
    static let instant = ISO8601DateFormatter().date(from: "2026-09-15T07:12:00Z")!
    static let utc = TimeZone(identifier: "UTC")!
    static let us = Locale(identifier: "en_US")

    @Test func patientDatesAreWrittenOut() {
        #expect(LetterpressFormat.dayMonth(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 Sep")
        #expect(LetterpressFormat.dayMonthYear(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 Sep 2026")
        #expect(LetterpressFormat.weekdayDayMonth(Self.instant, locale: Self.us, timeZone: Self.utc) == "Tue 15 Sep")
        #expect(LetterpressFormat.monthYear(Self.instant, locale: Self.us, timeZone: Self.utc) == "September 2026")
    }

    @Test func monoStampsAreUppercaseWith24HourTime() {
        #expect(LetterpressFormat.stamp(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 SEP")
        #expect(LetterpressFormat.stampTime(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 SEP · 07:12")
        #expect(LetterpressFormat.stampYearTime(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 SEP 2026 · 07:12")
    }

    @Test func clockFollowsTheLocaleHourCycleInLowercase() {
        #expect(LetterpressFormat.clock(Self.instant, locale: Self.us, timeZone: Self.utc) == "7:12 am")
        #expect(LetterpressFormat.clock(Self.instant, locale: Locale(identifier: "en_GB"), timeZone: Self.utc) == "07:12")
        let evening = ISO8601DateFormatter().date(from: "2026-09-15T21:30:00Z")!
        #expect(LetterpressFormat.clock(evening, locale: Self.us, timeZone: Self.utc) == "9:30 pm")
    }
}

@MainActor struct LetterpressChromeTests {
    @Test func titlesAndTabLabelsUseLetterpressFacesAndInk() throws {
        Letterpress.registerFonts()
        Letterpress.applyChromeAppearance()
        let large = try #require(UINavigationBar.appearance().largeTitleTextAttributes?[.font] as? UIFont)
        #expect(large.fontName == "Newsreader72pt-Light")
        let inline = try #require(UINavigationBar.appearance().titleTextAttributes?[.font] as? UIFont)
        #expect(inline.fontName == "IBMPlexSans-Medm")
        let tab = try #require(UITabBarItem.appearance().titleTextAttributes(for: .normal)?[.font] as? UIFont)
        #expect(tab.fontName == "IBMPlexMono-Medm")
        #expect(tab.pointSize >= 11)
        let selected = try #require(UITabBarItem.appearance().titleTextAttributes(for: .selected)?[.foregroundColor] as? UIColor)
        let normal = try #require(UITabBarItem.appearance().titleTextAttributes(for: .normal)?[.foregroundColor] as? UIColor)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            #expect(LetterpressTests.hex(selected.resolvedColor(with: traits)) == LetterpressTests.hex(LetterpressTests.resolved("lp.ink", style)))
            #expect(LetterpressTests.contrast(normal.resolvedColor(with: traits), LetterpressTests.resolved("lp.canvas", style)) >= 4.5)
        }
    }

    /// Notes' unread badge is the app's only badge, and unread is the one thing ochre is reserved for
    /// (spec §1). `applyChromeAppearance` sets the badge colour two ways because the `UITabBarItem`
    /// appearance proxy alone isn't honoured by the Liquid Glass tab bar's badge (iOS 26+) — so this checks
    /// both the item-level proxy (older tab bars) and the `UITabBarAppearance` layout objects
    /// `applyChromeAppearance` now also configures on the iOS 26+ path, and that both agree on the same
    /// token via the shared `Letterpress.unreadBadgeColor` helper.
    @Test func unreadBadgeTextMeetsContrastInBothAppearances() throws {
        Letterpress.applyChromeAppearance()
        let fill = try #require(UITabBarItem.appearance().badgeColor)
        let text = try #require(UITabBarItem.appearance().badgeTextAttributes(for: .normal)?[.foregroundColor] as? UIColor)
        let tabBar = UITabBar.appearance().standardAppearance
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let expected = LetterpressTests.resolved("lp.attention.text", style)
            #expect(LetterpressTests.hex(fill.resolvedColor(with: traits)) == LetterpressTests.hex(expected))
            #expect(LetterpressTests.contrast(text.resolvedColor(with: traits), fill.resolvedColor(with: traits)) >= 4.5, "\(style.rawValue)")
            #expect(LetterpressTests.hex(Letterpress.unreadBadgeColor.resolvedColor(with: traits)) == LetterpressTests.hex(expected))

            for layout in [tabBar.stackedLayoutAppearance, tabBar.inlineLayoutAppearance, tabBar.compactInlineLayoutAppearance] {
                let layoutFill = try #require(layout.normal.badgeBackgroundColor).resolvedColor(with: traits)
                let layoutText = try #require(layout.normal.badgeTextAttributes[.foregroundColor] as? UIColor).resolvedColor(with: traits)
                #expect(LetterpressTests.hex(layoutFill) == LetterpressTests.hex(expected), "layout badge \(style.rawValue)")
                #expect(LetterpressTests.contrast(layoutText, layoutFill) >= 4.5, "layout badge text \(style.rawValue)")
            }
        }

        // Control: attentionMark (the graphics-only ochre) is why the badge uses attentionText instead —
        // it fails 4.5:1 against the badge's white numeral in light mode.
        #expect(LetterpressTests.contrast(LetterpressTests.resolved("lp.attention.mark", .light), LetterpressTests.resolved("lp.canvas", .light)) < 4.5)
    }
}
