import SwiftUI

struct CardView: View {
    let card: Card
    let store: CardStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                header
                if let howYouMet = card.howYouMet ?? card.person?.howYouMet {
                    Label(howYouMet, systemImage: "person.2").font(.footnote)
                }
                if let last = card.lastSpoke {
                    Label("\(last.when) · \(last.topic)", systemImage: "clock").font(.footnote)
                }
                ForEach(card.openLoops, id: \.self) { loop in
                    Label(loop.text, systemImage: loop.direction == .youOwe ? "exclamationmark.triangle.fill" : "arrow.uturn.left")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(loop.direction == .youOwe ? .orange : .cyan)
                }
                ForEach(card.dontForget, id: \.self) { Label($0, systemImage: "lightbulb").font(.footnote) }
                ForEach(card.avoid, id: \.self) { Label($0, systemImage: "hand.raised").font(.footnote).foregroundStyle(.secondary) }
                if !card.confirmed { confirmButtons }
                if let error = store.errorMessage {
                    Text(error).font(.caption2).foregroundStyle(.red)
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(card.displayName ?? "Listening…")
                .font(.title3.bold())
                .minimumScaleFactor(0.6)
                .lineLimit(2)
            let subtitle = [card.person?.role, card.person?.org].compactMap { $0 }.joined(separator: " · ")
            if !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
            Text(card.confirmed ? "Confirmed" : "\(Int(card.confidence * 100))% sure")
                .font(.caption2)
                .foregroundStyle(card.confirmed ? .green : .secondary)
        }
    }

    @ViewBuilder private var confirmButtons: some View {
        if card.displayName != nil {
            HStack {
                Button("Yes") { Task { await store.confirm() } }.tint(.green)
                Button("No") { Task { await store.reject() } }.tint(.red)
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

struct FollowUpView: View {
    let followUp: FollowUp
    let store: CardStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Follow-up").font(.caption).foregroundStyle(.secondary)
                Text(followUp.text).font(.body)
                Button("Add to Bee") { Task { await store.approveFollowUp() } }
                    .buttonStyle(.borderedProminent)
                    .tint(.yellow)
                Button("Dismiss", role: .cancel) { Task { await store.dismissFollowUp() } }
                if let error = store.errorMessage {
                    Text(error).font(.caption2).foregroundStyle(.red)
                }
            }
        }
    }
}

struct ContentView: View {
    @State private var store = CardStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            if let card = store.card {
                CardView(card: card, store: store)
            } else {
                idle
            }
            if let followUp = store.followUp {
                FollowUpView(followUp: followUp, store: store)
            }
        }
        .tabViewStyle(.verticalPage)
        .onChange(of: scenePhase, initial: true) { _, phase in
            phase == .background ? store.stop() : store.start()
        }
    }

    private var idle: some View {
        VStack(spacing: 6) {
            Image(systemName: "waveform").font(.title2).foregroundStyle(.yellow)
            Text("SideKick").font(.headline)
            Text(store.errorMessage ?? (store.connected ? "Listening for conversations" : "Connecting…"))
                .font(.caption2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
    }
}

@main
struct SideKickApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}
