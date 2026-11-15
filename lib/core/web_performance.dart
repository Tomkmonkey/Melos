import 'package:flutter/foundation.dart';

/// Web 端性能开关。
///
/// iOS Safari（尤其是添加到主屏幕的 PWA）对全屏实时高斯模糊、持续旋转
/// 动画和高 DPR 的 CanvasKit 画布非常敏感：容易掉帧，并让手机明显发热。
/// 因此在 iPhone/iPad 上关闭这些高开销效果，改用半透明纯色与静态封面；
/// 桌面浏览器仍保留完整的液态玻璃视觉效果。
class WebPerformance {
  const WebPerformance._();

  /// 是否为需要降级特效的移动端 Web 环境。
  static bool get lowPower =>
      kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  /// 移动端浏览器（iPhone/iPad/Android）。
  ///
  /// 持续动画（跑马灯、均衡器徽标、骨架屏呼吸）会让 Flutter 一直排帧，
  /// 听歌时也无法进入空闲。移动端统一改为静态展示；桌面浏览器保留动效。
  static bool get mobileWeb =>
      kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);
}
