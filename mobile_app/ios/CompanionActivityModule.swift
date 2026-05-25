import Foundation
import ActivityKit
import UIKit

@objc(CompanionActivityModule)
class CompanionActivityModule: NSObject {

    private var currentActivityBox: Any?

    @available(iOS 16.2, *)
    private var currentActivity: Activity<CompanionAttributes>? {
        get { currentActivityBox as? Activity<CompanionAttributes> }
        set { currentActivityBox = newValue }
    }

    @objc func startActivity(
        _ payloadJson: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            reject("UNSUPPORTED", "Live Activities require iOS 16.2+", nil); return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            reject("DISABLED", "Live Activities are disabled by the user", nil); return
        }

        guard let data = payloadJson.data(using: .utf8),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let petName = payload["petName"] as? String,
              let activityType = payload["activityType"] as? String else {
            reject("INVALID_PAYLOAD", "Invalid JSON payload", nil); return
        }

        let pixelAvatarPath = payload["pixelAvatarUrl"] as? String ?? ""
        print("[LAModule] startActivity petName=\(petName) type=\(activityType) avatarPath=\(pixelAvatarPath)")

        if let existing = currentActivity {
            Task { await existing.end(nil, dismissalPolicy: .immediate) }
        }

        let compressedBase64 = pixelAvatarPath.isEmpty ? nil : compressLocalFile(path: pixelAvatarPath)
        print("[LAModule] compressedBase64 is \(compressedBase64 == nil ? "nil" : "\(compressedBase64!.count) chars")")

        let attributes = CompanionAttributes(petName: petName, activityType: activityType)
        let initialState = CompanionAttributes.ContentState(
            startTime: Date(),
            petAvatarBase64: compressedBase64
        )

        do {
            let activity = try Activity<CompanionAttributes>.request(
                attributes: attributes,
                content: .init(state: initialState, staleDate: nil),
                pushType: nil
            )
            currentActivity = activity
            resolve(["activityId": activity.id])
        } catch {
            reject("START_FAILED", "Failed to start: \(error.localizedDescription)", error)
        }
    }

    @objc func updateActivity(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            reject("UNSUPPORTED", "Live Activities require iOS 16.2+", nil); return
        }
        guard let activity = currentActivity else {
            reject("NO_ACTIVITY", "No active Live Activity found", nil); return
        }
        Task {
            let s = CompanionAttributes.ContentState(
                startTime: Date(),
                petAvatarBase64: activity.content.state.petAvatarBase64
            )
            await activity.update(.init(state: s, staleDate: nil))
            resolve(["updated": true])
        }
    }

    @objc func stopActivity(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            reject("UNSUPPORTED", "Live Activities require iOS 16.2+", nil); return
        }
        guard let activity = currentActivity else {
            resolve(["stopped": false, "reason": "no_active_activity"]); return
        }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            self.currentActivity = nil
            resolve(["stopped": true])
        }
    }

    @objc static func requiresMainQueueSetup() -> Bool { return false }

    // ──────────────────────────────────────────────────────────
    // 渐进式压缩：从 50px → 40px → 30px 逐级尝试，确保 base64 ≤ 3900 chars
    // ContentState 总限制 4096 bytes，startTime 等开销约 100 bytes
    // ──────────────────────────────────────────────────────────
    private func compressLocalFile(path: String) -> String? {
        let cleanPath = path.hasPrefix("file://") ? String(path.dropFirst(7)) : path
        print("[LAModule] 尝试读取文件: \(cleanPath)")

        guard let original = UIImage(contentsOfFile: cleanPath) else {
            print("[LAModule] ❌ UIImage(contentsOfFile:) 失败")
            return nil
        }
        print("[LAModule] ✅ 图片加载成功 \(original.size.width)x\(original.size.height)")

        // 渐进式压缩：每次缩小尺寸 + 降低质量
        let attempts: [(CGFloat, CGFloat)] = [
            (50, 0.3),
            (40, 0.25),
            (30, 0.2),
        ]

        for (side, quality) in attempts {
            let size = CGSize(width: side, height: side)
            let renderer = UIGraphicsImageRenderer(size: size)
            let resized = renderer.image { _ in
                original.draw(in: CGRect(origin: .zero, size: size))
            }
            if let jpeg = resized.jpegData(compressionQuality: quality) {
                let base64 = jpeg.base64EncodedString()
                print("[LAModule] 压缩 \(Int(side))x\(Int(side)) q\(quality): JPEG=\(jpeg.count)B base64=\(base64.count)chars")
                if base64.count <= 3900 {
                    print("[LAModule] ✅ 使用此级别")
                    return base64
                }
            }
        }

        print("[LAModule] ❌ 所有压缩级别均超限")
        return nil
    }
}
