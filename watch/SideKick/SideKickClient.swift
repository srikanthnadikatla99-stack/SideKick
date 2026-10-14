import Foundation

enum SideKickError: LocalizedError {
    case notConfigured
    case http(Int)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Set SIDEKICK_BASE_URL and SIDEKICK_TOKEN in Secrets.xcconfig"
        case .http(let code): "Server returned \(code)"
        }
    }
}

/// HTTPS client for the SideKick server. watchOS restricts WebSockets (TN3135), so state arrives by long-poll.
struct SideKickClient {
    let baseURL: URL
    let token: String
    private let session: URLSession

    init?(bundle: Bundle = .main) {
        guard
            let raw = bundle.object(forInfoDictionaryKey: "SideKickBaseURL") as? String,
            let url = URL(string: raw), url.scheme == "https",
            let token = bundle.object(forInfoDictionaryKey: "SideKickToken") as? String, token.count >= 32
        else { return nil }
        self.baseURL = url
        self.token = token
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 40
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
    }

    func state(since version: Int, wait seconds: Int = 25) async throws -> Snapshot {
        var components = URLComponents(url: baseURL.appending(path: "api/state"), resolvingAgainstBaseURL: false)!
        components.queryItems = [.init(name: "since", value: String(version)), .init(name: "wait", value: String(seconds))]
        return try await send(URLRequest(url: components.url!))
    }

    func confirm(conversationUuid: String, personId: String?, name: String?) async throws -> Snapshot {
        try await post("api/confirm", ["conversationUuid": conversationUuid, "personId": personId, "name": name])
    }

    func reject(conversationUuid: String, name: String) async throws -> Snapshot {
        try await post("api/reject", ["conversationUuid": conversationUuid, "name": name])
    }

    func approveFollowUp(id: String) async throws {
        let _: FollowUp = try await post("api/followups/\(id)/approve", [:])
    }

    func dismissFollowUp(id: String) async throws -> Snapshot {
        try await post("api/followups/\(id)/dismiss", [:])
    }

    private func post<T: Decodable>(_ path: String, _ body: [String: String?]) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body.compactMapValues { $0 })
        return try await send(request)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        var request = request
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw SideKickError.http(status) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
