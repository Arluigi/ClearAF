//
//  MessagingView.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/18/25.
//

import SwiftUI
import CoreData

struct MessagingView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    @FetchRequest(
        entity: Message.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \Message.sentDate, ascending: true)]
    ) private var messages: FetchedResults<Message>
    
    @State private var messageText = ""
    @State private var showingCamera = false
    @State private var showingPhotoTakenMessage = false
    @State private var isTyping = false
    
    let dermatologist: Dermatologist?
    
    init(dermatologist: Dermatologist? = nil) {
        self.dermatologist = dermatologist
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.backgroundSecondary.ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Header with dermatologist info
                    if let dermatologist = dermatologist {
                        DermatologistHeader(dermatologist: dermatologist)
                    }
                    
                    // Messages list
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: .spaceMD) {
                                if messages.isEmpty {
                                    MessagePlaceholder()
                                        .padding(.top, 50)
                                } else {
                                    ForEach(messages, id: \.id) { message in
                                        MessageBubble(message: message)
                                            .id(message.id)
                                    }
                                }
                                
                                // Typing indicator
                                if isTyping {
                                    TypingIndicator()
                                        .id("typing")
                                }
                            }
                            .padding(.horizontal, .spaceXL)
                            .padding(.vertical, .spaceMD)
                        }
                        .onChange(of: messages.count) {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                if let lastMessage = messages.last {
                                    withAnimation(.easeOut(duration: 0.3)) {
                                        proxy.scrollTo(lastMessage.id, anchor: .bottom)
                                    }
                                }
                            }
                        }
                        .onChange(of: isTyping) {
                            if isTyping {
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                    withAnimation(.easeOut(duration: 0.3)) {
                                        proxy.scrollTo("typing", anchor: .bottom)
                                    }
                                }
                            }
                        }
                    }
                    
                    // Message input
                    MessageInputBar(
                        messageText: $messageText,
                        showingCamera: $showingCamera,
                        onSend: sendMessage,
                        onPhotoCapture: { showingCamera = true }
                    )
                }
            }
            .navigationTitle(dermatologist?.name ?? "Messages")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Back") { dismiss() }
            )
        }
        .sheet(isPresented: $showingCamera) {
            PhotoCaptureView(
                title: "Take Photo",
                subtitle: "Share a photo with your dermatologist"
            ) { imageData in
                sendPhotoMessage(imageData)
                showingCamera = false
                showingPhotoTakenMessage = true
                HapticManager.success()
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    showingPhotoTakenMessage = false
                }
            }
        }
        .overlay(
            Group {
                if showingPhotoTakenMessage {
                    VStack {
                        Spacer()
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.title2)
                                .foregroundColor(.green)
                            Text("Photo sent!")
                                .font(.headlineSmall)
                                .foregroundColor(.textPrimary)
                        }
                        .padding(.spaceLG)
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                        .softShadow()
                        .padding(.bottom, 100)
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.bouncy, value: showingPhotoTakenMessage)
                }
            }
        )
    }
    
    private func sendMessage() {
        guard !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        
        let message = Message(context: viewContext)
        message.id = UUID()
        message.content = messageText
        message.sentDate = Date()
        message.isRead = false
        message.messageType = "text"
        
        // Simulate typing indicator
        isTyping = true
        
        do {
            try viewContext.save()
            messageText = ""
            HapticManager.light()
            
            // Simulate doctor response after 2-3 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                isTyping = false
                simulateDoctorResponse()
            }
        } catch {
            print("Error sending message: \(error)")
            HapticManager.error()
            isTyping = false
        }
    }
    
    private func sendPhotoMessage(_ imageData: Data) {
        let message = Message(context: viewContext)
        message.id = UUID()
        message.content = "Photo shared"
        message.sentDate = Date()
        message.isRead = false
        message.messageType = "photo"
        message.attachmentData = imageData
        message.attachmentType = "image"
        
        do {
            try viewContext.save()
            HapticManager.success()
        } catch {
            print("Error sending photo: \(error)")
            HapticManager.error()
        }
    }
    
    private func simulateDoctorResponse() {
        let responses = [
            "Thank you for sharing that with me. I'll review your photos and get back to you shortly.",
            "I can see the concern you mentioned. Let's schedule a follow-up to discuss treatment options.",
            "Based on what you've shared, I recommend continuing your current routine for now.",
            "That looks much better than before! Keep up the good work with your skincare routine.",
            "I'd like to adjust your treatment plan. I'll send you updated instructions shortly."
        ]
        
        let response = Message(context: viewContext)
        response.id = UUID()
        response.content = responses.randomElement()
        response.sentDate = Date()
        response.isRead = true
        response.messageType = "response"
        
        do {
            try viewContext.save()
        } catch {
            print("Error saving doctor response: \(error)")
        }
    }
    
}

// MARK: - Supporting Views

struct DermatologistHeader: View {
    let dermatologist: Dermatologist
    
    var body: some View {
        HStack(spacing: .spaceMD) {
            // Profile image
            if let imageData = dermatologist.profileImageData,
               let uiImage = UIImage(data: imageData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 50, height: 50)
                    .clipShape(Circle())
            } else {
                Circle()
                    .fill(Color.primaryPurple.opacity(0.2))
                    .frame(width: 50, height: 50)
                    .overlay(
                        Text(String(dermatologist.name?.prefix(1) ?? "D"))
                            .font(.headlineMedium)
                            .foregroundColor(.primaryPurple)
                    )
            }
            
            VStack(alignment: .leading, spacing: .spaceXS) {
                Text(dermatologist.name ?? "Dr. Amit Om")
                    .font(.headlineMedium)
                    .foregroundColor(.textPrimary)
                
                HStack(spacing: .spaceXS) {
                    Circle()
                        .fill(dermatologist.isAvailable ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    
                    Text(dermatologist.isAvailable ? "Available" : "Away")
                        .font(.captionMedium)
                        .foregroundColor(.textSecondary)
                }
            }
            
            Spacer()
        }
        .padding(.cardPadding)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
        .softShadow()
        .padding(.horizontal, .spaceXL)
        .padding(.bottom, .spaceMD)
    }
}

struct MessagePlaceholder: View {
    var body: some View {
        VStack(spacing: .spaceLG) {
            Image(systemName: "message.circle")
                .font(.system(size: 60))
                .foregroundColor(.textSecondary)
            
            VStack(spacing: .spaceMD) {
                Text("Start a conversation")
                    .font(.headlineLarge)
                    .foregroundColor(.textPrimary)
                
                Text("Send a message to your dermatologist. They typically respond within a few hours.")
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.spaceXL)
    }
}

struct MessageBubble: View {
    let message: Message
    
    private var isUserMessage: Bool {
        return message.messageType != "response"
    }
    
    private var messageTime: String {
        guard let sentDate = message.sentDate else { return "" }
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: sentDate)
    }
    
    var body: some View {
        HStack {
            if isUserMessage {
                Spacer()
            }
            
            VStack(alignment: isUserMessage ? .trailing : .leading, spacing: .spaceXS) {
                if message.messageType == "photo", let attachmentData = message.attachmentData {
                    PhotoMessageContent(imageData: attachmentData, isUser: isUserMessage)
                } else {
                    TextMessageContent(message: message, isUser: isUserMessage)
                }
                
                // Message status and time
                HStack(spacing: .spaceXS) {
                    Text(messageTime)
                        .font(.captionSmall)
                        .foregroundColor(.textTertiary)
                    
                    if isUserMessage {
                        MessageStatusIndicator(isRead: message.isRead)
                    }
                }
            }
            
            if !isUserMessage {
                Spacer()
            }
        }
    }
}

struct TextMessageContent: View {
    let message: Message
    let isUser: Bool
    
    var body: some View {
        Text(message.content ?? "")
            .font(.bodyMedium)
            .foregroundColor(isUser ? .white : .textPrimary)
            .padding(.spaceMD)
            .background(
                RoundedRectangle(cornerRadius: .radiusLarge)
                    .fill(isUser ? Color.primaryPurple : Color.cardBackground)
            )
            .frame(maxWidth: UIScreen.main.bounds.width * 0.7, alignment: isUser ? .trailing : .leading)
    }
}

struct PhotoMessageContent: View {
    let imageData: Data
    let isUser: Bool
    
    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: .spaceXS) {
            if let uiImage = UIImage(data: imageData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 200, height: 200)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                    .overlay(
                        RoundedRectangle(cornerRadius: .radiusLarge)
                            .stroke(Color.borderSubtle, lineWidth: 1)
                    )
            }
            
            Text("Photo")
                .font(.captionMedium)
                .foregroundColor(isUser ? .white : .textSecondary)
                .padding(.horizontal, .spaceMD)
                .padding(.vertical, .spaceXS)
                .background(
                    RoundedRectangle(cornerRadius: .radiusMedium)
                        .fill(isUser ? Color.primaryPurple : Color.backgroundSecondary)
                )
        }
    }
}

struct MessageStatusIndicator: View {
    let isRead: Bool
    
    var body: some View {
        Image(systemName: isRead ? "checkmark.circle.fill" : "checkmark.circle")
            .font(.captionMedium)
            .foregroundColor(isRead ? .green : .textTertiary)
    }
}

struct TypingIndicator: View {
    @State private var animationPhase = 0
    
    var body: some View {
        HStack {
            HStack(spacing: .spaceXS) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.textSecondary)
                        .frame(width: 6, height: 6)
                        .scaleEffect(animationPhase == index ? 1.2 : 1.0)
                        .opacity(animationPhase == index ? 1.0 : 0.5)
                }
            }
            .padding(.spaceMD)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            
            Spacer()
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.6).repeatForever()) {
                animationPhase = (animationPhase + 1) % 3
            }
        }
    }
}

struct MessageInputBar: View {
    @Binding var messageText: String
    @Binding var showingCamera: Bool
    let onSend: () -> Void
    let onPhotoCapture: () -> Void
    
    private var canSend: Bool {
        !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    var body: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Color.borderSubtle)
                .frame(height: 1)
            
            HStack(spacing: .spaceMD) {
                // Photo button
                Button(action: onPhotoCapture) {
                    Image(systemName: "camera.fill")
                        .font(.title2)
                        .foregroundColor(.primaryPurple)
                }
                
                // Text input
                TextField("Type a message...", text: $messageText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                    .onSubmit {
                        if canSend {
                            onSend()
                        }
                    }
                
                // Send button
                Button(action: onSend) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundColor(canSend ? .primaryPurple : .textTertiary)
                }
                .disabled(!canSend)
            }
            .padding(.cardPadding)
            .background(Color.cardBackground)
        }
    }
}

#Preview {
    let context = PersistenceController.preview.container.viewContext
    
    // Create sample dermatologist
    let dermatologist = Dermatologist(context: context)
    dermatologist.id = UUID()
    dermatologist.name = "Dr. Amit Om"
    dermatologist.title = "MD, Dermatologist"
    dermatologist.isAvailable = true
    
    // Create sample messages
    let message1 = Message(context: context)
    message1.id = UUID()
    message1.content = "Hi Dr. Om, I've been experiencing some irritation on my cheek area. Can you take a look?"
    message1.sentDate = Date().addingTimeInterval(-3600)
    message1.isRead = true
    message1.messageType = "text"
    
    let message2 = Message(context: context)
    message2.id = UUID()
    message2.content = "Thank you for reaching out. I'd be happy to help. Can you share a photo of the affected area?"
    message2.sentDate = Date().addingTimeInterval(-1800)
    message2.isRead = true
    message2.messageType = "response"
    
    return MessagingView(dermatologist: dermatologist)
        .environment(\.managedObjectContext, context)
}