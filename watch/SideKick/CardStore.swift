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

    private let client: SideKickClient?
    private var version = -1
    private var loop: Task<Void, Never>?

    init(client: SideKickClient? = SideKickClient()) {
        self.client = client
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

    func confirm() async {
        guard let client, let card, let name = card.displayName else { return }
        await perform { try await client.confirm(conversationUuid: card.conversationUuid, personId: card.person?.id, name: card.person == nil ? name : nil) }
    }

    func reject() async {
        guard let client, let card, let name = card.displayName else { return }
        await perform { try await client.reject(conversationUuid: card.conversationUuid, name: name) }
    }

    func approveFollowUp() async {
        guard let client, let followUp else { return }
        do {
            try await client.approveFollowUp(id: followUp.id)
            self.followUp = nil
            WKInterfaceDevice.current().play(.success)
        } catch {
            errorMessage = error.localizedDescription
            WKInterfaceDevice.current().play(.failure)
        }
    }

    func dismissFollowUp() async {
        guard let client, let followUp else { return }
        await perform { try await client.dismissFollowUp(id: followUp.id) }
    }

    private func perform(_ action: () async throws -> Snapshot) async {
        do {
            apply(try await action())
        } catch {
            errorMessage = error.localizedDescription
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
