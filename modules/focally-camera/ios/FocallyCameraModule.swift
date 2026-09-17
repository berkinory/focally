import ExpoModulesCore
import UIKit

public final class FocallyCameraModule: Module {
  private let moduleQueue = DispatchQueue(label: "dev.berk.focally.module", qos: .userInitiated)
  private lazy var locationPermission = LocationPermissionRequester()

  public func definition() -> ModuleDefinition {
    Name("FocallyCamera")

    Constant("capabilities") {
      ["deleteDeviceCopies": false, "volumeShutter": false]
    }

    AsyncFunction("getCameraPermission") {
      FocallyPermissions.cameraState()
    }.runOnQueue(.main)
    AsyncFunction("requestCameraPermission") { (promise: Promise) in
      FocallyPermissions.requestCamera { promise.resolve($0) }
    }.runOnQueue(.main)
    AsyncFunction("getLocationPermission") {
      FocallyPermissions.locationState()
    }.runOnQueue(.main)
    AsyncFunction("requestLocationPermission") { (promise: Promise) in
      self.locationPermission.request { promise.resolve($0) }
    }.runOnQueue(.main)

    AsyncFunction("getLastPhoto") {
      try PhotoCatalog.shared.latest()?.dictionary
    }.runOnQueue(moduleQueue)
    AsyncFunction("getPhotos") { (before: String?, favoritesOnly: Bool) in
      let page = try PhotoCatalog.shared.page(before: before, favoritesOnly: favoritesOnly)
      return ["photos": page.photos, "nextCursor": page.cursor as Any? ?? NSNull()]
    }.runOnQueue(moduleQueue)
    AsyncFunction("getPhoto") { (uri: String) in
      try PhotoCatalog.shared.details(uri)?.dictionary
    }.runOnQueue(moduleQueue)
    AsyncFunction("setFavorite") { (uri: String, value: Bool) in
      try PhotoCatalog.shared.setFavorite(uri, value)
    }.runOnQueue(moduleQueue)
    AsyncFunction("deletePhoto") { (uri: String, _: Bool) in
      try PhotoCatalog.shared.delete(uri)
    }.runOnQueue(moduleQueue)

    AsyncFunction("saveToGallery") { (uri: String, promise: Promise) in
      Task {
        do {
          guard let photo = try PhotoCatalog.shared.details(uri) else {
            throw CatalogError("Photo is no longer available.")
          }
          promise.resolve(try await PhotoExporter.export(photo, newCopy: true).dictionary)
        } catch {
          promise.reject("EXPORT_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("sharePhoto") { (uri: String, title: String, promise: Promise) in
      self.share([uri], title: title, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("sharePhotos") { (uris: [String], title: String, promise: Promise) in
      self.share(uris, title: title, promise: promise)
    }.runOnQueue(.main)

    View(FocallyCameraView.self) {
      Events("onStatus", "onControls", "onShutter")
      Prop("interactionLocked") { (view: FocallyCameraView, value: Bool) in
        view.setInteractionLocked(value)
      }
      Prop("active") { (view: FocallyCameraView, value: Bool) in
        view.setActive(value)
      }
      Prop("focalLength") { (view: FocallyCameraView, value: Double) in
        view.setFocalLength(value)
      }
      Prop("focalLabel") { (view: FocallyCameraView, value: String) in
        view.setFocalLabel(value)
      }
      Prop("grid") { (view: FocallyCameraView, value: Bool) in
        view.setGrid(value)
      }
      Prop("ratio") { (view: FocallyCameraView, value: String) in
        view.setRatio(value)
      }
      Prop("exposure") { (view: FocallyCameraView, value: Double) in
        view.setExposure(value)
      }
      Prop("flash") { (view: FocallyCameraView, value: String) in
        view.setFlash(value)
      }
      Prop("level") { (view: FocallyCameraView, value: Bool) in
        view.setLevel(value)
      }
      Prop("volumeShutter") { (view: FocallyCameraView, value: Bool) in
        view.setVolumeShutter(value)
      }
      Prop("photoLocation") { (view: FocallyCameraView, value: Bool) in
        view.setPhotoLocation(value)
      }
      AsyncFunction("unlockFocus") { (view: FocallyCameraView) in
        view.unlockFocus()
      }
      AsyncFunction("capture") {
        (view: FocallyCameraView, autoSave: Bool, keepOriginal: Bool, promise: Promise) in
        view.capture(autoSave, keepOriginal, promise)
      }
    }
  }

  private func share(_ values: [String], title: String, promise: Promise) {
    do {
      var seen = Set<String>()
      let unique = values.filter { seen.insert($0).inserted }
      guard !unique.isEmpty else {
        throw CatalogError("No photos selected.")
      }
      let urls = try unique.map(PhotoCatalog.shared.checkedURL)
      guard let controller = appContext?.utilities?.currentViewController() else {
        throw CatalogError("Application view controller is unavailable.")
      }
      let activity = UIActivityViewController(activityItems: urls, applicationActivities: nil)
      activity.title = title
      if let popover = activity.popoverPresentationController {
        popover.sourceView = controller.view
        popover.sourceRect = CGRect(
          x: controller.view.bounds.midX,
          y: controller.view.bounds.maxY,
          width: 0,
          height: 0
        )
      }
      controller.present(activity, animated: true) {
        promise.resolve()
      }
    } catch {
      promise.reject("SHARE_FAILED", error.localizedDescription)
    }
  }
}
