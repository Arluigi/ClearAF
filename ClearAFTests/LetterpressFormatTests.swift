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

    @Test func unreadBadgeTextMeetsContrastInBothAppearances() throws {
        Letterpress.applyChromeAppearance()
        let fill = try #require(UITabBarItem.appearance().badgeColor)
        let text = try #require(UITabBarItem.appearance().badgeTextAttributes(for: .normal)?[.foregroundColor] as? UIColor)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            #expect(LetterpressTests.hex(fill.resolvedColor(with: traits)) == LetterpressTests.hex(LetterpressTests.resolved("lp.attention.text", style)))
            #expect(LetterpressTests.contrast(text.resolvedColor(with: traits), fill.resolvedColor(with: traits)) >= 4.5, "\(style.rawValue)")
        }
    }
}
