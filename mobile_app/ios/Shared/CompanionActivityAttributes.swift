import Foundation
import ActivityKit

// ============================================================
// MARK: - 灵动陪伴舱 共享属性定义
// ⚠️ 重要：此文件必须同时勾选 mobileapp 和 Extension 两个 Target
// ============================================================

struct CompanionAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // 这里的变量是会随时间变化的（动态数据）
        var startTime: Date
        
        // 🌟 关键修复：在这里添加头像字段，让 UI 能够识别它
        var petAvatarBase64: String? 
    }

    // 这里的变量是活动启动后就不变的（静态数据）
    var petName: String
    var activityType: String // "walk", "bath", "play"

    // 辅助计算属性：根据类型返回对应的图标和颜色
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