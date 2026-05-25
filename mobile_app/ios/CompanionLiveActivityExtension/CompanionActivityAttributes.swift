import Foundation
import ActivityKit

// ============================================================
// MARK: - 灵动陪伴舱 共享属性定义
// ⚠️ 注意：这个文件必须同时属于主 App 和 Extension 两个 Target
// ============================================================

struct CompanionAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // 这里的变量是动态变化的（如计时器、图片等）
        public var startTime: Date
        
        // 🌟 关键修复：在这里加上这一行，让 UI 能认出图片数据
        public var petAvatarBase64: String?
        
        public init(startTime: Date, petAvatarBase64: String? = nil) {
            self.startTime = startTime
            self.petAvatarBase64 = petAvatarBase64
        }
    }

    // 这里的变量是活动启动后就不变的（静态数据）
    public var petName: String
    public var activityType: String // "walk" | "bath" | "play"

    public init(petName: String, activityType: String) {
        self.petName = petName
        self.activityType = activityType
    }

    // 辅助显示属性
    var display: ActivityDisplay {
        switch activityType {
        case "walk":
            return ActivityDisplay(emoji: "🦮", label: "散步中", accentColor: "#4ADE80")
        case "bath":
            return ActivityDisplay(emoji: "🛁", label: "洗澡中", accentColor: "#60A5FA")
        case "play":
            return ActivityDisplay(emoji: "🎾", label: "陪玩中", accentColor: "#FACC15")
        default:
            return ActivityDisplay(emoji: "🐾", label: "互动中", accentColor: "#FB923C")
        }
    }

    struct ActivityDisplay {
        let emoji: String
        let label: String
        let accentColor: String
    }
}
