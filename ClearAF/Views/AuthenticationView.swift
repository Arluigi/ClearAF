import SwiftUI
import Combine

struct AuthenticationView: View {
    @StateObject private var apiService = APIService.shared
    @State private var isRegistering = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var selectedSkinType = "Normal"
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var showError = false
    
    let skinTypes = ["Normal", "Dry", "Oily", "Combination", "Sensitive"]
    let onAuthenticationSuccess: () -> Void
    
    @State private var cancellables = Set<AnyCancellable>()
    
    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 32) {
                    // Header
                    VStack(spacing: 16) {
                        Image(systemName: "cross.case.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.blue)
                        
                        Text("Clear AF")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(.primary)
                        
                        Text(isRegistering ? "Create your account" : "Welcome back")
                            .font(.title2)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 50)
                    
                    // Form
                    VStack(spacing: 20) {
                        if isRegistering {
                            CustomTextField(
                                title: "Full Name",
                                text: $name,
                                placeholder: "Enter your full name"
                            )
                        }
                        
                        CustomTextField(
                            title: "Email",
                            text: $email,
                            placeholder: "Enter your email"
                        )
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        
                        CustomTextField(
                            title: "Password",
                            text: $password,
                            placeholder: "Enter your password",
                            isSecure: true
                        )
                        
                        if isRegistering {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Skin Type")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                
                                Picker("Skin Type", selection: $selectedSkinType) {
                                    ForEach(skinTypes, id: \.self) { type in
                                        Text(type).tag(type)
                                    }
                                }
                                .pickerStyle(MenuPickerStyle())
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(12)
                            }
                        }
                    }
                    .padding(.horizontal, 24)
                    
                    // Action Button
                    Button(action: {
                        if isRegistering {
                            registerUser()
                        } else {
                            loginUser()
                        }
                    }) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            } else {
                                Text(isRegistering ? "Create Account" : "Sign In")
                                    .fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(
                            (isFormValid && !isLoading) ? Color.blue : Color.gray
                        )
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(!isFormValid || isLoading)
                    .padding(.horizontal, 24)
                    
                    // Toggle Authentication Mode
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            isRegistering.toggle()
                            clearForm()
                        }
                    }) {
                        HStack(spacing: 4) {
                            Text(isRegistering ? "Already have an account?" : "Don't have an account?")
                                .foregroundColor(.secondary)
                            Text(isRegistering ? "Sign In" : "Sign Up")
                                .foregroundColor(.blue)
                                .fontWeight(.semibold)
                        }
                    }
                    
                    Spacer(minLength: 50)
                }
            }
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
        }
    }
    
    private var isFormValid: Bool {
        if isRegistering {
            return !name.isEmpty && !email.isEmpty && !password.isEmpty && password.count >= 6
        } else {
            return !email.isEmpty && !password.isEmpty
        }
    }
    
    private func registerUser() {
        isLoading = true
        
        apiService.register(
            name: name,
            email: email,
            password: password,
            skinType: selectedSkinType
        )
        .sink(
            receiveCompletion: { [self] completion in
                isLoading = false
                if case .failure(let error) = completion {
                    handleError(error)
                }
            },
            receiveValue: { [self] response in
                print("Registration successful: \(response.user.name ?? "Unknown")")
                onAuthenticationSuccess()
            }
        )
        .store(in: &cancellables)
    }
    
    private func loginUser() {
        isLoading = true
        
        apiService.login(email: email, password: password)
            .sink(
                receiveCompletion: { [self] completion in
                    isLoading = false
                    if case .failure(let error) = completion {
                        handleError(error)
                    }
                },
                receiveValue: { [self] response in
                    print("Login successful: \(response.user.name ?? "Unknown")")
                    onAuthenticationSuccess()
                }
            )
            .store(in: &cancellables)
    }
    
    private func handleError(_ error: Error) {
        errorMessage = error.localizedDescription
        showError = true
    }
    
    private func clearForm() {
        email = ""
        password = ""
        name = ""
        selectedSkinType = "Normal"
        errorMessage = ""
    }
}

// MARK: - Custom Text Field
struct CustomTextField: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .words
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundColor(.primary)
            
            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(autocapitalization)
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.gray.opacity(0.3), lineWidth: 1)
            )
        }
    }
}

// MARK: - Preview
struct AuthenticationView_Previews: PreviewProvider {
    static var previews: some View {
        AuthenticationView {
            print("Authentication successful")
        }
    }
}