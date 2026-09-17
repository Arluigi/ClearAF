import Foundation

/// Date copy (spec §7): patient dates written out ("2 Sep"); mono stamps uppercase with 24-hour time ("15 SEP · 07:12").
enum LetterpressFormat {
    private static func formatter(_ format: String, locale: Locale, timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateFormat = format
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
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("jmm")
        formatter.amSymbol = "am"
        formatter.pmSymbol = "pm"
        // ICU inserts a narrow no-break space before the period; copy uses a plain space.
        return formatter.string(from: date).replacingOccurrences(of: "\u{202F}", with: " ")
    }
}
