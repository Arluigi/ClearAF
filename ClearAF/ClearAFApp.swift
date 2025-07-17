//
//  ClearAFApp.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/15/25.
//

import SwiftUI

@main
struct ClearAFApp: App {
    let persistenceController = PersistenceController.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
        }
    }
}
