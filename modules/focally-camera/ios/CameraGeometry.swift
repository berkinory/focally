import CoreGraphics
import Foundation

enum PhotoRatio: String {
  case sensor = "4:3"
  case classic = "3:2"
  case square = "1:1"

  var dimensions: (wide: CGFloat, tall: CGFloat) {
    switch self {
    case .sensor:
      return (4, 3)
    case .classic:
      return (3, 2)
    case .square:
      return (1, 1)
    }
  }
}

struct CameraSource {
  let deviceID: String
  let baseMillimeters: Double
}

enum CameraGeometry {
  static func equivalentFocalLength(for fieldOfView: Float) -> Double? {
    guard fieldOfView.isFinite, fieldOfView > 1, fieldOfView < 179 else {
      return nil
    }
    let radians = Double(fieldOfView) * .pi / 180
    let millimeters = 36 / (2 * tan(radians / 2))
    return millimeters.isFinite && millimeters > 0 ? millimeters : nil
  }

  static func normalizedFrame(
    baseMillimeters: Double,
    targetMillimeters: Double,
    sourceAspect: CGFloat = 4 / 3,
    ratio: PhotoRatio
  ) -> CGRect {
    precondition(baseMillimeters.isFinite && baseMillimeters > 0)
    precondition(targetMillimeters.isFinite && targetMillimeters > 0)
    let coverage = min(1, CGFloat(baseMillimeters / targetMillimeters))
    let wanted = ratio.dimensions.wide / ratio.dimensions.tall
    let width = coverage * min(1, wanted / sourceAspect)
    let height = coverage * min(1, sourceAspect / wanted)
    return CGRect(x: (1 - width) / 2, y: (1 - height) / 2, width: width, height: height)
  }

  static func aspectFitRect(aspect: CGFloat, inside bounds: CGRect) -> CGRect {
    guard aspect > 0, bounds.width > 0, bounds.height > 0 else {
      return .zero
    }
    if bounds.width / bounds.height > aspect {
      let width = bounds.height * aspect
      return CGRect(x: bounds.midX - width / 2, y: bounds.minY, width: width, height: bounds.height)
    }
    let height = bounds.width / aspect
    return CGRect(x: bounds.minX, y: bounds.midY - height / 2, width: bounds.width, height: height)
  }

  static func frame(
    in videoRect: CGRect,
    baseMillimeters: Double,
    targetMillimeters: Double,
    ratio: PhotoRatio,
    sourceAspect: CGFloat = 4 / 3
  ) -> CGRect {
    let normalized = normalizedFrame(
      baseMillimeters: baseMillimeters,
      targetMillimeters: targetMillimeters,
      sourceAspect: sourceAspect,
      ratio: ratio
    )
    let portrait = videoRect.height > videoRect.width
    let displayed = portrait
      ? CGRect(
        x: normalized.minY,
        y: normalized.minX,
        width: normalized.height,
        height: normalized.width
      )
      : normalized
    return CGRect(
      x: videoRect.minX + displayed.minX * videoRect.width,
      y: videoRect.minY + displayed.minY * videoRect.height,
      width: displayed.width * videoRect.width,
      height: displayed.height * videoRect.height
    ).integral
  }

  static func pixelCrop(
    imageSize: CGSize,
    baseMillimeters: Double,
    targetMillimeters: Double,
    ratio: PhotoRatio
  ) -> CGRect {
    precondition(imageSize.width > 0 && imageSize.height > 0)
    let portrait = imageSize.height > imageSize.width
    let sourceAspect = portrait
      ? imageSize.height / imageSize.width
      : imageSize.width / imageSize.height
    let normalized = normalizedFrame(
      baseMillimeters: baseMillimeters,
      targetMillimeters: targetMillimeters,
      sourceAspect: sourceAspect,
      ratio: ratio
    )
    let wanted = portrait
      ? ratio.dimensions.tall / ratio.dimensions.wide
      : ratio.dimensions.wide / ratio.dimensions.tall
    let maximumWidth = imageSize.width * (portrait ? normalized.height : normalized.width)
    let maximumHeight = imageSize.height * (portrait ? normalized.width : normalized.height)
    var width = floor(min(maximumWidth, maximumHeight * wanted))
    var height = floor(width / wanted)
    if height > maximumHeight {
      height = floor(maximumHeight)
      width = floor(height * wanted)
    }
    width = max(portrait ? ratio.dimensions.tall : ratio.dimensions.wide, width)
    height = max(portrait ? ratio.dimensions.wide : ratio.dimensions.tall, height)
    return CGRect(
      x: floor((imageSize.width - width) / 2),
      y: floor((imageSize.height - height) / 2),
      width: width,
      height: height
    )
  }
}
