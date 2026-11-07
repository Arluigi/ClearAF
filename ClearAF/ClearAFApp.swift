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
        Letterpress.applyChromeAppearance()
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if let prototype = UNZITPrototypeRoute.requested() {
                UNZITPrototypeRoot(route: prototype)
            } else {
                ContentView()
            }
            #else
            ContentView()
            #endif
        }
    }
}
