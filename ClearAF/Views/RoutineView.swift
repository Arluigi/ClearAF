import SwiftUI
import UIKit
import CoreData

struct RoutineView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: Routine.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \Routine.timeOfDay, ascending: true)],
        animation: .default)
    private var routines: FetchedResults<Routine>
    
    @State private var selectedTimeOfDay = "morning"
    let initialTimeOfDay: String?
    
    init(initialTimeOfDay: String? = nil) {
        self.initialTimeOfDay = initialTimeOfDay
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.backgroundSecondary.ignoresSafeArea()
                
                VStack(spacing: .spaceXL) {
                    // Enhanced header
                    HStack {
                        Text("Routines")
                            .font(.displayMedium)
                            .foregroundColor(.textPrimary)
                        Spacer()
                    }
                    .padding(.horizontal, .spaceXL)
                    
                    // Enhanced segmented control
                    EnhancedSegmentedControl(
                        selection: Binding(
                            get: { selectedTimeOfDay == "morning" ? 0 : 1 },
                            set: { selectedTimeOfDay = $0 == 0 ? "morning" : "evening" }
                        ),
                        options: ["Morning", "Evening"]
                    )
                    .padding(.horizontal, .spaceXL)
                    
                    let filteredRoutines = routines.filter { $0.timeOfDay == selectedTimeOfDay }
                    
                    if filteredRoutines.isEmpty {
                        EnhancedEmptyRoutineView(timeOfDay: selectedTimeOfDay)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: .spaceLG) {
                                ForEach(filteredRoutines, id: \.id) { routine in
                                    EnhancedRoutineCard(routine: routine)
                                }
                            }
                            .padding(.horizontal, .spaceXL)
                            .padding(.bottom, 100)
                        }
                    }
                    
                    Spacer()
                }
                .padding(.top, .spaceXL)
                
                // Enhanced Floating Action Button
                EnhancedRoutineFloatingActionButton(onTap: createSampleRoutine)
            }
            .navigationBarHidden(true)
            .navigationBarItems(trailing: 
                Button(action: createSampleRoutine) {
                    Image(systemName: "plus")
                }
            )
            .onAppear {
                if let initialTime = initialTimeOfDay {
                    selectedTimeOfDay = initialTime
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("SetRoutineTab"))) { notification in
                if let routineType = notification.object as? String {
                    selectedTimeOfDay = routineType
                }
            }
        }
    }
    
    private func createSampleRoutine() {
        let newRoutine = Routine(context: viewContext)
        newRoutine.id = UUID()
        newRoutine.name = "\(selectedTimeOfDay.capitalized) Routine"
        newRoutine.timeOfDay = selectedTimeOfDay
        newRoutine.isActive = true
        newRoutine.completedToday = false
        
        // Create steps based on the templates shown in empty state
        let steps: [(String, String, String, Int)]
        
        if selectedTimeOfDay == "morning" {
            steps = [
                ("Gentle Cleanser", "Face Wash", "Gently massage onto damp skin for 30 seconds", 30),
                ("Moisturizer", "Daily Moisturizer", "Apply evenly to face and neck", 15),
                ("SPF 30+", "Sunscreen", "Apply liberally and evenly to all exposed areas", 15)
            ]
        } else {
            steps = [
                ("Cleanser", "Face Wash", "Gently massage onto damp skin for 30 seconds", 30),
                ("Treatment Serum", "Night Serum", "Apply 2-3 drops and gently pat in", 30),
                ("Night Moisturizer", "Night Cream", "Apply generously for overnight hydration", 15)
            ]
        }
        
        for (index, stepData) in steps.enumerated() {
            let step = RoutineStep(context: viewContext)
            step.id = UUID()
            step.productName = stepData.0
            step.productType = stepData.1
            step.instructions = stepData.2
            step.duration = Int16(stepData.3)
            step.orderIndex = Int16(index)
            step.isCompleted = false
            step.routine = newRoutine
        }
        
        do {
            try viewContext.save()
        } catch {
            print("Error creating routine: \(error)")
        }
    }
}

struct EmptyRoutineView: View {
    let timeOfDay: String
    
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Image(systemName: timeOfDay == "morning" ? "sun.max" : "moon")
                .font(.system(size: 60))
                .foregroundColor(.gray)
            
            Text("No \(timeOfDay) routine yet")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Create your first \(timeOfDay) skincare routine to get started")
                .font(.body)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            
            Spacer()
        }
    }
}

struct RoutineCard: View {
    @ObservedObject var routine: Routine
    @Environment(\.managedObjectContext) private var viewContext
    @State private var showingEditRoutine = false
    @State private var refreshTrigger = false
    @State private var showAllSteps = false
    
    var steps: [RoutineStep] {
        (routine.steps?.allObjects as? [RoutineStep] ?? [])
            .sorted { $0.orderIndex < $1.orderIndex }
    }
    
    var completedSteps: Int {
        _ = refreshTrigger // Force refresh when this changes
        return steps.filter { $0.isCompleted }.count
    }
    
    var totalDuration: Int {
        steps.reduce(0) { $0 + Int($1.duration) }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading) {
                    Text(routine.name ?? "Routine")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("\(steps.count) steps • \(totalDuration) sec")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                Spacer()
                
                Button(action: {
                    showingEditRoutine = true
                }) {
                    Text("Edit")
                        .font(.callout)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.gray.opacity(0.7))
                        .cornerRadius(16)
                }
                
                if routine.completedToday {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                        .font(.title2)
                } else {
                    Button(action: startRoutine) {
                        Text("Start")
                            .font(.headline)
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 8)
                            .background(
                                LinearGradient(
                                    colors: [.purple, .blue],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .cornerRadius(20)
                    }
                }
            }
            
            // Progress Bar
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Progress")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Spacer()
                    Text("\(completedSteps)/\(steps.count)")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                SwiftUI.ProgressView(value: Double(completedSteps), total: Double(steps.count))
                    .progressViewStyle(LinearProgressViewStyle(tint: .purple))
            }
            
            // Steps Preview
            VStack(spacing: 8) {
                ForEach(showAllSteps ? steps : Array(steps.prefix(3)), id: \.id) { step in
                    RoutineStepRow(step: step) {
                        refreshTrigger.toggle()
                    }
                }
                
                if steps.count > 3 && !showAllSteps {
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            showAllSteps = true
                        }
                    }) {
                        HStack {
                            Text("+ \(steps.count - 3) more steps")
                                .font(.caption)
                                .foregroundColor(.blue)
                            Image(systemName: "chevron.down")
                                .font(.caption2)
                                .foregroundColor(.blue)
                        }
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                
                if showAllSteps && steps.count > 3 {
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            showAllSteps = false
                        }
                    }) {
                        HStack {
                            Text("Show less")
                                .font(.caption)
                                .foregroundColor(.blue)
                            Image(systemName: "chevron.up")
                                .font(.caption2)
                                .foregroundColor(.blue)
                        }
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
        .padding()
        .background(Color(UIColor.systemGray6))
        .cornerRadius(16)
        .sheet(isPresented: $showingEditRoutine) {
            EditRoutineView(routine: routine)
        }
    }
    
    private func startRoutine() {
        // Reset all steps
        for step in steps {
            step.isCompleted = false
        }
        
        do {
            try viewContext.save()
        } catch {
            print("Error starting routine: \(error)")
        }
    }
}

struct RoutineStepRow: View {
    @ObservedObject var step: RoutineStep
    @Environment(\.managedObjectContext) private var viewContext
    let onToggle: () -> Void
    
    var body: some View {
        HStack {
            Button(action: toggleCompletion) {
                Image(systemName: step.isCompleted ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(step.isCompleted ? .green : .gray)
                    .font(.title3)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(step.productName ?? "Step")
                    .font(.body)
                    .strikethrough(step.isCompleted)
                
                Text(step.productType ?? "")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            Text("\(step.duration)s")
                .font(.caption)
                .foregroundColor(.gray)
        }
    }
    
    private func toggleCompletion() {
        withAnimation(.easeInOut(duration: 0.2)) {
            step.isCompleted.toggle()
        }
        
        // Notify parent to refresh
        onToggle()
        
        // Check if all steps are completed
        let routine = step.routine
        let allSteps = (routine?.steps?.allObjects as? [RoutineStep] ?? [])
        let allCompleted = allSteps.allSatisfy { $0.isCompleted }
        
        if allCompleted {
            routine?.completedToday = true
        }
        
        do {
            try viewContext.save()
        } catch {
            print("Error updating step: \(error)")
        }
    }
}

struct EditRoutineView: View {
    let routine: Routine
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    @State private var routineName: String = ""
    @State private var showingDeleteAlert = false
    @State private var editableSteps: [EditableStep] = []
    @State private var showingAddStep = false
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Routine Name Section
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Routine Name")
                                .font(.headline)
                                .foregroundColor(.primary)
                            Spacer()
                        }
                        
                        TextField("Enter routine name", text: $routineName)
                            .font(.body)
                            .standardTextField()
                    }
                    .padding(.horizontal)
                    
                    // Steps Section
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Text("Steps (\(editableSteps.count))")
                                .font(.headline)
                                .foregroundColor(.primary)
                            Spacer()
                            Button(action: { showingAddStep = true }) {
                                HStack(spacing: 4) {
                                    Image(systemName: "plus")
                                        .font(.caption)
                                    Text("Add Step")
                                        .font(.caption)
                                        .fontWeight(.medium)
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(
                                    LinearGradient(
                                        colors: [.purple, .blue],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .cornerRadius(16)
                            }
                        }
                        .padding(.horizontal)
                        
                        if editableSteps.isEmpty {
                            VStack(spacing: 12) {
                                Image(systemName: "list.bullet.clipboard")
                                    .font(.system(size: 40))
                                    .foregroundColor(.gray)
                                
                                Text("No steps yet")
                                    .font(.headline)
                                    .foregroundColor(.gray)
                                
                                Text("Add your first step to get started")
                                    .font(.body)
                                    .foregroundColor(.gray)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                        } else {
                            List {
                                ForEach(editableSteps.indices, id: \.self) { index in
                                    EditableStepRow(
                                        step: $editableSteps[index],
                                        stepNumber: index + 1,
                                        onDelete: { deleteStep(at: index) }
                                    )
                                    .listRowBackground(Color.clear)
                                    .listRowSeparator(.hidden)
                                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                                }
                                .onMove(perform: moveSteps)
                            }
                            .listStyle(PlainListStyle())
                            .environment(\.editMode, .constant(.active))
                            .frame(height: CGFloat(editableSteps.count * 100))
                        }
                    }
                    
                    Spacer(minLength: 40)
                    
                    // Delete Button
                    Button(action: {
                        showingDeleteAlert = true
                    }) {
                        HStack {
                            Image(systemName: "trash")
                                .font(.headline)
                            Text("Delete Routine")
                                .font(.headline)
                                .fontWeight(.medium)
                        }
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .navigationTitle("Edit Routine")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() },
                trailing: Button("Save") { saveChanges() }
                    .fontWeight(.semibold)
                    .foregroundColor(.purple)
            )
            .onAppear {
                loadEditableSteps()
                routineName = routine.name ?? ""
            }
            .alert("Delete Routine", isPresented: $showingDeleteAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Delete", role: .destructive) { deleteRoutine() }
            } message: {
                Text("Are you sure you want to delete this routine? This action cannot be undone.")
            }
            .sheet(isPresented: $showingAddStep) {
                AddStepView { newStep in
                    editableSteps.append(newStep)
                }
            }
        }
    }
    
    private func loadEditableSteps() {
        let steps = (routine.steps?.allObjects as? [RoutineStep] ?? [])
            .sorted { $0.orderIndex < $1.orderIndex }
        
        editableSteps = steps.map { step in
            EditableStep(
                id: step.id ?? UUID(),
                productName: step.productName ?? "",
                productType: step.productType ?? "",
                instructions: step.instructions ?? "",
                duration: Int(step.duration),
                originalStep: step
            )
        }
    }
    
    private func moveSteps(from source: IndexSet, to destination: Int) {
        editableSteps.move(fromOffsets: source, toOffset: destination)
    }
    
    private func deleteStep(at index: Int) {
        editableSteps.remove(at: index)
    }
    
    private func saveChanges() {
        // Update routine name
        routine.name = routineName
        
        // Delete old steps
        if let oldSteps = routine.steps?.allObjects as? [RoutineStep] {
            for step in oldSteps {
                viewContext.delete(step)
            }
        }
        
        // Create new steps with updated order
        for (index, editableStep) in editableSteps.enumerated() {
            let step = RoutineStep(context: viewContext)
            step.id = editableStep.id
            step.productName = editableStep.productName
            step.productType = editableStep.productType
            step.instructions = editableStep.instructions
            step.duration = Int16(editableStep.duration)
            step.orderIndex = Int16(index)
            step.isCompleted = false
            step.routine = routine
        }
        
        do {
            try viewContext.save()
            dismiss()
        } catch {
            print("Error saving routine: \(error)")
        }
    }
    
    private func deleteRoutine() {
        viewContext.delete(routine)
        
        do {
            try viewContext.save()
            dismiss()
        } catch {
            print("Error deleting routine: \(error)")
        }
    }
}

struct EditableStep: Identifiable {
    let id: UUID
    var productName: String
    var productType: String
    var instructions: String
    var duration: Int
    let originalStep: RoutineStep?
    
    init(id: UUID = UUID(), productName: String = "", productType: String = "", instructions: String = "", duration: Int = 30, originalStep: RoutineStep? = nil) {
        self.id = id
        self.productName = productName
        self.productType = productType
        self.instructions = instructions
        self.duration = duration
        self.originalStep = originalStep
    }
}

struct EditableStepRow: View {
    @Binding var step: EditableStep
    let stepNumber: Int
    let onDelete: () -> Void
    @State private var isExpanded = false
    @State private var showingTimePicker = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Main row
            HStack(spacing: 12) {
                // Step number
                Text("\(stepNumber)")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .frame(width: 24, height: 24)
                    .background(
                        LinearGradient(
                            colors: [.purple, .blue],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(Circle())
                
                // Content - expanded area
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Product name", text: $step.productName)
                        .font(.body)
                        .fontWeight(.medium)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.backgroundSecondary.opacity(0.5))
                        .cornerRadius(6)
                    
                    TextField("Product type", text: $step.productType)
                        .font(.caption)
                        .foregroundColor(.gray)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.backgroundSecondary.opacity(0.3))
                        .cornerRadius(6)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                // Right side controls - moved further right
                HStack(spacing: 12) {
                    // Duration - clickable number
                    Button(action: {
                        showingTimePicker = true
                    }) {
                        Text("\(step.duration)s")
                            .font(.callout)
                            .fontWeight(.medium)
                            .foregroundColor(.purple)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.purple.opacity(0.1))
                            .cornerRadius(8)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .fixedSize()
                    
                    // Instructions button - more obvious
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            isExpanded.toggle()
                        }
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "doc.text")
                                .font(.caption)
                            Text("Notes")
                                .font(.caption)
                        }
                        .foregroundColor(isExpanded ? .purple : .gray)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(isExpanded ? Color.purple.opacity(0.1) : Color.clear)
                        .cornerRadius(6)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .fixedSize()
                }
            }
            .padding(16)
            .background(Color(UIColor.systemGray6))
            .cornerRadius(12)
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
            }
            
            // Expanded section for instructions
            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Instructions")
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundColor(.gray)
                        
                        TextField("How to use this product...", text: $step.instructions, axis: .vertical)
                            .lineLimit(2...4)
                            .font(.body)
                            .standardTextField()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
                .background(Color(UIColor.systemGray6))
                .cornerRadius(12)
                .padding(.top, -12)
            }
        }
        .sheet(isPresented: $showingTimePicker) {
            TimePickerView(duration: $step.duration)
        }
    }
}

struct TimePickerView: View {
    @Binding var duration: Int
    @Environment(\.dismiss) private var dismiss
    @State private var selectedMinutes: Int = 0
    @State private var selectedSeconds: Int = 0
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                Text("Set Duration")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .padding(.top)
                
                HStack(spacing: 0) {
                    // Minutes picker
                    Picker("Minutes", selection: $selectedMinutes) {
                        ForEach(0..<10, id: \.self) { minute in
                            Text("\(minute)")
                                .font(.title2)
                                .tag(minute)
                        }
                    }
                    .pickerStyle(WheelPickerStyle())
                    .frame(width: 80)
                    .clipped()
                    
                    Text("min")
                        .font(.title3)
                        .foregroundColor(.gray)
                        .padding(.horizontal, 8)
                    
                    // Seconds picker
                    Picker("Seconds", selection: $selectedSeconds) {
                        ForEach(Array(stride(from: 0, through: 55, by: 5)), id: \.self) { second in
                            Text("\(second)")
                                .font(.title2)
                                .tag(second)
                        }
                    }
                    .pickerStyle(WheelPickerStyle())
                    .frame(width: 80)
                    .clipped()
                    
                    Text("sec")
                        .font(.title3)
                        .foregroundColor(.gray)
                        .padding(.horizontal, 8)
                }
                .padding()
                .background(Color(UIColor.systemGray6))
                .cornerRadius(16)
                
                Spacer()
            }
            .padding()
            .navigationTitle("Duration")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() },
                trailing: Button("Done") {
                    duration = (selectedMinutes * 60) + selectedSeconds
                    dismiss()
                }
                .fontWeight(.semibold)
                .foregroundColor(.purple)
            )
            .onAppear {
                selectedMinutes = duration / 60
                selectedSeconds = duration % 60
            }
        }
    }
}

struct AddStepView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var productName = ""
    @State private var productType = ""
    @State private var instructions = ""
    @State private var duration = 30
    let onAdd: (EditableStep) -> Void
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Product Name")
                                .font(.headline)
                            TextField("e.g., Gentle Cleanser", text: $productName)
                                .font(.body)
                                .standardTextField()
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Product Type")
                                .font(.headline)
                            TextField("e.g., Face Wash, Moisturizer", text: $productType)
                                .font(.body)
                                .standardTextField()
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Instructions")
                                .font(.headline)
                            TextField("How to use this product...", text: $instructions, axis: .vertical)
                                .lineLimit(3...6)
                                .font(.body)
                                .standardTextField()
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Duration")
                                .font(.headline)
                            
                            HStack {
                                Button(action: {
                                    if duration > 5 {
                                        duration -= 5
                                    }
                                }) {
                                    Image(systemName: "minus.circle.fill")
                                        .font(.title2)
                                        .foregroundColor(.gray)
                                }
                                
                                Spacer()
                                
                                Text("\(duration) seconds")
                                    .font(.title3)
                                    .fontWeight(.medium)
                                
                                Spacer()
                                
                                Button(action: {
                                    duration += 5
                                }) {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.title2)
                                        .foregroundColor(.purple)
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .padding(.horizontal)
                    
                    Spacer()
                }
                .padding(.vertical)
            }
            .navigationTitle("Add Step")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() },
                trailing: Button("Add") {
                    let newStep = EditableStep(
                        productName: productName,
                        productType: productType,
                        instructions: instructions,
                        duration: duration
                    )
                    onAdd(newStep)
                    dismiss()
                }
                .fontWeight(.semibold)
                .foregroundColor(.purple)
                .disabled(productName.isEmpty)
            )
        }
    }
}

// MARK: - Enhanced Routine Components

struct EnhancedEmptyRoutineView: View {
    let timeOfDay: String
    
    var body: some View {
        VStack(spacing: .spaceXL) {
            Spacer()
            
            VStack(spacing: .spaceLG) {
                // Consistent icon design with other empty states
                ZStack {
                    Circle()
                        .fill(Color.primaryPurple.opacity(0.2))
                        .frame(width: 120, height: 120)
                    
                    Image(systemName: timeOfDay == "morning" ? "sun.max" : "moon")
                        .font(.system(size: 40))
                        .foregroundColor(.primaryPurple)
                }
                
                VStack(spacing: .spaceMD) {
                    Text("No \(timeOfDay) routine yet")
                        .font(.headlineLarge)
                        .foregroundColor(.textPrimary)
                        .fontWeight(.semibold)
                    
                    Text("Build a consistent \(timeOfDay) skincare routine")
                        .font(.bodyLarge)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, .spaceXL)
                }
            }
            
            // Template suggestions
            VStack(spacing: .spaceMD) {
                Text("💡 Popular \(timeOfDay) routine")
                    .font(.headlineSmall)
                    .foregroundColor(.textPrimary)
                    .fontWeight(.medium)
                
                VStack(spacing: .spaceXS) {
                    if timeOfDay == "morning" {
                        RoutineStepTemplate(step: "1", name: "Gentle Cleanser", duration: "30s")
                        RoutineStepTemplate(step: "2", name: "Moisturizer", duration: "15s")
                        RoutineStepTemplate(step: "3", name: "SPF 30+", duration: "15s")
                    } else {
                        RoutineStepTemplate(step: "1", name: "Cleanser", duration: "30s")
                        RoutineStepTemplate(step: "2", name: "Treatment Serum", duration: "30s")
                        RoutineStepTemplate(step: "3", name: "Night Moisturizer", duration: "15s")
                    }
                }
            }
            .wellnessCard(style: .flat)
            .padding(.horizontal, .spaceXL)
            
            Spacer()
        }
    }
}

// Routine Step Template Component
struct RoutineStepTemplate: View {
    let step: String
    let name: String
    let duration: String
    
    var body: some View {
        HStack(spacing: .spaceMD) {
            // Step number
            Text(step)
                .font(.captionLarge)
                .fontWeight(.semibold)
                .foregroundColor(.white)
                .frame(width: 20, height: 20)
                .background(Color.primaryPurple)
                .clipShape(Circle())
            
            Text(name)
                .font(.bodyMedium)
                .foregroundColor(.textPrimary)
            
            Spacer()
            
            Text(duration)
                .font(.captionLarge)
                .foregroundColor(.textTertiary)
        }
    }
}

struct EnhancedRoutineCard: View {
    let routine: Routine
    @State private var showingEditRoutine = false
    @State private var showingRoutineSession = false
    @State private var showAllSteps = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: .spaceXS) {
                    Text(routine.name ?? "Routine")
                        .font(.headlineLarge)
                        .foregroundColor(.textPrimary)
                    
                    HStack(spacing: .spaceXS) {
                        Image(systemName: routine.timeOfDay == "morning" ? "sun.max" : "moon")
                            .foregroundColor(.primaryPurple)
                            .font(.caption)
                        Text("\(routine.timeOfDay?.capitalized ?? "") Routine")
                            .font(.captionLarge)
                            .foregroundColor(.textSecondary)
                    }
                }
                
                Spacer()
                
                // Edit button
                Button(action: {
                    HapticManager.light()
                    showingEditRoutine = true
                }) {
                    Text("Edit")
                        .font(.captionLarge)
                        .fontWeight(.medium)
                        .foregroundColor(.primaryPurple)
                        .padding(.horizontal, .spaceMD)
                        .padding(.vertical, .spaceXS)
                        .background(Color.primaryPurple.opacity(0.2))
                        .clipShape(Capsule())
                }
                
                // Completion status
                if routine.completedToday {
                    HStack(spacing: .spaceXS) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.scoreExcellent)
                        Text("Complete")
                            .font(.captionLarge)
                            .foregroundColor(.scoreExcellent)
                            .fontWeight(.medium)
                    }
                } else {
                    Text("Ready")
                        .font(.captionLarge)
                        .foregroundColor(.primaryPurple)
                        .fontWeight(.medium)
                }
            }
            
            // Steps preview
            if let steps = routine.steps?.allObjects as? [RoutineStep] {
                let sortedSteps = steps.sorted { $0.orderIndex < $1.orderIndex }
                
                VStack(spacing: .spaceSM) {
                    ForEach(showAllSteps ? sortedSteps : Array(sortedSteps.prefix(3)), id: \.id) { step in
                        HStack(spacing: .spaceMD) {
                            Image(systemName: step.isCompleted ? "checkmark.circle.fill" : "circle")
                                .foregroundColor(step.isCompleted ? .scoreExcellent : .textTertiary)
                                .font(.system(size: 16))
                            
                            Text(step.productName ?? "Step")
                                .font(.bodyMedium)
                                .foregroundColor(.textPrimary)
                                .strikethrough(step.isCompleted)
                            
                            Spacer()
                            
                            Text("\(step.duration) sec")
                                .font(.captionLarge)
                                .foregroundColor(.textSecondary)
                        }
                    }
                    
                    if sortedSteps.count > 3 && !showAllSteps {
                        Button(action: {
                            HapticManager.light()
                            withAnimation(.gentle) {
                                showAllSteps = true
                            }
                        }) {
                            HStack(spacing: .spaceXS) {
                                Text("+ \(sortedSteps.count - 3) more steps")
                                    .font(.captionLarge)
                                    .foregroundColor(.primaryPurple)
                                Image(systemName: "chevron.down")
                                    .font(.caption2)
                                    .foregroundColor(.primaryPurple)
                            }
                            .padding(.leading, 32)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                    
                    if showAllSteps && sortedSteps.count > 3 {
                        Button(action: {
                            HapticManager.light()
                            withAnimation(.gentle) {
                                showAllSteps = false
                            }
                        }) {
                            HStack(spacing: .spaceXS) {
                                Text("Show less")
                                    .font(.captionLarge)
                                    .foregroundColor(.primaryPurple)
                                Image(systemName: "chevron.up")
                                    .font(.caption2)
                                    .foregroundColor(.primaryPurple)
                            }
                            .padding(.leading, 32)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }
            }
            
            // Action button
            Button(action: {
                HapticManager.medium()
                showingRoutineSession = true
            }) {
                HStack {
                    Image(systemName: "play.fill")
                        .font(.system(size: 14))
                    Text(routine.completedToday ? "Review Routine" : "Start Routine")
                        .fontWeight(.medium)
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, .spaceMD)
                .background(Color.primaryGradient)
                .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            }
        }
        .wellnessCard(style: .elevated)
        .sheet(isPresented: $showingEditRoutine) {
            EditRoutineView(routine: routine)
        }
        .fullScreenCover(isPresented: $showingRoutineSession) {
            RoutineSessionView(routine: routine)
        }
    }
}

// MARK: - Routine Session View

struct RoutineSessionView: View {
    let routine: Routine
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    @State private var currentStepIndex = 0
    @State private var timeRemaining = 0
    @State private var isTimerRunning = false
    @State private var showingCompletion = false
    @State private var timer: Timer?
    
    private var steps: [RoutineStep] {
        (routine.steps?.allObjects as? [RoutineStep] ?? [])
            .sorted { $0.orderIndex < $1.orderIndex }
    }
    
    private var currentStep: RoutineStep? {
        guard currentStepIndex < steps.count else { return nil }
        return steps[currentStepIndex]
    }
    
    private var progress: Double {
        guard !steps.isEmpty else { return 0 }
        return Double(currentStepIndex) / Double(steps.count)
    }
    
    var body: some View {
        ZStack {
            Color.backgroundPrimary.ignoresSafeArea()
            
            if showingCompletion {
                RoutineCompletionView(routine: routine) {
                    dismiss()
                }
            } else {
                VStack(spacing: .spaceXXL) {
                    // Header with progress
                    VStack(spacing: .spaceLG) {
                        HStack {
                            Button(action: {
                                HapticManager.light()
                                stopTimer()
                                dismiss()
                            }) {
                                Image(systemName: "xmark")
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundColor(.textSecondary)
                                    .frame(width: 32, height: 32)
                                    .background(Color.backgroundSecondary)
                                    .clipShape(Circle())
                            }
                            
                            Spacer()
                            
                            Text(routine.name ?? "Routine")
                                .font(.headlineLarge)
                                .foregroundColor(.textPrimary)
                            
                            Spacer()
                            
                            // Step counter
                            Text("\(currentStepIndex + 1)/\(steps.count)")
                                .font(.captionLarge)
                                .foregroundColor(.textSecondary)
                                .padding(.horizontal, .spaceMD)
                                .padding(.vertical, .spaceXS)
                                .background(Color.backgroundSecondary)
                                .clipShape(Capsule())
                        }
                        
                        // Progress bar
                        SwiftUI.ProgressView(value: progress)
                            .progressViewStyle(LinearProgressViewStyle(tint: .primaryPurple))
                            .scaleEffect(y: 2)
                    }
                    .padding(.horizontal, .spaceXXL)
                    .padding(.top, .spaceXL)
                    
                    // Timer circle
                    if let step = currentStep {
                        VStack(spacing: .spaceXXL) {
                            // Large timer display
                            ZStack {
                                Circle()
                                    .stroke(Color.backgroundSecondary, lineWidth: 8)
                                    .frame(width: 200, height: 200)
                                
                                Circle()
                                    .trim(from: 0, to: timerProgress)
                                    .stroke(Color.primaryGradient, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                                    .frame(width: 200, height: 200)
                                    .rotationEffect(.degrees(-90))
                                    .animation(.linear(duration: 1), value: timerProgress)
                                
                                VStack(spacing: .spaceSM) {
                                    Text(timeString)
                                        .font(.displayLarge)
                                        .foregroundColor(.textPrimary)
                                        .monospacedDigit()
                                    
                                    Text(isTimerRunning ? "In Progress" : "Ready")
                                        .font(.captionLarge)
                                        .foregroundColor(.textSecondary)
                                }
                            }
                            
                            // Step info card
                            VStack(alignment: .leading, spacing: .spaceLG) {
                                VStack(alignment: .leading, spacing: .spaceSM) {
                                    Text(step.productName ?? "Step")
                                        .font(.headlineLarge)
                                        .foregroundColor(.textPrimary)
                                    
                                    Text(step.productType ?? "")
                                        .font(.bodyLarge)
                                        .foregroundColor(.textSecondary)
                                }
                                
                                if let instructions = step.instructions, !instructions.isEmpty {
                                    Text(instructions)
                                        .font(.bodyMedium)
                                        .foregroundColor(.textPrimary)
                                        .lineLimit(nil)
                                }
                                
                                HStack {
                                    Image(systemName: "clock")
                                        .foregroundColor(.primaryPurple)
                                    Text("\(step.duration) seconds")
                                        .font(.bodyMedium)
                                        .foregroundColor(.textSecondary)
                                }
                            }
                            .wellnessCard(style: .elevated)
                        }
                    }
                    
                    Spacer()
                    
                    // Control buttons
                    VStack(spacing: .spaceLG) {
                        // Timer control
                        Button(action: toggleTimer) {
                            HStack(spacing: .spaceMD) {
                                Image(systemName: isTimerRunning ? "pause.fill" : "play.fill")
                                    .font(.system(size: 18))
                                Text(isTimerRunning ? "Pause" : "Start")
                                    .font(.headlineMedium)
                                    .fontWeight(.semibold)
                            }
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, .spaceLG)
                            .background(Color.primaryGradient)
                            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                        }
                        .disabled(timeRemaining == 0 && !isTimerRunning)
                        
                        // Navigation buttons
                        HStack(spacing: .spaceLG) {
                            // Previous button
                            Button(action: previousStep) {
                                HStack {
                                    Image(systemName: "chevron.left")
                                    Text("Previous")
                                }
                                .font(.headlineMedium)
                                .foregroundColor(.primaryPurple)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, .spaceLG)
                                .background(Color.backgroundSecondary)
                                .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                            }
                            .disabled(currentStepIndex == 0)
                            .opacity(currentStepIndex == 0 ? 0.5 : 1.0)
                            
                            // Next/Complete button
                            Button(action: nextStep) {
                                HStack {
                                    Text(currentStepIndex == steps.count - 1 ? "Complete" : "Next")
                                    if currentStepIndex < steps.count - 1 {
                                        Image(systemName: "chevron.right")
                                    }
                                }
                                .font(.headlineMedium)
                                .foregroundColor(.primaryPurple)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, .spaceLG)
                                .background(Color.backgroundSecondary)
                                .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                            }
                        }
                    }
                    .padding(.horizontal, .spaceXXL)
                    .padding(.bottom, .spaceXXL)
                }
            }
        }
        .onAppear {
            setupTimer()
        }
        .onDisappear {
            stopTimer()
        }
    }
    
    private var timerProgress: Double {
        guard let step = currentStep, step.duration > 0 else { return 0 }
        let elapsed = Double(Int(step.duration) - timeRemaining)
        return elapsed / Double(step.duration)
    }
    
    private var timeString: String {
        let minutes = timeRemaining / 60
        let seconds = timeRemaining % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
    
    private func setupTimer() {
        guard let step = currentStep else { return }
        timeRemaining = Int(step.duration)
    }
    
    private func toggleTimer() {
        HapticManager.medium()
        
        if isTimerRunning {
            stopTimer()
        } else {
            startTimer()
        }
    }
    
    private func startTimer() {
        isTimerRunning = true
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            if timeRemaining > 0 {
                timeRemaining -= 1
            } else {
                timerCompleted()
            }
        }
    }
    
    private func stopTimer() {
        isTimerRunning = false
        timer?.invalidate()
        timer = nil
    }
    
    private func timerCompleted() {
        stopTimer()
        HapticManager.success()
        
        // Mark step as completed
        if let step = currentStep {
            step.isCompleted = true
        }
        
        // Auto-advance to next step after a brief delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            nextStep()
        }
    }
    
    private func nextStep() {
        HapticManager.light()
        stopTimer()
        
        if currentStepIndex < steps.count - 1 {
            currentStepIndex += 1
            setupTimer()
        } else {
            // Complete routine
            completeRoutine()
        }
    }
    
    private func previousStep() {
        HapticManager.light()
        stopTimer()
        
        if currentStepIndex > 0 {
            currentStepIndex -= 1
            setupTimer()
        }
    }
    
    private func completeRoutine() {
        // Mark all steps as completed
        for step in steps {
            step.isCompleted = true
        }
        
        // Mark routine as completed today
        routine.completedToday = true
        
        // Save changes
        do {
            try viewContext.save()
        } catch {
            print("Error completing routine: \(error)")
        }
        
        // Show completion view
        withAnimation(.gentle) {
            showingCompletion = true
        }
    }
}

// MARK: - Routine Completion View

struct RoutineCompletionView: View {
    let routine: Routine
    let onDismiss: () -> Void
    @State private var showingConfetti = false
    
    var body: some View {
        VStack(spacing: .spaceHuge) {
            Spacer()
            
            // Success animation
            VStack(spacing: .spaceXXL) {
                ZStack {
                    Circle()
                        .fill(Color.scoreExcellent.opacity(0.2))
                        .frame(width: 160, height: 160)
                        .scaleEffect(showingConfetti ? 1.2 : 1.0)
                        .animation(.easeOut(duration: 0.6), value: showingConfetti)
                    
                    Circle()
                        .fill(Color.scoreExcellent.opacity(0.3))
                        .frame(width: 120, height: 120)
                        .scaleEffect(showingConfetti ? 1.1 : 1.0)
                        .animation(.easeOut(duration: 0.4).delay(0.1), value: showingConfetti)
                    
                    Image(systemName: "checkmark")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundColor(.scoreExcellent)
                        .scaleEffect(showingConfetti ? 1.0 : 0.5)
                        .animation(.bouncy.delay(0.2), value: showingConfetti)
                }
                
                VStack(spacing: .spaceLG) {
                    Text("Routine Complete!")
                        .font(.displayMedium)
                        .foregroundColor(.textPrimary)
                        .opacity(showingConfetti ? 1.0 : 0.0)
                        .animation(.gentle.delay(0.3), value: showingConfetti)
                    
                    Text("Great job completing your \(routine.name ?? "routine"). Your skin will thank you!")
                        .font(.bodyLarge)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, .spaceHuge)
                        .opacity(showingConfetti ? 1.0 : 0.0)
                        .animation(.gentle.delay(0.4), value: showingConfetti)
                }
                
                // Stats
                if let steps = routine.steps?.allObjects as? [RoutineStep] {
                    let totalDuration = steps.reduce(0) { $0 + Int($1.duration) }
                    
                    VStack(spacing: .spaceMD) {
                        HStack(spacing: .spaceHuge) {
                            VStack {
                                Text("\(steps.count)")
                                    .font(.displaySmall)
                                    .foregroundColor(.primaryPurple)
                                Text("Steps")
                                    .font(.captionLarge)
                                    .foregroundColor(.textSecondary)
                            }
                            
                            VStack {
                                Text("\(totalDuration / 60)m \(totalDuration % 60)s")
                                    .font(.displaySmall)
                                    .foregroundColor(.primaryPurple)
                                Text("Duration")
                                    .font(.captionLarge)
                                    .foregroundColor(.textSecondary)
                            }
                        }
                    }
                    .wellnessCard(style: .flat)
                    .opacity(showingConfetti ? 1.0 : 0.0)
                    .animation(.gentle.delay(0.5), value: showingConfetti)
                }
            }
            
            Spacer()
            
            // Done button
            Button(action: {
                HapticManager.success()
                onDismiss()
            }) {
                Text("Done")
                    .font(.headlineLarge)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, .spaceLG)
                    .background(Color.primaryGradient)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            }
            .padding(.horizontal, .spaceHuge)
            .padding(.bottom, .spaceHuge)
            .opacity(showingConfetti ? 1.0 : 0.0)
            .animation(.gentle.delay(0.6), value: showingConfetti)
        }
        .background(Color.backgroundPrimary)
        .onAppear {
            HapticManager.success()
            showingConfetti = true
        }
    }
}

struct EnhancedRoutineFloatingActionButton: View {
    let onTap: () -> Void
    @State private var isPressed = false
    
    var body: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                Button(action: {
                    HapticManager.medium()
                    onTap()
                }) {
                    Image(systemName: "plus")
                        .font(.title2)
                        .foregroundColor(.white)
                        .frame(width: 64, height: 64)
                        .background(Color.primaryGradient)
                        .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                        .glowShadow()
                }
                .scaleEffect(isPressed ? 0.9 : 1.0)
                .animation(.bouncy, value: isPressed)
                .onLongPressGesture(minimumDuration: 0.1) {
                    // Trigger on release
                } onPressingChanged: { pressing in
                    withAnimation(.quick) {
                        isPressed = pressing
                    }
                }
                .padding(.trailing, .spaceXL)
                .padding(.bottom, .spaceXXL)
            }
        }
    }
}

#Preview {
    RoutineView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .preferredColorScheme(.dark)
}