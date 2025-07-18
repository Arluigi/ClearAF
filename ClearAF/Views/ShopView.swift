//
//  ShopView.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/17/25.
//

import SwiftUI

struct ShopView: View {
    var body: some View {
        NavigationView {
            ZStack {
                Color.backgroundSecondary.ignoresSafeArea()
                
                VStack(spacing: .spaceXL) {
                    // Enhanced header
                    HStack {
                        Text("Shop")
                            .font(.displayMedium)
                            .foregroundColor(.textPrimary)
                        Spacer()
                    }
                    .padding(.horizontal, .spaceXL)
                    
                    ScrollView {
                        VStack(spacing: .spaceXL) {
                            // Prescribed Products Section
                            VStack(alignment: .leading, spacing: .spaceLG) {
                                Text("Prescribed Products")
                                    .font(.headlineLarge)
                                    .foregroundColor(.textPrimary)
                                
                                VStack(spacing: .spaceMD) {
                                    HStack {
                                        Image(systemName: "pills.circle.fill")
                                            .font(.title2)
                                            .foregroundColor(.primaryPurple)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text("No prescriptions yet")
                                                .font(.headlineMedium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text("Your prescribed products will appear here")
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                    }
                                }
                            }
                            .wellnessCard()
                            .padding(.horizontal, .spaceXL)
                    
                            // My Subscriptions Section
                            VStack(alignment: .leading, spacing: .spaceLG) {
                                HStack {
                                    Text("My Subscriptions")
                                        .font(.headlineLarge)
                                        .foregroundColor(.textPrimary)
                                    
                                    Spacer()
                                    
                                    Button(action: {
                                        // TODO: Navigate to manage subscriptions
                                        HapticManager.light()
                                    }) {
                                        Text("Manage")
                                            .font(.captionLarge)
                                            .foregroundColor(.primaryPurple)
                                    }
                                }
                                
                                VStack(spacing: .spaceMD) {
                                    HStack {
                                        Image(systemName: "repeat.circle")
                                            .font(.title2)
                                            .foregroundColor(.primaryTeal)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text("No active subscriptions")
                                                .font(.headlineMedium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text("Subscribe to products for automatic delivery")
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                    }
                                }
                            }
                            .wellnessCard()
                            .padding(.horizontal, .spaceXL)
                    
                            // Recommended Products Section
                            VStack(alignment: .leading, spacing: .spaceLG) {
                                Text("Recommended for You")
                                    .font(.headlineLarge)
                                    .foregroundColor(.textPrimary)
                                
                                // Sample product cards
                                VStack(spacing: .spaceMD) {
                                    ProductCardView(
                                        name: "Gentle Cleanser",
                                        brand: "ClearAF",
                                        price: 24.99,
                                        description: "Perfect for sensitive skin",
                                        imageName: "bottle.fill"
                                    )
                                    
                                    ProductCardView(
                                        name: "Moisturizing Serum",
                                        brand: "ClearAF",
                                        price: 34.99,
                                        description: "Hydrating daily serum",
                                        imageName: "drop.fill"
                                    )
                                    
                                    ProductCardView(
                                        name: "Sunscreen SPF 50",
                                        brand: "ClearAF",
                                        price: 19.99,
                                        description: "Broad spectrum protection",
                                        imageName: "sun.max.fill"
                                    )
                                }
                            }
                            .wellnessCard()
                            .padding(.horizontal, .spaceXL)
                    
                            // Browse Catalog Button
                            Button(action: {
                                // TODO: Navigate to full catalog
                                HapticManager.light()
                            }) {
                                HStack {
                                    Image(systemName: "magnifyingglass")
                                        .font(.title2)
                                        .foregroundColor(.primaryPurple)
                                    
                                    Text("Browse All Products")
                                        .font(.headlineMedium)
                                        .foregroundColor(.primaryPurple)
                                    
                                    Spacer()
                                    
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(.primaryPurple)
                                }
                                .padding(.cardPadding)
                                .background(Color.buttonSecondary)
                                .clipShape(RoundedRectangle(cornerRadius: .radiusXL))
                                .overlay(
                                    RoundedRectangle(cornerRadius: .radiusXL)
                                        .stroke(Color.primaryPurple.opacity(0.2), lineWidth: 1)
                                )
                            }
                            .padding(.horizontal, .spaceXL)
                        }
                        .padding(.bottom, 100)
                    }
                    
                    Spacer()
                }
                .padding(.top, .spaceXL)
            }
            .navigationBarHidden(true)
        }
    }
}

struct ProductCardView: View {
    let name: String
    let brand: String
    let price: Double
    let description: String
    let imageName: String
    
    var body: some View {
        Button(action: {
            // TODO: Navigate to product detail
            HapticManager.light()
        }) {
            HStack(spacing: .spaceLG) {
                // Product Image
                Image(systemName: imageName)
                    .font(.title)
                    .foregroundColor(.primaryPurple)
                    .frame(width: 48, height: 48)
                    .background(Color.skinPeach)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                
                // Product Info
                VStack(alignment: .leading, spacing: .spaceXS) {
                    Text(name)
                        .font(.headlineMedium)
                        .foregroundColor(.textPrimary)
                        .multilineTextAlignment(.leading)
                    
                    Text(brand)
                        .font(.captionLarge)
                        .foregroundColor(.textSecondary)
                    
                    Text(description)
                        .font(.bodySmall)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.leading)
                }
                
                Spacer()
                
                // Price and Subscribe
                VStack(alignment: .trailing, spacing: .spaceXS) {
                    Text("$\(price, specifier: "%.2f")")
                        .font(.headlineMedium)
                        .foregroundColor(.textPrimary)
                    
                    Button(action: {
                        // TODO: Add to subscription
                        HapticManager.medium()
                    }) {
                        Text("Subscribe")
                            .font(.captionLarge)
                            .foregroundColor(.white)
                            .padding(.horizontal, .spaceMD)
                            .padding(.vertical, .spaceXS)
                            .background(Color.primaryPurple)
                            .clipShape(RoundedRectangle(cornerRadius: .radiusSmall))
                    }
                }
            }
            .padding(.spaceLG)
            .background(Color.backgroundSecondary)
            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            .overlay(
                RoundedRectangle(cornerRadius: .radiusLarge)
                    .stroke(Color.borderSubtle, lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    ShopView()
}