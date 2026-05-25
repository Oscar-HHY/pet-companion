import ActivityKit
import SwiftUI
import WidgetKit

// ============================================================
// MARK: - 灵动陪伴舱 Live Activity UI
// Target: CompanionLiveActivityExtension
// ============================================================

struct CompanionLiveActivityView: View {
    let context: ActivityViewContext<CompanionAttributes>

    private var display: CompanionAttributes.ActivityDisplay {
        context.attributes.display
    }

    var body: some View {
        // ── 锁定屏幕 / 通知栏横幅视图 ──────────────────────
        HStack(spacing: 12) {
            // 宠物头像
            if let uiImage = UIImage.fromBase64(context.state.petAvatarBase64) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 42, height: 42)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Text(display.emoji)
                    .font(.system(size: 32))
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("正在陪 \(context.attributes.petName) \(display.label)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.primary)

                Text(context.state.startTime, style: .timer)
                    .font(.system(size: 20, weight: .bold, design: .monospaced))
                    .foregroundColor(accentColor)
            }

            Spacer()

            Text("🐾")
                .font(.system(size: 20))
                .opacity(0.3)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var accentColor: Color {
        Color(hex: display.accentColor) ?? .orange
    }
}

// ============================================================
// MARK: - 灵动岛核心配置
// ============================================================

struct CompanionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CompanionAttributes.self) { context in
            // 锁屏界面样式
            CompanionLiveActivityView(context: context)
                .activityBackgroundTint(Color(.systemBackground).opacity(0.6))
                .activitySystemActionForegroundColor(.primary)

        } dynamicIsland: { context in
            DynamicIsland {
                // ── 展开模式（Expanded） ──────────────────────
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        if let uiImage = UIImage.fromBase64(context.state.petAvatarBase64) {
                            Image(uiImage: uiImage)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: 32, height: 32)
                                .clipShape(Circle())
                        } else {
                            Text(context.attributes.display.emoji)
                                .font(.system(size: 24))
                        }
                        
                        Text(context.attributes.petName)
                            .font(.system(size: 14, weight: .bold))
                            .lineLimit(1)
                    }
                    .padding(.leading, 8)
                    .padding(.top, 8)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.display.label)
                        .font(.system(size: 12, weight: .medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(hex: context.attributes.display.accentColor)?.opacity(0.2) ?? .orange.opacity(0.2))
                        .cornerRadius(10)
                        .padding(.trailing, 8)
                        .padding(.top, 8)
                }

                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 4) {
                        Text(context.state.startTime, style: .timer)
                            .font(.system(size: 36, weight: .bold, design: .monospaced))
                            .foregroundColor(.primary)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    // 装饰性进度条或小爪子
                    HStack(spacing: 4) {
                        ForEach(0..<6) { i in
                            Capsule()
                                .fill(Color(hex: context.attributes.display.accentColor)?.opacity(Double(i+1)/6.0) ?? .orange)
                                .frame(height: 4)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                }

            } compactLeading: {
                // ── 紧凑模式左侧（药丸左边） ──────────────────────
                HStack(spacing: 4) {
                    if let uiImage = UIImage.fromBase64(context.state.petAvatarBase64) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 22, height: 22)
                            .clipShape(Circle())
                    } else {
                        Text("🐾")
                            .font(.system(size: 12))
                    }
                }
                .padding(.leading, 4)

            } compactTrailing: {
                // ── 紧凑模式右侧（药丸右边） ──────────────────────
                Text(context.state.startTime, style: .timer)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(Color(hex: context.attributes.display.accentColor) ?? .orange)
                    .frame(minWidth: 34)
                    .padding(.trailing, 4)

            } minimal: {
                // ── 最小模式（当有多个 App 占用灵动岛时） ──────────
                if let uiImage = UIImage.fromBase64(context.state.petAvatarBase64) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .clipShape(Circle())
                } else {
                    Text("🐾")
                        .font(.system(size: 12))
                }
            }
            .keylineTint(Color(hex: context.attributes.display.accentColor) ?? .orange)
        }
    }
}

// ============================================================
// MARK: - 工具类扩展（十六进制颜色 & Base64转换）
// ============================================================

private extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6,
              let value = UInt64(hex, radix: 16) else { return nil }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

private extension UIImage {
    static func fromBase64(_ base64String: String?) -> UIImage? {
        guard let base64String = base64String, !base64String.isEmpty else { return nil }
        
        // 自动识别并剔除 Data URI 前缀 (如 data:image/png;base64,)
        var cleanedString = base64String
        if let range = base64String.range(of: "base64,") {
            cleanedString = String(base64String[range.upperBound...])
        }
        
        // 过滤掉可能导致解码失败的换行符和空格
        cleanedString = cleanedString.replacingOccurrences(of: "\n", with: "")
                                     .replacingOccurrences(of: " ", with: "")

        guard let data = Data(base64Encoded: cleanedString) else {
            return nil
        }
        return UIImage(data: data)
    }
}