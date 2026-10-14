import Foundation

struct Person: Codable, Equatable {
    let id: String
    let name: String
    let role: String?
    let org: String?
    let howYouMet: String?
}

struct OpenLoop: Codable, Equatable, Hashable {
    enum Direction: String, Codable { case youOwe = "you_owe", theyOwe = "they_owe" }
    let direction: Direction
    let text: String
}

struct LastSpoke: Codable, Equatable {
    let when: String
    let topic: String
}

struct Card: Codable, Equatable {
    let conversationUuid: String
    let person: Person?
    let inferredName: String?
    let confidence: Double
    let confirmed: Bool
    let howYouMet: String?
    let lastSpoke: LastSpoke?
    let openLoops: [OpenLoop]
    let dontForget: [String]
    let avoid: [String]

    var displayName: String? { person?.name ?? inferredName }
}

struct FollowUp: Codable, Equatable {
    let id: String
    let text: String
}

struct Snapshot: Codable {
    let version: Int
    let card: Card?
    let followUp: FollowUp?
}
