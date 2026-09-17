//
//  DesignSystem.swift
//  ClearAF
//
//  Comprehensive design system based on expert UX/UI analysis
//  Implements wellness-focused color psychology and accessibility standards
//

import SwiftUI
import UIKit

// MARK: - Color System
extension Color {
    // Primary Brand Colors - Confidence & Trust
    static let primaryPurple = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.714, green: 0.612, blue: 1.0, alpha: 1) // #B69CFF
            : UIColor(red: 0.42, green: 0.27, blue: 0.76, alpha: 1) // #6B46C1
    })
    static let primaryActionPurple = Color(red: 0.42, green: 0.27, blue: 0.76)
    static let primaryActionTeal = Color(red: 0.0, green: 0.478, blue: 0.529) // #007A87
    static let primaryTeal = primaryActionTeal
    
    // Wellness & Skincare Palette - Calm & Nurturing
    static let skinPeach = Color(red: 1.0, green: 0.89, blue: 0.82) // #FFE4D1
    static let calmBlue = Color(red: 0.89, green: 0.95, blue: 1.0) // #E3F2FF
    static let gentleGreen = Color(red: 0.85, green: 0.96, blue: 0.89) // #D9F5E3
    static let warmBeige = Color(red: 0.98, green: 0.96, blue: 0.94) // #FAF5F0
    static let softLavender = Color(red: 0.95, green: 0.93, blue: 0.98) // #F2EDF8
    
    // Dark Theme Neutral System - Elegant & Modern
    static let textPrimary = Color.primary // Adapts to light/dark mode
    static let textSecondary = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 0.78, alpha: 1)
            : UIColor(white: 0.32, alpha: 1)
    })
    static let retainedErrorText = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 1, green: 0.70, blue: 0.66, alpha: 1)
            : UIColor(red: 0.65, green: 0.10, blue: 0.10, alpha: 1)
    })
    static let textTertiary = Color(UIColor.tertiaryLabel) // System tertiary
    static let backgroundPrimary = Color(UIColor.systemBackground) // Adapts to theme
    static let backgroundSecondary = Color(UIColor.secondarySystemBackground) // Darker in dark mode
    static let backgroundTertiary = Color(UIColor.tertiarySystemBackground) // Even darker
    static let borderSubtle = Color(UIColor.separator) // System separator color
    static let cardBackground = Color(UIColor.systemGray6) // Card backgrounds
    
    // Interactive States
    static let buttonPrimary = primaryActionPurple
    static let buttonSecondary = skinPeach
    static let buttonDisabled = Color(red: 0.85, green: 0.87, blue: 0.90) // #D9DEE6
    
    // Gradients for Visual Impact
    static let primaryGradient = LinearGradient(
        colors: [primaryActionPurple, primaryActionTeal],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
}

// MARK: - Typography System
extension Font {
    // Display Fonts - Heroes & Key Metrics
    static let displayLarge = Font.largeTitle.weight(.bold)
    static let displayMedium = Font.title.weight(.semibold)
    static let displaySmall = Font.title2.weight(.medium)
    
    // Headlines - Section Titles
    static let headlineLarge = Font.title2.weight(.semibold)
    static let headlineMedium = Font.headline.weight(.medium)
    static let headlineSmall = Font.subheadline.weight(.medium)
    
    // Body Text - Readable Content
    static let bodyLarge = Font.body
    static let bodyMedium = Font.callout
    static let bodySmall = Font.footnote
    
    // Captions & Labels
    static let captionLarge = Font.footnote.weight(.medium)
    static let captionMedium = Font.caption.weight(.medium)
    static let captionSmall = Font.caption2
    
    // Dynamic Type Support
    static func dynamicTitle() -> Font {
        Font.custom("SF Pro Display", size: 28, relativeTo: .title)
    }
    
    static func dynamicHeadline() -> Font {
        Font.custom("SF Pro Display", size: 18, relativeTo: .headline)
    }
    
    static func dynamicBody() -> Font {
        Font.custom("SF Pro Text", size: 17, relativeTo: .body)
    }
}

// MARK: - Spacing System
extension CGFloat {
    // Micro Spacing
    static let spaceXXS: CGFloat = 2
    static let spaceXS: CGFloat = 4
    
    // Standard Spacing
    static let spaceSM: CGFloat = 8
    static let spaceMD: CGFloat = 12
    static let spaceLG: CGFloat = 16
    static let spaceXL: CGFloat = 20
    static let spaceXXL: CGFloat = 24
    
    // Macro Spacing
    static let spaceHuge: CGFloat = 32
    static let spaceGiant: CGFloat = 48
    static let spaceMassive: CGFloat = 64
    
    // Component-Specific
    static let cardPadding: CGFloat = 20
    static let buttonPadding: CGFloat = 16
    static let iconSize: CGFloat = 24
    static let touchTarget: CGFloat = 44
}

// MARK: - Corner Radius System
extension CGFloat {
    static let radiusSmall: CGFloat = 8
    static let radiusMedium: CGFloat = 12
    static let radiusLarge: CGFloat = 16
    static let radiusXL: CGFloat = 20
    static let radiusXXL: CGFloat = 24
    static let radiusPill: CGFloat = 50
}

// MARK: - Shadow System
extension View {
    func softShadow() -> some View {
        self.shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 4)
    }
    
    func mediumShadow() -> some View {
        self.shadow(color: Color.black.opacity(0.1), radius: 12, x: 0, y: 6)
    }
    
    func strongShadow() -> some View {
        self.shadow(color: Color.black.opacity(0.15), radius: 16, x: 0, y: 8)
    }
    
    func glowShadow(color: Color = .primaryPurple) -> some View {
        self.shadow(color: color.opacity(0.3), radius: 8, x: 0, y: 4)
    }
}

// MARK: - Button Styles
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headlineMedium)
            .foregroundColor(.white)
            .padding(.horizontal, .spaceXL)
            .padding(.vertical, .spaceLG)
            .frame(minHeight: .touchTarget)
            .background(Color.primaryGradient)
            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            .glowShadow()
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headlineMedium)
            .foregroundColor(.primaryPurple)
            .padding(.horizontal, .spaceXL)
            .padding(.vertical, .spaceLG)
            .frame(minHeight: .touchTarget)
            .background(Color.buttonSecondary)
            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            .overlay(
                RoundedRectangle(cornerRadius: .radiusLarge)
                    .stroke(Color.primaryPurple.opacity(0.2), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headlineMedium)
            .foregroundColor(.primaryPurple)
            .padding(.horizontal, .spaceXL)
            .padding(.vertical, .spaceLG)
            .frame(minHeight: .touchTarget)
            .background(Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            .overlay(
                RoundedRectangle(cornerRadius: .radiusLarge)
                    .stroke(Color.primaryPurple, lineWidth: 1.5)
            )
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Text Field Styles
struct StandardTextFieldModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.backgroundSecondary)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.borderSubtle, lineWidth: 1)
            )
            .cornerRadius(12)
    }
}

extension View {
    func standardTextField() -> some View {
        self.modifier(StandardTextFieldModifier())
    }
}

// MARK: - Clickable Element Styles
struct ClickableBackgroundModifier: ViewModifier {
    let isPressed: Bool
    
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isPressed ? Color.backgroundSecondary.opacity(0.8) : Color.backgroundSecondary.opacity(0.3))
                    .animation(.easeInOut(duration: 0.1), value: isPressed)
            )
    }
}

extension View {
    func clickableBackground(isPressed: Bool = false) -> some View {
        self.modifier(ClickableBackgroundModifier(isPressed: isPressed))
    }
}

// MARK: - Card Styles
struct WellnessCardModifier: ViewModifier {
    let style: CardStyle
    
    enum CardStyle {
        case elevated, flat, outline, glassmorphism
    }
    
    func body(content: Content) -> some View {
        content
            .padding(.cardPadding)
            .background(
                Group {
                    switch style {
                    case .elevated:
                        RoundedRectangle(cornerRadius: .radiusXL)
                            .fill(Color.backgroundPrimary)
                            .softShadow()
                    case .flat:
                        RoundedRectangle(cornerRadius: .radiusXL)
                            .fill(Color.backgroundSecondary)
                    case .outline:
                        RoundedRectangle(cornerRadius: .radiusXL)
                            .fill(Color.backgroundPrimary)
                            .overlay(
                                RoundedRectangle(cornerRadius: .radiusXL)
                                    .stroke(Color.borderSubtle, lineWidth: 1)
                            )
                    case .glassmorphism:
                        RoundedRectangle(cornerRadius: .radiusXL)
                            .fill(.ultraThinMaterial)
                            .overlay(
                                RoundedRectangle(cornerRadius: .radiusXL)
                                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
                            )
                    }
                }
            )
    }
}

extension View {
    func wellnessCard(style: WellnessCardModifier.CardStyle = .elevated) -> some View {
        self.modifier(WellnessCardModifier(style: style))
    }
}

// MARK: - Haptic Feedback System
struct HapticManager {
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    
    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
    
    static func heavy() {
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    }
    
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    
    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
    
    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
    
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

// MARK: - Accessibility Helpers
extension View {
    func accessibleButton(label: String, hint: String? = nil, value: String? = nil) -> some View {
        self
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
            .accessibilityValue(value ?? "")
    }
    
    func accessibleImage(label: String, decorative: Bool = false) -> some View {
        self
            .accessibilityLabel(decorative ? "" : label)
            .accessibilityAddTraits(decorative ? [] : .isImage)
    }
}

// MARK: - Animation Presets
extension Animation {
    static let gentle = Animation.easeInOut(duration: 0.3)
    static let bouncy = Animation.spring(response: 0.4, dampingFraction: 0.7)
    static let quick = Animation.easeInOut(duration: 0.15)
    static let smooth = Animation.easeOut(duration: 0.5)
}

// Care Journal role names, resolved to Letterpress until consumers migrate (deleted in PR 2).
enum CareJournal {
    static let canvas = Letterpress.canvas
    static let surface = Letterpress.surface
    static let textPrimary = Letterpress.ink
    static let textSecondary = Letterpress.inkSecondary
    static let actionPrimary = Letterpress.action
    static let onPrimary = Letterpress.canvas
    static let accentSubtle = Letterpress.sunk
    static let separator = Letterpress.rule
    static let display = Letterpress.display(34)
}

extension View {
    func careJournalSurface() -> some View {
        self.padding(20).background(CareJournal.surface, in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Equivalent local choices share native control behavior and large-text adaptation.
struct CareJournalPicker<Selection: Hashable, Options: View>: View {
    let title: String
    @Binding var selection: Selection
    @ViewBuilder let options: () -> Options
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            Picker(title, selection: $selection, content: options).pickerStyle(.menu)
                .frame(minHeight: 44)
        } else {
            Picker(title, selection: $selection, content: options).pickerStyle(.segmented)
        }
    }
}
