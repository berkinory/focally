import AVFoundation
import CoreLocation
import Foundation

enum FocallyPermissions {
  static func cameraState() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return "granted"
    case .notDetermined:
      return "denied"
    case .denied, .restricted:
      return "blocked"
    @unknown default:
      return "blocked"
    }
  }

  static func requestCamera(_ completion: @escaping (String) -> Void) {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined else {
      completion(cameraState())
      return
    }
    AVCaptureDevice.requestAccess(for: .video) { _ in
      completion(cameraState())
    }
  }

  static func locationState() -> String {
    locationState(CLLocationManager().authorizationStatus)
  }

  static func locationState(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .authorizedAlways, .authorizedWhenInUse:
      return "granted"
    case .notDetermined:
      return "denied"
    case .denied, .restricted:
      return "blocked"
    @unknown default:
      return "blocked"
    }
  }
}

final class LocationPermissionRequester: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var completions: [(String) -> Void] = []

  override init() {
    super.init()
    manager.delegate = self
  }

  func request(_ completion: @escaping (String) -> Void) {
    let state = FocallyPermissions.locationState()
    guard state == "denied",
      manager.authorizationStatus == .notDetermined
    else {
      completion(state)
      return
    }
    completions.append(completion)
    manager.requestWhenInUseAuthorization()
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard manager.authorizationStatus != .notDetermined else {
      return
    }
    let callbacks = completions
    completions.removeAll()
    let state = FocallyPermissions.locationState(manager.authorizationStatus)
    callbacks.forEach { $0(state) }
  }
}

final class PhotoLocationProvider: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private(set) var latest: CLLocation?
  private var enabled = false

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.distanceFilter = 5
  }

  func setEnabled(_ value: Bool) {
    enabled = value
    if value && FocallyPermissions.locationState() == "granted" {
      manager.startUpdatingLocation()
    } else {
      manager.stopUpdatingLocation()
      latest = nil
    }
  }

  func snapshot() -> CLLocation? {
    guard enabled, let latest,
      latest.horizontalAccuracy >= 0,
      abs(latest.timestamp.timeIntervalSinceNow) < 120
    else {
      return nil
    }
    return latest
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    latest = locations.last(where: { $0.horizontalAccuracy >= 0 }) ?? latest
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if (error as? CLError)?.code == .denied {
      setEnabled(false)
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if enabled {
      setEnabled(true)
    }
  }
}
