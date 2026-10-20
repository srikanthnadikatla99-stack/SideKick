import SwiftUI

struct CardView: View {
    let card: Card
    let store: CardStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                header
                if card.pending == true {
                    HStack(spacing: 6) {
                        ProgressView().frame(width: 16, height: 16)
                        Text("Checking your history…").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                ForEach(card.openLoops, id: \.self) { loop in
                    OpenLoopTile(loop: loop)
                }
                if let last = card.lastSpoke {
                    Tile {
                        VStack(alignment: .leading, spacing: 2) {
                            SectionLabel(text: "Last time · \(last.when)", systemImage: "clock.fill")
                            Text(last.topic).font(.footnote)
                        }
                    }
                }
                if let met = card.howYouMet ?? card.person?.howYouMet {
                    Tile {
                        VStack(alignment: .leading, spacing: 2) {
                            SectionLabel(text: "How you met", systemImage: "person.2.fill")
                            Text(met).font(.footnote)
                        }
                    }
                }
                ForEach(card.dontForget, id: \.self) { item in
                    Tile(accent: Theme.honey) {
                        VStack(alignment: .leading, spacing: 2) {
                            SectionLabel(text: "Bring up", systemImage: "lightbulb.fill", color: Theme.honey)
                            Text(item).font(.footnote)
                        }
                    }
                }
                ForEach(card.avoid, id: \.self) { item in
                    Tile(accent: .gray) {
                        VStack(alignment: .leading, spacing: 2) {
                            SectionLabel(text: "Avoid", systemImage: "hand.raised.fill")
                            Text(item).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
                if !card.confirmed, card.displayName != nil { confirmSection }
                if let error = store.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(.red)
                }
            }
            .padding(.horizontal, 2)
        }
        .containerBackground(Theme.pageBackground, for: .tabView)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(card.initials)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.ink)
                .frame(width: 36, height: 36)
                .background(LinearGradient(colors: [Theme.honey, Theme.amber], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(card.displayName ?? "Listening…")
                    .font(.system(.headline, design: .rounded).weight(.bold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                if let role = card.role ?? card.person?.role {
                    Text(role).font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
                }
                if let org = card.org ?? card.person?.org {
                    Text(org).font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
                }
                statusChip
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var statusChip: some View {
        Group {
            if card.confirmed {
                Label("Confirmed", systemImage: "checkmark.seal.fill").foregroundStyle(.green)
            } else {
                Label("\(Int(card.confidence * 100))% match", systemImage: "waveform").foregroundStyle(Theme.honey)
            }
        }
        .font(.system(size: 11, weight: .semibold))
    }

    private var confirmSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Is this \(card.displayName ?? "them")?").font(.footnote.weight(.semibold))
            if let why = card.evidence?.first {
                Text(why).font(.caption2).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                Button { Task { await store.confirm() } } label: {
                    Image(systemName: "checkmark").font(.body.weight(.bold))
                }
                .tint(.green)
                .accessibilityLabel("Yes, it's \(card.displayName ?? "them")")
                Button { Task { await store.reject() } } label: {
                    Image(systemName: "xmark").font(.body.weight(.bold))
                }
                .tint(.red)
                .accessibilityLabel("No, not them")
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.busy)
        }
        .padding(.top, 4)
    }
}

struct OpenLoopTile: View {
    let loop: OpenLoop

    var body: some View {
        let youOwe = loop.direction == .youOwe
        let color = youOwe ? Theme.youOwe : Theme.theyOwe
        Tile(accent: color) {
            VStack(alignment: .leading, spacing: 2) {
                SectionLabel(
                    text: youOwe ? "You owe" : "They owe",
                    systemImage: youOwe ? "exclamationmark.triangle.fill" : "arrow.uturn.backward.circle.fill",
                    color: color)
                Text(loop.text).font(.footnote.weight(.medium))
            }
        }
    }
}

struct FollowUpView: View {
    let followUp: FollowUp
    let store: CardStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Follow-up", systemImage: "checklist", color: Theme.honey)
                Tile {
                    Text(followUp.text).font(.footnote)
                }
                Button { Task { await store.approveFollowUp() } } label: {
                    if store.busy {
                        ProgressView().tint(Theme.ink)
                    } else {
                        Label("Add to Bee", systemImage: "plus.circle.fill").font(.body.weight(.semibold))
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.honey)
                .foregroundStyle(Theme.ink)
                .disabled(store.busy)
                Button("Not now") { Task { await store.dismissFollowUp() } }
                    .font(.footnote)
                    .disabled(store.busy)
                if let error = store.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(.red)
                }
            }
        }
        .containerBackground(Theme.pageBackground, for: .tabView)
    }
}

struct IdleView: View {
    let store: CardStore
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                ForEach(0..<2) { ring in
                    Circle()
                        .stroke(Theme.honey.opacity(0.35), lineWidth: 2)
                        .scaleEffect(pulse ? 1.6 + Double(ring) * 0.3 : 0.9)
                        .opacity(pulse ? 0 : 0.8)
                }
                Image(systemName: "person.wave.2.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 56, height: 56)
                    .background(LinearGradient(colors: [Theme.honey, Theme.amber], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
            }
            .frame(width: 70, height: 70)
            .onAppear {
                withAnimation(.easeOut(duration: 1.8).repeatForever(autoreverses: false)) { pulse = true }
            }
            Text("SideKick").font(.system(.title3, design: .rounded).weight(.bold))
            status
        }
        .containerBackground(Theme.pageBackground, for: .tabView)
    }

    @ViewBuilder private var status: some View {
        if let error = store.errorMessage {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .font(.caption2)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
        } else if store.connected {
            HStack(spacing: 5) {
                Circle().fill(.green).frame(width: 6, height: 6)
                Text("Listening for conversations").font(.caption2).foregroundStyle(.secondary)
            }
        } else {
            HStack(spacing: 6) {
                ProgressView().frame(width: 14, height: 14)
                Text("Connecting…").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}

struct ContentView: View {
    private enum Page: Hashable { case card, followUp }

    @State private var store = CardStore()
    @State private var page: Page = .card
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView(selection: $page) {
            Group {
                if let card = store.card {
                    CardView(card: card, store: store)
                } else {
                    IdleView(store: store)
                }
            }
            .tag(Page.card)
            if let followUp = store.followUp {
                FollowUpView(followUp: followUp, store: store).tag(Page.followUp)
            }
        }
        .tabViewStyle(.verticalPage)
        // Jump to whatever just arrived: a new person, or the post-conversation follow-up.
        .onChange(of: store.followUp?.id, initial: true) { _, id in page = id == nil ? .card : .followUp }
        .onChange(of: store.card?.displayName) { _, _ in if store.followUp == nil { page = .card } }
        .overlay(alignment: .bottom) {
            if let toast = store.toast {
                Label(toast, systemImage: "checkmark.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.honey, in: Capsule())
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.3), value: store.toast)
        .animation(.default, value: store.card)
        .onChange(of: scenePhase, initial: true) { _, phase in
            phase == .background ? store.stop() : store.start()
        }
    }
}

@main
struct SideKickApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView().tint(Theme.honey)
        }
    }
}
