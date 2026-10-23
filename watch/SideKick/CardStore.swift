import Foundation
import Observation
import WatchKit

@MainActor
@Observable
final class CardStore {
    private(set) var card: Card?
    private(set) var followUp: FollowUp?
    private(set) var connected = false
    private(set) var errorMessage: String?
    private(set) var busy = false
    private(set) var toast: String?

    private let client: SideKickClient?
    private var version = -1
    private var loop: Task<Void, Never>?
    private let isDemo: Bool

    init(client: SideKickClient? = SideKickClient(), arguments: [String] = ProcessInfo.processInfo.arguments) {
        if let index = arguments.firstIndex(of: "-SideKickDemo") {
            let variant = arguments.indices.contains(index + 1) ? arguments[index + 1] : "card"
            self.client = nil
            self.isDemo = true
            let snapshot = DemoData.snapshot(variant)
            card = snapshot.card
            followUp = snapshot.followUp
            connected = true
            // "late" mimics real use: the app is open on the idle screen when the card, then the follow-up, arrive.
            if variant == "late" {
                Task { [weak self] in
                    try? await Task.sleep(for: .seconds(3))
                    self?.apply(Snapshot(version: 1, card: DemoData.fullCard, followUp: nil))
                    try? await Task.sleep(for: .seconds(4))
                    self?.apply(Snapshot(version: 2, card: DemoData.fullCard, followUp: DemoData.followUp))
                }
            }
            return
        }
        self.client = client
        self.isDemo = false
        if client == nil { errorMessage = SideKickError.notConfigured.localizedDescription }
    }

    func start() {
        guard let client, loop == nil else { return }
        errorMessage = nil
        loop = Task { [weak self] in
            // Fetch immediately on (re)open, then long-poll for changes.
            var wait = 0
            while !Task.isCancelled {
                do {
                    let snapshot = try await client.state(since: self?.version ?? -1, wait: wait)
                    wait = 25
                    self?.apply(snapshot)
                } catch is CancellationError {
                    return
                } catch let error as URLError where error.code == .cancelled {
                    return
                } catch {
                    self?.connected = false
                    self?.errorMessage = error.localizedDescription
                    try? await Task.sleep(for: .seconds(2))
                }
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    func restart() {
        stop()
        start()
    }

    func confirm() async {
        guard let client, let card, let name = card.displayName else { return }
        await perform(success: "Saved \(name)") {
            try await client.confirm(conversationUuid: card.conversationUuid, personId: card.person?.id, name: card.person == nil ? name : nil)
        }
    }

    func reject() async {
        guard let client, let card, let name = card.displayName else { return }
        await perform(success: nil) { try await client.reject(conversationUuid: card.conversationUuid, name: name) }
    }

    func approveFollowUp() async {
        guard let client, let followUp, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await client.approveFollowUp(id: followUp.id)
            self.followUp = nil
            errorMessage = nil
            WKInterfaceDevice.current().play(.success)
            showToast("Added to Bee")
        } catch {
            errorMessage = error.localizedDescription
            WKInterfaceDevice.current().play(.failure)
        }
    }

    func dismissFollowUp() async {
        guard let client, let followUp else { return }
        await perform(success: nil) { try await client.dismissFollowUp(id: followUp.id) }
    }

    private func perform(success: String?, _ action: () async throws -> Snapshot) async {
        guard !busy, !isDemo else { return }
        busy = true
        defer { busy = false }
        do {
            apply(try await action())
            if let success {
                WKInterfaceDevice.current().play(.success)
                showToast(success)
            }
        } catch {
            errorMessage = error.localizedDescription
            WKInterfaceDevice.current().play(.failure)
        }
    }

    private func showToast(_ text: String) {
        toast = text
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.5))
            if self?.toast == text { self?.toast = nil }
        }
    }

    private func apply(_ snapshot: Snapshot) {
        connected = true
        errorMessage = nil
        version = snapshot.version
        // Tap the wrist only when a new person surfaces or a new follow-up arrives, not on every refresh.
        if snapshot.card?.displayName != nil, snapshot.card?.displayName != card?.displayName {
            WKInterfaceDevice.current().play(.notification)
        } else if snapshot.followUp != nil, snapshot.followUp?.id != followUp?.id {
            WKInterfaceDevice.current().play(.directionUp)
        }
        card = snapshot.card
        followUp = snapshot.followUp
    }
}
