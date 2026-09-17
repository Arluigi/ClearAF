import Foundation

/// Date copy (spec §7): patient dates written out ("2 Sep"); mono stamps uppercase with 24-hour time ("15 SEP · 07:12").
enum LetterpressFormat {
    /// `DateFormatter` construction is expensive (ICU calendar/locale lookups), and these are re-requested on
    /// every render. Cached by format string, locale and time zone; a lock guards the shared dictionary since
    /// callers may come from different tasks even though every current caller is on the main actor.
    private struct FormatterKey: Hashable { let format: String; let localeID: String; let timeZoneID: String }
    private static var cache: [FormatterKey: DateFormatter] = [:]
    private static let lock = NSLock()

    private static func formatter(_ format: String, locale: Locale, timeZone: TimeZone) -> DateFormatter {
        let key = FormatterKey(format: format, localeID: locale.identifier, timeZoneID: timeZone.identifier)
        lock.lock(); defer { lock.unlock() }
        if let cached = cache[key] { return cached }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        cache[key] = formatter
        return formatter
    }

    /// Template-based formatters (`setLocalizedDateFormatFromTemplate`) resolve their `dateFormat` from the
    /// template, locale and time zone at creation time, so they're cached the same way as the plain-format ones.
    private static func templateFormatter(_ template: String, locale: Locale, timeZone: TimeZone) -> DateFormatter {
        let key = FormatterKey(format: "template:\(template)", localeID: locale.identifier, timeZoneID: timeZone.identifier)
        lock.lock(); defer { lock.unlock() }
        if let cached = cache[key] { return cached }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        formatter.amSymbol = "am"
        formatter.pmSymbol = "pm"
        cache[key] = formatter
        return formatter
    }

    /// "15 Sep"
    static func dayMonth(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        formatter("d MMM", locale: locale, timeZone: timeZone).string(from: date)
    }

    /// "15 Sep 2026"
    static func dayMonthYear(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        formatter("d MMM yyyy", locale: locale, timeZone: timeZone).string(from: date)
    }

    /// "Tue 15 Sep"
    static func weekdayDayMonth(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        formatter("EEE d MMM", locale: locale, timeZone: timeZone).string(from: date)
    }

    /// "September 2026"
    static func monthYear(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        formatter("MMMM yyyy", locale: locale, timeZone: timeZone).string(from: date)
    }

    /// "15 SEP"
    static func stamp(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        dayMonth(date, locale: locale, timeZone: timeZone).uppercased(with: locale)
    }

    /// "15 SEP · 07:12"
    static func stampTime(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        "\(stamp(date, locale: locale, timeZone: timeZone)) · \(formatter("HH:mm", locale: locale, timeZone: timeZone).string(from: date))"
    }

    /// "15 SEP 2026 · 07:12"
    static func stampYearTime(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let day = formatter("d MMM yyyy", locale: locale, timeZone: timeZone).string(from: date).uppercased(with: locale)
        return "\(day) · \(formatter("HH:mm", locale: locale, timeZone: timeZone).string(from: date))"
    }

    /// "7:12 am" where the locale uses a 12-hour clock, "07:12" where it uses 24 hours.
    static func clock(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        // ICU inserts a narrow no-break space before the period; copy uses a plain space.
        templateFormatter("jmm", locale: locale, timeZone: timeZone).string(from: date).replacingOccurrences(of: "\u{202F}", with: " ")
    }
}
