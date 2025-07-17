# Clear AF

A comprehensive iOS skincare tracking app that helps users monitor their skin progress through photos, manage daily routines, and track their skincare journey.

## Features

### 🎯 Core Functionality
- **Photo Progress Tracking**: Capture and score daily skin photos with notes
- **Routine Management**: Create and follow morning/evening skincare routines with guided sessions
- **Progress Timeline**: View your skin journey with grid and list views
- **Comprehensive Onboarding**: 5-screen guided setup with skin type selection

### 📱 User Experience
- **Professional Onboarding**: Welcome, features overview, profile setup, camera permissions, and first photo guidance
- **Dark Theme Support**: Fully adaptive design system with consistent theming
- **Interactive Elements**: Haptic feedback, smooth animations, and native iOS patterns
- **Empty States**: Helpful guidance and tips when starting your journey

### ⚙️ Profile & Settings
- **Profile Management**: Edit name, skin type, and view statistics
- **Notification Settings**: Customizable reminders for routines and photos
- **Data Export**: Export your data in CSV/JSON formats
- **Help & Support**: Built-in FAQ and support contact options
- **Privacy Policy**: Comprehensive privacy information

## Technical Details

### Architecture
- **Framework**: SwiftUI with UIKit integration
- **Database**: Core Data for local storage
- **iOS Version**: 17.0+ required
- **Device**: Optimized for iPhone 16 Pro, supports all iPhone models
- **Camera**: AVFoundation integration with PhotosUI support

### Design System
- **Colors**: Adaptive purple theme with dark mode support
- **Typography**: Dynamic type support with custom font hierarchy
- **Spacing**: 4px increment system for consistent layouts
- **Components**: Reusable cards, buttons, and form elements
- **Haptics**: Light, medium, and success feedback patterns

### Key Components
- **OnboardingView**: 5-screen guided setup flow
- **DashboardViewEnhanced**: Home screen with daily tasks and photo display
- **TimelineView**: Progress history with grid/list toggle
- **RoutineView**: Skincare routine management with guided sessions
- **CameraView**: Photo capture with scoring and notes
- **ProfileView**: User settings and data management

## Getting Started

### Prerequisites
- Xcode 15.0+
- iOS 17.0+ deployment target
- macOS Sonoma for development

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Arluigi/ClearAF.git
   cd ClearAF
   ```

2. Open the project:
   ```bash
   open ClearAF.xcodeproj
   ```

3. Build and run:
   - Select your target device or simulator
   - Press `Cmd+R` to build and run

### Development
- **Clean Build**: `Cmd+Shift+K` in Xcode
- **Run Tests**: `Cmd+U` in Xcode
- **Archive**: `Product > Archive` for distribution

## Project Structure

```
ClearAF/
├── ClearAF/
│   ├── ClearAFApp.swift          # Main app entry point
│   ├── ContentView.swift         # Root navigation controller
│   ├── Persistence.swift         # Core Data stack
│   ├── ClearAF.xcdatamodeld/     # Core Data model
│   └── Views/
│       ├── DesignSystem.swift    # Colors, typography, components
│       ├── OnboardingView.swift  # User onboarding flow
│       ├── DashboardViewEnhanced.swift  # Home screen
│       ├── TimelineView.swift    # Photo progress history
│       ├── RoutineView.swift     # Skincare routine management
│       ├── CameraView.swift      # Photo capture interface
│       └── ProfileView.swift     # Settings and profile
├── ClearAFTests/                 # Unit tests
├── ClearAFUITests/              # UI tests
└── Assets.xcassets/             # App icons and images
```

## Data Model

### Core Entities
- **User**: Profile information, skin score, streak, preferences
- **SkinPhoto**: Images with scores, dates, and notes
- **Routine**: Morning/evening routines with metadata
- **RoutineStep**: Individual steps with products and instructions

### Features
- **Real-time Updates**: Core Data with @FetchRequest for reactive UI
- **Data Persistence**: Local storage with optional cloud sync
- **Migration Support**: Core Data versioning for app updates

## Development Status

### ✅ Completed (MVP Ready)
- Complete onboarding flow
- Photo tracking with scoring
- Routine creation and management
- Profile settings and data export
- Dark theme support
- Professional UI/UX

### 🔄 Future Enhancements
- AI-powered skincare advice
- Community features and sharing
- Advanced camera features (face alignment, ghost mode)
- Trigger tracking (food, stress, weather)
- Push notifications
- Analytics dashboard

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

## Contact

**Developer**: Aryan Sachdev  
**LinkedIn**: [linkedin.com/in/aryansachdev](https://linkedin.com/in/aryansachdev)

---

*Clear AF - Your journey to clearer skin* ✨