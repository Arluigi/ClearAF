import Foundation
import Testing

/// Scans the Swift source tree (via #filePath) for design values Letterpress retired.
struct LetterpressSweepTests {
    static let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    static let excluded: Set<String> = ["LetterpressSweepTests.swift"]

    static func sources(in folders: [String]) throws -> [(path: String, text: String)] {
        var files: [(path: String, text: String)] = []
        for folder in folders {
            let root = repoRoot.appendingPathComponent(folder)
            guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" && !excluded.contains(url.lastPathComponent) {
                files.append((url.path.replacingOccurrences(of: repoRoot.path + "/", with: ""), try String(contentsOf: url, encoding: .utf8)))
            }
        }
        return files
    }

    static func offences(_ pattern: String, in folders: [String]) throws -> [String] {
        let regex = try NSRegularExpression(pattern: pattern)
        return try sources(in: folders).flatMap { file in
            file.text.components(separatedBy: "\n").enumerated().compactMap { index, line in
                regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) == nil
                    ? nil : "\(file.path):\(index + 1): \(line.trimmingCharacters(in: .whitespaces))"
            }
        }
    }

    @Test func sweepReadsTheSourceTree() throws {
        #expect(try Self.sources(in: ["ClearAF"]).count > 30)
    }

    @Test func appHasNoHardcodedHuesOrSystemControlStyles() throws {
        let hues = #"\.(red|blue|green|orange|purple|pink|yellow|teal|mint|cyan|indigo|brown|gray|white|black)\b|Color\((red|hue|white):|UIColor\((red|white|hue):|Color\(\.system|UIColor\.system|\.foreground(Style|Color)\(\.(primary|secondary|tertiary)\)|LinearGradient|RadialGradient|AngularGradient"#
        let controls = #"\.buttonStyle\(\.bordered(Prominent)?\)|\.textFieldStyle\(\.roundedBorder\)|\.cornerRadius\(|cornerRadius:\s*[0-9.]|PrimaryButtonStyle|SecondaryButtonStyle|GhostButtonStyle|standardTextField|design:\s*\.serif|\.tint\(Letterpress\.inkSecondary\)|CareJournalPicker"#
        #expect(try Self.offences(hues, in: ["ClearAF"]) == [])
        #expect(try Self.offences(controls, in: ["ClearAF"]) == [])
    }

    @Test func designSystemFileIsGone() {
        #expect(!FileManager.default.fileExists(atPath: Self.repoRoot.appendingPathComponent("ClearAF/Views/DesignSystem.swift").path))
    }

    @Test func noRetiredDesignSystemNamesRemain() throws {
        let retired = #"\b(CareJournal\w*|careJournal\w*|primaryPurple|primaryActionPurple|primaryActionTeal|primaryTeal|skinPeach|calmBlue|gentleGreen|warmBeige|softLavender|retainedErrorText|textPrimary|textSecondary|textTertiary|backgroundPrimary|backgroundSecondary|backgroundTertiary|borderSubtle|cardBackground|buttonPrimary|buttonSecondary|buttonDisabled|primaryGradient|glowShadow|softShadow|mediumShadow|strongShadow|wellnessCard|WellnessCardModifier|clickableBackground|ClickableBackgroundModifier|StandardTextFieldModifier|score[A-Z]\w*|space(XXS|XS|SM|MD|LG|XL|XXL|Huge|Giant|Massive)|radius(Small|Medium|Large|XL|XXL|Pill)|display(Large|Medium|Small)|headline(Large|Medium|Small)|body(Large|Medium|Small)|caption(Large|Medium|Small)|dynamic(Title|Headline|Body)|touchTarget|TodayPhotoActionAppearance|RoutineActionAppearance)\b"#
        #expect(try Self.offences(retired, in: ["ClearAF", "ClearAFTests", "ClearAFUITests"]) == [])
    }
}
