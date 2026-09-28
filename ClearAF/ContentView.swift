import SwiftUI
import CoreData

struct ContentView: View {
    @StateObject private var apiService = APIService.shared
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            switch apiService.phase {
            case .loading:
                VStack(spacing: Letterpress.Space.s10) {
                    SwiftUI.ProgressView().tint(Letterpress.inkTertiary)
                    Text("Opening your account…")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Letterpress.canvas.ignoresSafeArea())
            case .signedOut:
                AuthenticationView {}
            case .profileError:
                AccountErrorView(message: apiService.accountError, retry: apiService.retryProfile, signOut: apiService.logout)
            case .recovery:
                PasswordRecoveryView()
            case .enrollment:
                EnrollmentView()
            case .onboarding:
                OnboardingView {}.photoErrorInset()
            case .ready:
                ReadyTabs()
            }
        }
        .environment(\.managedObjectContext, apiService.persistence.container.viewContext)
        .id(apiService.access.snapshot()?.generation)
        .task { apiService.start(); resumeRepositories() }
        .onChange(of: apiService.phase) { _, _ in
            resumeRepositories()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { resumeRepositories() }
            else { apiService.photos.cancel(); apiService.routines.cancel() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            guard scenePhase == .active, apiService.phase == .ready else { return }
            let ticket = apiService.access.snapshot()
            Task { @MainActor in
                guard apiService.access.snapshot() == ticket else { return }
                await apiService.routines.refresh()
            }
        }
        // Announced once here; each tab only draws the banner, so VoiceOver never hears it twice.
        .modifier(PhotoErrorAnnouncer(repository: apiService.photos))
        .onOpenURL { url in
            Task { @MainActor in
                do { try await SupabaseService.shared.handleCallback(url) }
                catch { apiService.accountError = "This link is invalid or expired. Request a new one." }
            }
        }
    }
    private func resumeRepositories() {
        guard scenePhase == .active, (apiService.phase == .ready || apiService.phase == .onboarding), let ticket = apiService.access.snapshot() else { return }
        Task { @MainActor in
            await apiService.reminders.resume(ticket: ticket)
            await apiService.reminders.refreshPermission()
        }
        apiService.photos.resume(context: apiService.persistence.container.viewContext, ticket: ticket)
        apiService.routines.resume(accountID: ticket.accountID, ticket: ticket)
    }
}

/// The profile couldn't load (spec §5 error state): what happened in words, one filled retry, sign out beneath it.
private struct AccountErrorView: View {
    let message: String
    let retry: () -> Void
    let signOut: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
                Text("Unable to open your account")
                    .font(Letterpress.display(28, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(message)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again", action: retry)
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .padding(.top, Letterpress.Space.s10)
                Button("Sign out", action: signOut)
                    .buttonStyle(.letterpress(.underline))
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.vertical, Letterpress.Space.s44)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
    }
}

/// Native tab bar (spec §6): four destinations, capture fused in the centre as an action, ink tint, unread badge on Notes.
private struct ReadyTabs: View {
    @State private var selection: AppTab = .today
    @State private var capturing = false
    @ObservedObject private var messaging = APIService.shared.messaging

    var body: some View {
        TabView(selection: Binding(get: { selection }, set: { requested in
            let route = AppTab.route(requested, from: selection)
            selection = route.selection
            if route.startsCapture { capturing = true }
        })) {
            Tab(AppTab.today.title, systemImage: AppTab.today.systemImage, value: AppTab.today) {
                DashboardViewEnhanced(selectedTab: $selection)
                    .photoErrorInset()
            }
            Tab(AppTab.record.title, systemImage: AppTab.record.systemImage, value: AppTab.record) {
                ProgressView()
                    .photoErrorInset()
            }
            Tab(AppTab.capture.title, systemImage: AppTab.capture.systemImage, value: AppTab.capture) {
                // Never selected: choosing it opens the capture sheet instead, so it needs no banner.
                Letterpress.canvas.ignoresSafeArea().accessibilityHidden(true)
            }
            .accessibilityHint("Opens the camera")
            Tab(AppTab.plan.title, systemImage: AppTab.plan.systemImage, value: AppTab.plan) {
                RoutineView()
                    .photoErrorInset()
            }
            Tab(AppTab.notes.title, systemImage: AppTab.notes.systemImage, value: AppTab.notes) {
                MessagingView()
                    .photoErrorInset()
            }
            .badge(messaging.conversation?.unreadCount ?? 0)
        }
        .tint(Letterpress.ink)
        .sheet(isPresented: $capturing) { DurablePhotoCaptureView() }
    }
}

extension View {
    /// Shows a failed local photo save above the tab bar (and the capture control) instead of over it.
    func photoErrorInset() -> some View { modifier(PhotoErrorInset(repository: APIService.shared.photos)) }
}

private struct PhotoErrorInset: ViewModifier {
    @ObservedObject var repository: PhotoRepository
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if let error = repository.lastError {
                    PhotoErrorBanner(text: error) { repository.lastError = nil }
                        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.snappy, value: repository.lastError)
        }
    }
}

/// Posts the photo-save error to VoiceOver when it changes. `onChange` (not a publisher built in `body`) so a redraw
/// never re-announces an error that is already showing.
private struct PhotoErrorAnnouncer: ViewModifier {
    @ObservedObject var repository: PhotoRepository
    func body(content: Content) -> some View {
        content.onChange(of: repository.lastError) { _, new in
            if let new { AccessibilityNotification.Announcement(new).post() }
        }
    }
}

/// Inline error in the Letterpress way: error-coloured leading rule, body text, an underlined Dismiss.
private struct PhotoErrorBanner: View {
    let text: String
    let dismiss: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s6))
            : AnyLayout(HStackLayout(alignment: .center, spacing: Letterpress.Space.s10))
        layout {
            Text(text)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Dismiss", action: dismiss)
                .buttonStyle(.letterpress(.underline))
                .accessibilityIdentifier("photoErrorDismiss")
        }
        .padding(.leading, Letterpress.Space.s14)
        .overlay(alignment: .leading) { Rectangle().fill(Letterpress.error).frame(width: 2) }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.vertical, Letterpress.Space.s10)
        .background(Letterpress.surface)
        .overlay(alignment: .top) { LetterpressRule() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("photoErrorBanner")
    }
}
