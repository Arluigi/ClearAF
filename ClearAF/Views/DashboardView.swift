import SwiftUI
import UIKit
import CoreData

struct DashboardView: View {
    @Binding var selectedTab: Int
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    HStack {
                        VStack(alignment: .leading) {
                            Text(getTimeBasedGreeting())
                                .font(.title2)
                                .fontWeight(.medium)
                            if let user = users.first {
                                Text(user.name ?? "There")
                                    .font(.largeTitle)
                                    .fontWeight(.bold)
                            }
                        }
                        Spacer()
                        Button(action: {
                            // TODO: Show notifications sheet
                        }) {
                            Image(systemName: "bell")
                                .font(.title2)
                        }
                    }
                    .padding(.horizontal)
                    
                    // Daily Photo & Skin Score Card
                    DailyPhotoCard(selectedTab: $selectedTab)
                    
                    // Daily Tasks
                    DailyTasksCard(selectedTab: $selectedTab)
                    
                    Spacer()
                }
                .padding(.top)
            }
            .navigationBarBackButtonHidden(true)
        }
    }
    
    private func getTimeBasedGreeting() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        
        switch hour {
        case 5..<12:
            return "Good morning,"
        case 12..<17:
            return "Good afternoon,"
        case 17..<22:
            return "Good evening,"
        default:
            return "Good night,"
        }
    }
}

struct DailyPhotoCard: View {
    @Binding var selectedTab: Int
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
    @FetchRequest(
        entity: SkinPhoto.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \SkinPhoto.captureDate, ascending: false)],
        animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    
    @State private var showingCamera = false
    
    var body: some View {
        VStack(spacing: 16) {
            // Skin Score Progress Bar
            VStack(spacing: 8) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Skin Score")
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Text("🔥 \(users.first?.streakCount ?? 0) day streak!")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                    Spacer()
                    Text("\(users.first?.currentSkinScore ?? 0)")
                        .font(.title2)
                        .fontWeight(.bold)
                }
                
                // Progress Bar
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color.gray.opacity(0.3))
                            .frame(height: 8)
                            .cornerRadius(4)
                        
                        Rectangle()
                            .fill(
                                LinearGradient(
                                    colors: [.purple, .blue],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: geometry.size.width * CGFloat((users.first?.currentSkinScore ?? 0)) / 100, height: 8)
                            .cornerRadius(4)
                    }
                }
                .frame(height: 8)
                
                Text("+3 from last week")
                    .font(.caption)
                    .foregroundColor(.green)
            }
            
            // Photo section - larger and centered
            VStack(spacing: 12) {
                if let todayPhoto = getTodayPhoto() {
                    // Display today's photo
                    if let photoData = todayPhoto.photoData,
                       let uiImage = UIImage(data: photoData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(maxWidth: .infinity)
                            .frame(height: 280)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                } else {
                    // Placeholder for no photo
                    Button(action: {
                        showingCamera = true
                    }) {
                        VStack(spacing: 12) {
                            Image(systemName: "camera")
                                .font(.system(size: 32))
                                .foregroundColor(.gray)
                            Text("Take your daily picture!")
                                .font(.body)
                                .foregroundColor(.gray)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 280)
                        .background(Color(UIColor.systemGray5))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                
                // Date
                Text(formatDate(Date()))
                    .font(.subheadline)
                    .foregroundColor(.gray)
                    .fontWeight(.medium)
            }
        }
        .padding()
        .background(Color(UIColor.systemGray6))
        .cornerRadius(16)
        .padding(.horizontal)
        .sheet(isPresented: $showingCamera) {
            CameraView()
        }
    }
    
    private func getTodayPhoto() -> SkinPhoto? {
        let today = Calendar.current.startOfDay(for: Date())
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today)!
        
        return photos.first { photo in
            guard let captureDate = photo.captureDate else { return false }
            return captureDate >= today && captureDate < tomorrow
        }
    }
    
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: date)
    }
}

struct DailyTasksCard: View {
    @Binding var selectedTab: Int
    @State private var morningCompleted = false
    @State private var photoCompleted = false
    @State private var eveningCompleted = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Today's Tasks")
                .font(.headline)
            
            VStack(spacing: 8) {
                TaskRow(title: "Morning Routine", isCompleted: $morningCompleted, time: "8 min", selectedTab: $selectedTab, targetTab: 2, routineType: "morning")
                TaskRow(title: "Take Progress Photo", isCompleted: $photoCompleted, time: "2 min", selectedTab: $selectedTab, targetTab: -1, isCameraTask: true)
                TaskRow(title: "Evening Routine", isCompleted: $eveningCompleted, time: "12 min", selectedTab: $selectedTab, targetTab: 2, routineType: "evening")
            }
        }
        .padding()
        .background(Color(UIColor.systemGray6))
        .cornerRadius(16)
        .padding(.horizontal)
        .onTapGesture {
            selectedTab = 3 // Navigate to Routines
        }
    }
}

struct TaskRow: View {
    let title: String
    @Binding var isCompleted: Bool
    let time: String
    @Binding var selectedTab: Int
    let targetTab: Int
    let routineType: String?
    let isCameraTask: Bool
    @State private var showingCamera = false
    
    init(title: String, isCompleted: Binding<Bool>, time: String, selectedTab: Binding<Int>, targetTab: Int, routineType: String? = nil, isCameraTask: Bool = false) {
        self.title = title
        self._isCompleted = isCompleted
        self.time = time
        self._selectedTab = selectedTab
        self.targetTab = targetTab
        self.routineType = routineType
        self.isCameraTask = isCameraTask
    }
    
    var body: some View {
        HStack {
            Button(action: {
                isCompleted.toggle()
            }) {
                Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isCompleted ? .green : .gray)
                    .font(.title2)
            }
            
            Button(action: {
                if isCameraTask {
                    showingCamera = true
                } else {
                    if let routineType = routineType {
                        // Post notification to set routine tab
                        NotificationCenter.default.post(name: NSNotification.Name("SetRoutineTab"), object: routineType)
                    }
                    selectedTab = targetTab
                }
            }) {
                VStack(alignment: .leading) {
                    Text(title)
                        .strikethrough(isCompleted)
                        .foregroundColor(.primary)
                    Text(time)
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }
            .buttonStyle(PlainButtonStyle())
            
            Spacer()
        }
        .sheet(isPresented: $showingCamera) {
            CameraView()
        }
    }
}


#Preview {
    DashboardView(selectedTab: .constant(0))
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}