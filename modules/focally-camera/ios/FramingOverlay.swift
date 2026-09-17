import QuartzCore
import UIKit

final class FramingOverlay: UIView {
  var onFrameSettled: (() -> Void)?
  var previewBounds: CGRect? { didSet { setNeedsDisplay() } }
  var grid = false { didSet { setNeedsDisplay() } }
  var focalLabel = "" { didSet { setNeedsDisplay() } }
  var focusPoint: CGPoint? { didSet { setNeedsDisplay() } }
  var locked = false { didSet { setNeedsDisplay() } }
  var level: CGFloat? { didSet { setNeedsDisplay() } }

  private(set) var settling = false
  private var shownRect: CGRect?
  private var animationStart: CFTimeInterval = 0
  private var animationFrom = CGRect.zero
  private var animationTo = CGRect.zero
  private var displayLink: CADisplayLink?

  var framingRect: CGRect? {
    didSet {
      guard framingRect != oldValue else { return }
      displayLink?.invalidate()
      displayLink = nil
      guard let from = shownRect, let target = framingRect,
        !UIAccessibility.isReduceMotionEnabled
      else {
        shownRect = framingRect
        settling = false
        setNeedsDisplay()
        return
      }
      animationFrom = from
      animationTo = target
      animationStart = CACurrentMediaTime()
      settling = true
      let link = CADisplayLink(target: self, selector: #selector(animateFrame))
      displayLink = link
      link.add(to: .main, forMode: .common)
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isOpaque = false
    backgroundColor = .clear
    isUserInteractionEnabled = false
    contentMode = .redraw
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    displayLink?.invalidate()
  }

  func lockPoint() -> [String: CGFloat]? {
    guard locked, let point = focusPoint, let frame = framingRect,
      bounds.width > 0, bounds.height > 0, frame.width >= 20, frame.height >= 20
    else {
      return nil
    }
    return [
      "x": min(max(point.x, frame.minX + 10), frame.maxX - 10) / bounds.width,
      "y": min(max(point.y + 31, frame.minY + 10), frame.maxY - 10) / bounds.height,
    ]
  }

  @objc private func animateFrame() {
    let progress = min(1, (CACurrentMediaTime() - animationStart) / 0.14)
    let eased = 1 - pow(1 - progress, 3)
    shownRect = CGRect(
      x: animationFrom.minX + (animationTo.minX - animationFrom.minX) * eased,
      y: animationFrom.minY + (animationTo.minY - animationFrom.minY) * eased,
      width: animationFrom.width + (animationTo.width - animationFrom.width) * eased,
      height: animationFrom.height + (animationTo.height - animationFrom.height) * eased
    )
    setNeedsDisplay()
    if progress >= 1 {
      displayLink?.invalidate()
      displayLink = nil
      shownRect = animationTo
      settling = false
      onFrameSettled?()
    }
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext(), let frame = shownRect else {
      UIColor(red: 20 / 255, green: 21 / 255, blue: 24 / 255, alpha: 1).setFill()
      contextFill(rect)
      return
    }
    let accent = UIColor(red: 235 / 255, green: 205 / 255, blue: 133 / 255, alpha: 1)
    let rounded = UIBezierPath(roundedRect: frame, cornerRadius: 9)
    context.saveGState()
    if let previewBounds {
      context.clip(to: previewBounds)
    }
    let mask = UIBezierPath(rect: bounds)
    mask.append(rounded)
    mask.usesEvenOddFillRule = true
    UIColor(red: 8 / 255, green: 9 / 255, blue: 11 / 255, alpha: 214 / 255).setFill()
    mask.fill()
    context.restoreGState()

    accent.setStroke()
    rounded.lineWidth = 1.2
    rounded.stroke()
    if grid {
      context.saveGState()
      rounded.addClip()
      context.setStrokeColor(UIColor.white.withAlphaComponent(95 / 255).cgColor)
      context.setLineWidth(0.6)
      for index in 1...2 {
        let x = frame.minX + frame.width * CGFloat(index) / 3
        let y = frame.minY + frame.height * CGFloat(index) / 3
        context.move(to: CGPoint(x: x, y: frame.minY))
        context.addLine(to: CGPoint(x: x, y: frame.maxY))
        context.move(to: CGPoint(x: frame.minX, y: y))
        context.addLine(to: CGPoint(x: frame.maxX, y: y))
      }
      context.strokePath()
      context.restoreGState()
    }

    let font = UIFont(name: "Manrope-Medium", size: 12) ?? .systemFont(ofSize: 12, weight: .medium)
    let labelSize = focalLabel.size(withAttributes: [.font: font])
    focalLabel.draw(
      at: CGPoint(x: frame.midX - labelSize.width / 2, y: max(4, frame.minY - 27)),
      withAttributes: [.font: font, .foregroundColor: accent]
    )

    if let angle = level {
      drawLevel(context, frame: frame, angle: angle, accent: accent)
    }
    if let point = focusPoint {
      context.saveGState()
      rounded.addClip()
      accent.setStroke()
      let focus = UIBezierPath(
        roundedRect: CGRect(x: point.x - 18, y: point.y - 18, width: 36, height: 36),
        cornerRadius: 6
      )
      focus.lineWidth = 1
      focus.stroke()
      context.restoreGState()
    }
  }

  private func drawLevel(
    _ context: CGContext,
    frame: CGRect,
    angle: CGFloat,
    accent: UIColor
  ) {
    let y = frame.midY
    let span = min(frame.width * 0.18, 44)
    context.setLineWidth(1.5)
    context.setStrokeColor(UIColor.white.withAlphaComponent(100 / 255).cgColor)
    context.move(to: CGPoint(x: frame.midX - span - 12, y: y))
    context.addLine(to: CGPoint(x: frame.midX - span - 4, y: y))
    context.move(to: CGPoint(x: frame.midX + span + 4, y: y))
    context.addLine(to: CGPoint(x: frame.midX + span + 12, y: y))
    context.strokePath()
    context.saveGState()
    context.translateBy(x: frame.midX, y: y)
    context.rotate(by: -min(max(angle, -45), 45) * .pi / 180)
    context.setStrokeColor(
      (abs(angle) < 1.2 ? accent : UIColor.white.withAlphaComponent(155 / 255)).cgColor
    )
    context.move(to: CGPoint(x: -span, y: 0))
    context.addLine(to: CGPoint(x: span, y: 0))
    context.strokePath()
    context.restoreGState()
  }

  private func contextFill(_ rect: CGRect) {
    UIRectFill(rect)
  }
}
