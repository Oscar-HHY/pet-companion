/**
 * Config Plugin: withLiveActivities
 * 向 iOS Info.plist 注入 Live Activities 所需权限。
 * 在每次 `expo prebuild` 后自动生效，无需手动修改 plist。
 */
const { withInfoPlist } = require('@expo/config-plugins');

const withLiveActivities = (config) => {
  return withInfoPlist(config, (config) => {
    // 开启 Live Activities 支持（必须）
    config.modResults['NSSupportsLiveActivities'] = true;
    // 开启高频更新支持（可选，支持 ActivityKit 每秒刷新）
    config.modResults['NSSupportsLiveActivitiesFrequentUpdates'] = true;
    return config;
  });
};

module.exports = withLiveActivities;
