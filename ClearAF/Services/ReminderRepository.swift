import Foundation
import Combine
import UserNotifications

struct ReminderTime: Codable, Equatable {
    var enabled=false
    var hour:Int
    var minute=0
}
struct ReminderPreferences: Codable, Equatable {
    var morning=ReminderTime(hour:8)
    var evening=ReminderTime(hour:20)
    var photo=ReminderTime(hour:12)
    var weekday=1 // Foundation Calendar: Sunday=1.
    var anyEnabled:Bool { morning.enabled || evening.enabled || photo.enabled }
    var valid:Bool { [morning,evening,photo].allSatisfy { (0...23).contains($0.hour) && (0...59).contains($0.minute) } && (1...7).contains(weekday) }
}
struct ReminderRequest {
    let id:String
    let hour:Int
    let minute:Int
    let weekday:Int?
    let body:String
}
@MainActor protocol ReminderScheduling {
    func pendingIDs() async -> [String]
    func requestPermission() async throws -> Bool
    func authorized() async -> Bool
    func add(_ request:ReminderRequest) async throws
    func remove(_ ids:[String])
}
@MainActor final class SystemReminderScheduler: ReminderScheduling {
    private let center=UNUserNotificationCenter.current()
    func pendingIDs() async -> [String] { await center.pendingNotificationRequests().map(\.identifier) }
    func requestPermission() async throws -> Bool { try await center.requestAuthorization(options:[.alert,.sound]) }
    func authorized() async -> Bool {
        let status=await center.notificationSettings().authorizationStatus
        return status == .authorized || status == .provisional || status == .ephemeral
    }
    func add(_ request:ReminderRequest) async throws {
        let content=UNMutableNotificationContent();content.title="ClearAF reminder";content.body=request.body;content.sound = .default
        var date=DateComponents();date.hour=request.hour;date.minute=request.minute;date.weekday=request.weekday
        try await center.add(UNNotificationRequest(identifier:request.id,content:content,trigger:UNCalendarNotificationTrigger(dateMatching:date,repeats:true)))
    }
    func remove(_ ids:[String]) {center.removePendingNotificationRequests(withIdentifiers:ids);center.removeDeliveredNotifications(withIdentifiers:ids)}
}

@MainActor final class ReminderRepository: ObservableObject {
    enum State:Equatable {case disabled,paused,saving,enabled,denied,failed}
    @Published private(set) var preferences=ReminderPreferences()
    @Published private(set) var state:State = .disabled
    private let access:AccountAccess
    private let scheduler:any ReminderScheduling
    private let directory:URL?
    private var ticket:AccountAccess.Ticket?
    private var activeIDs:[String]=[]
    private var request=UUID()
    private var startup:Task<Void,Never>?
    private struct Saved:Codable {let accountID:UUID;let preferences:ReminderPreferences}

    init(access:AccountAccess,scheduler:any ReminderScheduling,directory:URL?=nil) {
        self.access=access;self.scheduler=scheduler;self.directory=directory
        // Clear surviving app-owned schedules before publishing a new account.
        // Save waits for this task, so startup cannot erase newly scheduled IDs.
        startup=Task { let ids=await scheduler.pendingIDs();scheduler.remove(ids.filter{$0.hasPrefix("clearaf.reminder.")}) }
    }
    private func file(_ owner:UUID) throws -> URL {
        let root=try directory ?? FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true)
        let folder=root.appendingPathComponent("Accounts/\(owner.uuidString.lowercased())",isDirectory:true)
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        return folder.appendingPathComponent("reminders.json")
    }
    func resume(ticket:AccountAccess.Ticket) async {
        guard access.snapshot()==ticket else{return}
        if self.ticket==ticket{return}
        cancel();self.ticket=ticket
        await startup?.value
        guard self.ticket==ticket,access.snapshot()==ticket else{return}
        do {
            let url=try file(ticket.accountID)
            if FileManager.default.fileExists(atPath:url.path) {
                let saved=try JSONDecoder().decode(Saved.self,from:Data(contentsOf:url))
                guard saved.accountID==ticket.accountID,saved.preferences.valid else{throw URLError(.cannotDecodeContentData)}
                preferences=saved.preferences
            }
            state=preferences.anyEnabled ? .paused : .disabled
            if preferences.anyEnabled { await apply(preferences,ticket:ticket,askPermission:false) }
        } catch {state = .failed}
    }
    func cancel() {
        request=UUID();scheduler.remove(activeIDs);activeIDs=[];ticket=nil
        preferences=ReminderPreferences();state = .disabled
    }
    func save(_ value:ReminderPreferences,ticket expected:AccountAccess.Ticket) async {
        await apply(value,ticket:expected,askPermission:true)
    }
    private func apply(_ value:ReminderPreferences,ticket expected:AccountAccess.Ticket,askPermission:Bool) async {
        guard value.valid,self.ticket==expected,access.snapshot()==expected,state != .saving else{return}
        let run=UUID();request=run;state = .saving
        let ids=["morning","evening","photo"].map{"clearaf.reminder.\(run.uuidString).\($0)"}
        let current={ self.request==run && self.ticket==expected && self.access.snapshot()==expected }
        await startup?.value
        guard current() else{return}
        do {
            try JSONEncoder().encode(Saved(accountID:expected.accountID,preferences:value)).write(to:try file(expected.accountID),options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
            preferences=value;scheduler.remove(activeIDs);activeIDs=[]
            guard value.anyEnabled else{state = .disabled;return}
            let allowed:Bool
            if askPermission { allowed=try await scheduler.requestPermission() }
            else { allowed=await scheduler.authorized() }
            guard current() else{scheduler.remove(ids);return}
            guard allowed else{state = .denied;return}
            activeIDs=ids
            for (index,time) in [value.morning,value.evening,value.photo].enumerated() where time.enabled {
                try await scheduler.add(ReminderRequest(id:ids[index],hour:time.hour,minute:time.minute,weekday:index==2 ? value.weekday:nil,body:index==2 ? "Open ClearAF for your photo check-in." : "Open ClearAF to view your routine."))
                guard current() else{scheduler.remove(ids);return}
            }
            state = .enabled
        } catch {
            scheduler.remove(ids)
            guard current() else{return}
            scheduler.remove(activeIDs);activeIDs=[];state = .failed
        }
    }
    func refreshPermission() async {
        guard state == .enabled,let ticket else{return}
        let run=request
        let allowed=await scheduler.authorized()
        guard request==run,self.ticket==ticket,access.snapshot()==ticket else{return}
        if !allowed {scheduler.remove(activeIDs);activeIDs=[];state = .denied}
    }
}
