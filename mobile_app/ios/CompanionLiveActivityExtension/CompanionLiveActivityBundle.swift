import WidgetKit
import SwiftUI

// Extension 的入口点，向 WidgetKit 注册所有 Widget
@main
struct CompanionLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        CompanionLiveActivity()
    }
}
