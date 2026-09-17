//
//  ClearAFApp.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/15/25.
//

import SwiftUI

@main
struct ClearAFApp: App {
    init() {
        Letterpress.registerFonts()
        Letterpress.applyControlAppearance()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
