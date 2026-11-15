import 'dart:ui';

import 'package:flutter/widgets.dart';

import '../../core/web_performance.dart';

/// 按运行环境决定是否使用实时背景模糊。
///
/// iOS Web/PWA 上 BackdropFilter 会强制每一帧重新采样背景，叠加高 DPR
/// 画布后非常容易掉帧、发热；此时直接返回子组件（由调用方提供足够不透明
/// 的纯色背景）。桌面端保持原有高斯模糊效果。
class AdaptiveBackdropBlur extends StatelessWidget {
  const AdaptiveBackdropBlur({
    super.key,
    required this.sigma,
    required this.child,
  });

  final double sigma;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (sigma <= 0 || WebPerformance.lowPower) {
      return child;
    }
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
      child: child,
    );
  }
}
