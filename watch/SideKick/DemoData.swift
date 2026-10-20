import Foundation

/// Sample states for screenshots and UI review; launch with `-SideKickDemo <idle|pending|card|followup>`.
enum DemoData {
    static func snapshot(_ variant: String) -> Snapshot {
        switch variant {
        case "idle": Snapshot(version: 0, card: nil, followUp: nil)
        case "pending": Snapshot(version: 1, card: pendingCard, followUp: nil)
        case "followup": Snapshot(version: 3, card: fullCard, followUp: followUp)
        default: Snapshot(version: 2, card: fullCard, followUp: nil)
        }
    }

    static let pendingCard = Card(
        conversationUuid: "demo", person: nil, inferredName: "Sarah Chen", confidence: 0.6, confirmed: false,
        role: nil, org: nil, evidence: ["Introduced themselves as Sarah Chen"], pending: true,
        howYouMet: nil, lastSpoke: nil, openLoops: [], dontForget: [], avoid: [])

    static let fullCard = Card(
        conversationUuid: "demo", person: nil, inferredName: "Sarah Chen", confidence: 0.85, confirmed: false,
        role: "Head of Design", org: "Northwind",
        evidence: ["Introduced themselves as Sarah Chen"], pending: false,
        howYouMet: "Lisbon conference, via Mike",
        lastSpoke: LastSpoke(when: "3 weeks ago", topic: "design hiring"),
        openLoops: [
            OpenLoop(direction: .youOwe, text: "Send Sarah the onboarding doc"),
            OpenLoop(direction: .theyOwe, text: "Sarah to share the Q4 hiring plan"),
        ],
        dontForget: ["Ask about the partnership pilot"],
        avoid: ["Her team's recent layoffs"])

    static let followUp = FollowUp(id: "demo", text: "Send Sarah Chen the onboarding doc and propose a partnership call")
}
