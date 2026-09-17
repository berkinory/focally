import AVFoundation
import CoreLocation
import CoreMotion
import ExpoModulesCore
import UIKit

final class FocallyCameraView: ExpoView, AVCapturePhotoCaptureDelegate {
  let onStatus = EventDispatcher()
  let onControls = EventDispatcher()
  let onShutter = EventDispatcher()

  private let session = AVCaptureSession()
  private let photoOutput = AVCapturePhotoOutput()
  private let sessionQueue = DispatchQueue(label: "dev.berk.focally.camera-session")
  private let processingQueue = DispatchQueue(label: "dev.berk.focally.photo-processing")
  private let overlay = FramingOverlay()
  private let motion = CMMotionManager()
  private let location = PhotoLocationProvider()
  private lazy var previewLayer = AVCaptureVideoPreviewLayer(session: session)

  private var input: AVCaptureDeviceInput?
  private var source: CameraSource?
  private var active = false
  private var attached = false
  private var disposed = false
  private var configured = false
  private var busy = false
  private var interactionLocked = false
  private var levelEnabled = false
  private var locationEnabled = false
  private var requestedMillimeters = 35.0
  private var framingMillimeters = 35.0
  private var ratio = PhotoRatio.sensor
  private var flashMode = "off"
  private var requestedExposure = 0.0
  private var focusLocked = false
  private var exposureLocked = false
  private var controlsSettling = false
  private var status = "starting"
  private var capturePromise: Promise?
  private var captureAutoSave = false
  private var captureKeepOriginal = false
  private var captureLocation: CLLocation?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = UIColor(red: 20 / 255, green: 21 / 255, blue: 24 / 255, alpha: 1)
    clipsToBounds = true
    previewLayer.videoGravity = .resizeAspect
    layer.addSublayer(previewLayer)
    addSubview(overlay)
    overlay.onFrameSettled = { [weak self] in
      self?.refreshFrame()
    }
    addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped(_:))))
    let longPress = UILongPressGestureRecognizer(target: self, action: #selector(longPressed(_:)))
    longPress.minimumPressDuration = 0.45
    addGestureRecognizer(longPress)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    motion.stopDeviceMotionUpdates()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    attached = window != nil
    if attached {
      synchronizeCamera()
    } else {
      stop()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
    overlay.frame = bounds
    updateOrientation()
    refreshFrame()
  }

  func setActive(_ value: Bool) {
    active = value
    UIApplication.shared.isIdleTimerDisabled = value
    if value {
      synchronizeCamera()
    } else {
      stop()
    }
  }

  func setFocalLength(_ value: Double) {
    guard [35.0, 50.0, 85.0].contains(value) else {
      emit("error", errorCode: "UNSUPPORTED_FOCAL_LENGTH")
      return
    }
    guard requestedMillimeters != value else { return }
    requestedMillimeters = value
    guard !busy else { return }
    unlockFocus()
    emit("adjusting")
    synchronizeCamera()
  }

  func setFocalLabel(_ value: String) {
    overlay.focalLabel = value
  }

  func setGrid(_ value: Bool) {
    overlay.grid = value
  }

  func setRatio(_ value: String) {
    guard let next = PhotoRatio(rawValue: value), next != ratio else { return }
    ratio = next
    unlockFocus()
    emit("adjusting")
    refreshFrame()
  }

  func setInteractionLocked(_ value: Bool) {
    interactionLocked = value
  }

  func setExposure(_ value: Double) {
    guard value.isFinite else { return }
    requestedExposure = value
    applyExposure()
  }

  func setFlash(_ value: String) {
    guard ["off", "auto", "on"].contains(value) else { return }
    flashMode = value
    publishControls()
  }

  func setLevel(_ value: Bool) {
    levelEnabled = value
    updateAccessories()
  }

  func setVolumeShutter(_: Bool) {
    // iOS intentionally exposes no volume-button shutter capability.
  }

  func setPhotoLocation(_ value: Bool) {
    locationEnabled = value
    updateAccessories()
  }

  func unlockFocus() {
    guard let device = input?.device else {
      clearFocusState()
      return
    }
    do {
      try device.lockForConfiguration()
      if device.isFocusModeSupported(.continuousAutoFocus) {
        device.focusMode = .continuousAutoFocus
      }
      if device.isExposureModeSupported(.continuousAutoExposure) {
        device.exposureMode = .continuousAutoExposure
      }
      device.unlockForConfiguration()
      clearFocusState()
    } catch {
      emit("error", errorCode: "EXPOSURE_UNLOCK_FAILED")
    }
  }

  func capture(_ autoSave: Bool, _ keepOriginal: Bool, _ promise: Promise) {
    guard !busy, status == "ready", !controlsSettling, !overlay.settling,
      let device = input?.device, session.isRunning
    else {
      promise.reject("CAMERA_NOT_READY", "The camera is not ready yet.")
      return
    }
    busy = true
    capturePromise = promise
    captureAutoSave = autoSave
    captureKeepOriginal = keepOriginal
    captureLocation = locationEnabled ? location.snapshot() : nil
    emit("capturing")
    updateOrientation()
    let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
    settings.photoQualityPrioritization = .quality
    if photoOutput.maxPhotoDimensions.width > 0 && photoOutput.maxPhotoDimensions.height > 0 {
      settings.maxPhotoDimensions = photoOutput.maxPhotoDimensions
    }
    if device.hasFlash {
      settings.flashMode = flashMode == "on" ? .on : flashMode == "auto" ? .auto : .off
    }
    photoOutput.capturePhoto(with: settings, delegate: self)
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    if let error {
      DispatchQueue.main.async { [weak self] in
        self?.failCapture("CAPTURE_FAILED", error)
      }
      return
    }
    guard let data = photo.fileDataRepresentation() else {
      DispatchQueue.main.async { [weak self] in
        self?.failCapture(
          "CAPTURE_FAILED",
          CatalogError("The camera returned no JPEG data.")
        )
      }
      return
    }
    DispatchQueue.main.async { [weak self] in
      self?.processCaptured(data)
    }
  }

  private func processCaptured(_ data: Data) {
    guard let shotSource = source else {
      failCapture("CAPTURE_FAILED", CatalogError("The camera source is unavailable."))
      return
    }
    let shotMillimeters = framingMillimeters
    let shotRatio = ratio
    let autoSave = captureAutoSave
    let keepOriginal = captureKeepOriginal
    let shotLocation = captureLocation
    emit("saving")
    processingQueue.async { [weak self] in
      do {
        let capture = try PhotoProcessor.process(
          data: data,
          targetMillimeters: shotMillimeters,
          baseMillimeters: shotSource.baseMillimeters,
          ratio: shotRatio,
          keepOriginal: keepOriginal,
          location: shotLocation
        )
        if autoSave {
          let owner = self
          Task {
            var exportFailed = false
            for photo in capture.photos {
              do {
                _ = try await PhotoExporter.export(photo, newCopy: false)
              } catch {
                exportFailed = true
              }
            }
            let didFail = exportFailed
            await MainActor.run {
              owner?.completeCapture(capture.selected, exportFailed: didFail)
            }
          }
        } else {
          DispatchQueue.main.async {
            self?.completeCapture(capture.selected, exportFailed: false)
          }
        }
      } catch {
        DispatchQueue.main.async {
          self?.failCapture("SAVE_FAILED", error)
        }
      }
    }
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    if let error, capturePromise != nil, status == "capturing" {
      DispatchQueue.main.async { [weak self] in
        self?.failCapture("CAPTURE_FAILED", error)
      }
    }
  }

  func dispose() {
    active = false
    disposed = true
    stop()
    if let promise = capturePromise {
      promise.reject("CAMERA_CLOSED", "The camera was closed.")
      capturePromise = nil
    }
  }

  @objc private func applicationDidBecomeActive() {
    synchronizeCamera()
  }

  @objc private func applicationDidEnterBackground() {
    stop()
  }

  private func synchronizeCamera() {
    guard active, attached, !disposed, bounds.width > 0, bounds.height > 0, !busy else { return }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      emit("error", errorCode: "CAMERA_PERMISSION")
      return
    }
    let requested = requestedMillimeters
    emit(configured ? "adjusting" : "starting")
    sessionQueue.async { [weak self] in
      guard let self, !self.disposed else { return }
      do {
        let selected = try self.source(for: requested)
        if self.input?.device.uniqueID != selected.deviceID {
          try self.configure(selected)
        }
        self.framingMillimeters = requested
        if !self.session.isRunning {
          self.session.startRunning()
        }
        DispatchQueue.main.async {
          guard self.active, !self.disposed else { return }
          self.configured = true
          self.applyExposure()
          self.updateAccessories()
          self.refreshFrame()
        }
      } catch {
        DispatchQueue.main.async {
          self.emit("error", errorCode: "CAMERA_START_FAILED")
        }
      }
    }
  }

  private func configure(_ selected: CameraSource) throws {
    let discovery = AVCaptureDevice.DiscoverySession(
      deviceTypes: [.builtInWideAngleCamera, .builtInTelephotoCamera],
      mediaType: .video,
      position: .back
    )
    guard let device = discovery.devices.first(where: { $0.uniqueID == selected.deviceID }) else {
      throw CatalogError("The selected camera is unavailable.")
    }
    let nextInput = try AVCaptureDeviceInput(device: device)
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.sessionPreset = .photo
    if let input {
      session.removeInput(input)
    }
    guard session.canAddInput(nextInput) else {
      throw CatalogError("The selected camera input cannot be used.")
    }
    session.addInput(nextInput)
    if !session.outputs.contains(photoOutput) {
      guard session.canAddOutput(photoOutput) else {
        throw CatalogError("The photo output cannot be used.")
      }
      session.addOutput(photoOutput)
    }
    if let dimensions = device.activeFormat.supportedMaxPhotoDimensions
      .filter({ Int64($0.width) * Int64($0.height) <= 16_000_000 })
      .max(by: { Int64($0.width) * Int64($0.height) < Int64($1.width) * Int64($1.height) })
      ?? device.activeFormat.supportedMaxPhotoDimensions.first
    {
      photoOutput.maxPhotoDimensions = dimensions
    }
    photoOutput.maxPhotoQualityPrioritization = .quality
    input = nextInput
    source = CameraSource(
      deviceID: selected.deviceID,
      baseMillimeters: CameraGeometry.equivalentFocalLength(for: device.activeFormat.videoFieldOfView)
        ?? selected.baseMillimeters
    )
  }

  private func source(for millimeters: Double) throws -> CameraSource {
    let discovery = AVCaptureDevice.DiscoverySession(
      deviceTypes: [.builtInWideAngleCamera, .builtInTelephotoCamera],
      mediaType: .video,
      position: .back
    )
    let sources = discovery.devices.compactMap { device -> CameraSource? in
      guard let equivalent = CameraGeometry.equivalentFocalLength(
        for: device.activeFormat.videoFieldOfView
      ) else { return nil }
      return CameraSource(deviceID: device.uniqueID, baseMillimeters: equivalent)
    }
    guard let main = sources.min(by: {
      abs($0.baseMillimeters - 26) < abs($1.baseMillimeters - 26)
    }) else {
      throw CatalogError("No supported back camera is available.")
    }
    if millimeters >= 70,
      let telephoto = sources
        .filter({ $0.baseMillimeters > main.baseMillimeters * 1.6 && $0.baseMillimeters <= millimeters })
        .max(by: { $0.baseMillimeters < $1.baseMillimeters })
    {
      return telephoto
    }
    return main
  }

  private func stop() {
    updateAccessories(forceOff: true)
    UIApplication.shared.isIdleTimerDisabled = false
    sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else { return }
      self.session.stopRunning()
    }
    if !busy {
      emit("paused")
    }
  }

  private func refreshFrame() {
    guard active, configured, let source, bounds.width > 0, bounds.height > 0 else { return }
    let orientation = currentOrientation()
    let dimensions = input.map {
      CMVideoFormatDescriptionGetDimensions($0.device.activeFormat.formatDescription)
    }
    let sourceAspect = dimensions.map {
      CGFloat(max($0.width, $0.height)) / CGFloat(min($0.width, $0.height))
    } ?? 4 / 3
    let videoAspect = orientation.isPortrait ? 1 / sourceAspect : sourceAspect
    let videoRect = CameraGeometry.aspectFitRect(aspect: videoAspect, inside: bounds)
    let next = CameraGeometry.frame(
      in: videoRect,
      baseMillimeters: source.baseMillimeters,
      targetMillimeters: framingMillimeters,
      ratio: ratio,
      sourceAspect: sourceAspect
    )
    guard next.width > 0, next.height > 0 else { return }
    overlay.previewBounds = videoRect
    overlay.framingRect = next
    if overlay.settling {
      emit("adjusting")
    } else if !busy {
      emit("ready")
    }
  }

  private func applyExposure() {
    guard let device = input?.device else {
      publishControls()
      return
    }
    let bias = min(max(Float(requestedExposure), device.minExposureTargetBias), device.maxExposureTargetBias)
    guard abs(device.exposureTargetBias - bias) > 0.01 else {
      publishControls()
      return
    }
    do {
      try device.lockForConfiguration()
      if exposureLocked, device.isExposureModeSupported(.continuousAutoExposure) {
        device.exposureMode = .continuousAutoExposure
        exposureLocked = false
        overlay.locked = focusLocked
      }
      controlsSettling = true
      device.setExposureTargetBias(bias) { [weak self] _ in
        DispatchQueue.main.async {
          self?.controlsSettling = false
          self?.publishControls()
        }
      }
      device.unlockForConfiguration()
      publishControls()
    } catch {
      emit("error", errorCode: "EXPOSURE_FAILED")
    }
  }

  @objc private func tapped(_ gesture: UITapGestureRecognizer) {
    guard gesture.state == .ended else { return }
    focus(at: gesture.location(in: self), lock: false)
  }

  @objc private func longPressed(_ gesture: UILongPressGestureRecognizer) {
    guard gesture.state == .began else { return }
    focus(at: gesture.location(in: self), lock: true)
  }

  private func focus(at point: CGPoint, lock: Bool) {
    guard status == "ready", !busy, !interactionLocked,
      overlay.framingRect?.contains(point) == true,
      let device = input?.device
    else { return }
    let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: point)
    do {
      try device.lockForConfiguration()
      if device.isFocusPointOfInterestSupported {
        device.focusPointOfInterest = devicePoint
      }
      if device.isExposurePointOfInterestSupported {
        device.exposurePointOfInterest = devicePoint
      }
      if device.isFocusModeSupported(.autoFocus) {
        device.focusMode = .autoFocus
      }
      if device.isExposureModeSupported(.autoExpose) {
        device.exposureMode = .autoExpose
      }
      device.unlockForConfiguration()
      overlay.focusPoint = point
      controlsSettling = true
      publishControls()
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) { [weak self, weak device] in
        guard let self, let device, self.input?.device === device else { return }
        self.finishFocus(device, lock: lock)
      }
    } catch {
      emit("error", errorCode: "METERING_FAILED")
    }
  }

  private func finishFocus(_ device: AVCaptureDevice, lock: Bool) {
    do {
      if lock {
        try device.lockForConfiguration()
        if device.isFocusModeSupported(.locked) {
          device.focusMode = .locked
          focusLocked = true
        }
        if device.isExposureModeSupported(.locked) {
          device.exposureMode = .locked
          exposureLocked = true
        }
        device.unlockForConfiguration()
      }
      controlsSettling = false
      overlay.locked = focusLocked || exposureLocked
      publishControls()
      if !lock {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
          guard self?.focusLocked == false else { return }
          self?.overlay.focusPoint = nil
        }
      }
    } catch {
      controlsSettling = false
      emit("error", errorCode: "EXPOSURE_LOCK_FAILED")
    }
  }

  private func clearFocusState() {
    focusLocked = false
    exposureLocked = false
    controlsSettling = false
    overlay.locked = false
    overlay.focusPoint = nil
    publishControls()
  }

  private func publishControls() {
    let device = input?.device
    let exposureMin = Double(device?.minExposureTargetBias ?? 0)
    let exposureMax = Double(device?.maxExposureTargetBias ?? 0)
    let exposure = Double(device?.exposureTargetBias ?? 0)
    let lockPoint: Any = overlay.lockPoint() ?? NSNull()
    let payload: [String: Any] = [
      "exposureSupported": device != nil,
      "exposureMin": exposureMin,
      "exposureMax": exposureMax,
      "exposureStep": 1.0 / 3.0,
      "exposure": exposure,
      "hasFlash": device?.hasFlash ?? false,
      "focusLocked": focusLocked,
      "exposureLocked": exposureLocked,
      "lockPoint": lockPoint,
      "settling": controlsSettling || overlay.settling,
    ]
    onControls(payload)
  }

  private func updateAccessories(forceOff: Bool = false) {
    let live = !forceOff && active && attached && configured && session.isRunning
    location.setEnabled(live && locationEnabled)
    if live && levelEnabled && motion.isDeviceMotionAvailable {
      guard !motion.isDeviceMotionActive else { return }
      motion.deviceMotionUpdateInterval = 1.0 / 30.0
      motion.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
        guard let self, let gravity = motion?.gravity else { return }
        let radians: Double
        switch self.currentOrientation() {
        case .landscapeLeft:
          radians = atan2(-gravity.y, gravity.x)
        case .landscapeRight:
          radians = atan2(gravity.y, -gravity.x)
        case .portraitUpsideDown:
          radians = atan2(-gravity.x, gravity.y)
        default:
          radians = atan2(gravity.x, -gravity.y)
        }
        self.overlay.level = CGFloat(radians * 180 / .pi)
      }
    } else {
      motion.stopDeviceMotionUpdates()
      overlay.level = nil
    }
  }

  private func updateOrientation() {
    let orientation = currentOrientation()
    if let connection = previewLayer.connection, connection.isVideoOrientationSupported {
      connection.videoOrientation = orientation
    }
    if let connection = photoOutput.connection(with: .video), connection.isVideoOrientationSupported {
      connection.videoOrientation = orientation
    }
  }

  private func currentOrientation() -> AVCaptureVideoOrientation {
    guard let orientation = window?.windowScene?.interfaceOrientation else { return .portrait }
    switch orientation {
    case .landscapeLeft:
      return .landscapeLeft
    case .landscapeRight:
      return .landscapeRight
    case .portraitUpsideDown:
      return .portraitUpsideDown
    default:
      return .portrait
    }
  }

  private func completeCapture(_ photo: StoredPhoto, exportFailed: Bool) {
    guard let promise = capturePromise else { return }
    var result = photo.dictionary
    result["exportFailed"] = exportFailed
    promise.resolve(result)
    capturePromise = nil
    busy = false
    captureLocation = nil
    if active {
      emit("adjusting")
      refreshFrame()
    } else {
      emit("paused")
    }
  }

  private func failCapture(_ code: String, _ error: Error) {
    guard let promise = capturePromise else { return }
    promise.reject(code, error.localizedDescription)
    capturePromise = nil
    busy = false
    captureLocation = nil
    if active {
      emit("adjusting")
      refreshFrame()
    } else {
      emit("paused")
    }
  }

  private func emit(_ value: String, errorCode: String? = nil) {
    status = value
    let frame: Any
    if let rect = overlay.framingRect, bounds.width > 0, bounds.height > 0 {
      frame = [
        "x": rect.minX / bounds.width,
        "y": rect.minY / bounds.height,
        "width": rect.width / bounds.width,
        "height": rect.height / bounds.height,
      ]
    } else {
      frame = NSNull()
    }
    onStatus([
      "status": value,
      "frame": frame,
      "errorCode": errorCode as Any? ?? NSNull(),
      "focalLength": framingMillimeters,
      "baseFocalLength": source?.baseMillimeters as Any? ?? NSNull(),
      "cameraId": source?.deviceID as Any? ?? NSNull(),
      "ratio": ratio.rawValue,
    ])
  }
}

private extension AVCaptureVideoOrientation {
  var isPortrait: Bool {
    self == .portrait || self == .portraitUpsideDown
  }
}
