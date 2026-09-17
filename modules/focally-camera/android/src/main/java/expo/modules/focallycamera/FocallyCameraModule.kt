package expo.modules.focallycamera

import android.Manifest
import android.content.ClipData
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus

class FocallyCameraModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("FocallyCamera")

        Constant("capabilities") {
            mapOf("deleteDeviceCopies" to true, "volumeShutter" to true)
        }

        AsyncFunction("getCameraPermission") { promise: Promise ->
            permission(arrayOf(Manifest.permission.CAMERA), false, promise)
        }
        AsyncFunction("requestCameraPermission") { promise: Promise ->
            permission(arrayOf(Manifest.permission.CAMERA), true, promise)
        }
        AsyncFunction("getLocationPermission") { promise: Promise ->
            permission(
                arrayOf(
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                ),
                false,
                promise,
                anyGranted = true,
            )
        }
        AsyncFunction("requestLocationPermission") { promise: Promise ->
            permission(
                arrayOf(
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                ),
                true,
                promise,
                anyGranted = true,
            )
        }

        AsyncFunction("getLastPhoto") {
            val context = appContext.reactContext ?: error("Application context is unavailable.")
            PhotoLibrary(context).latest()
        }

        AsyncFunction("getPhotos") { before: String?, favoritesOnly: Boolean ->
            PhotoLibrary(requireNotNull(appContext.reactContext)).page(before, favoritesOnly)
        }
        AsyncFunction("getPhoto") { uri: String ->
            PhotoLibrary(requireNotNull(appContext.reactContext)).details(uri)
        }
        AsyncFunction("setFavorite") { uri: String, value: Boolean ->
            PhotoLibrary(requireNotNull(appContext.reactContext)).favorite(uri, value)
        }
        AsyncFunction("deletePhoto") { uri: String, deleteDeviceCopies: Boolean ->
            PhotoLibrary(requireNotNull(appContext.reactContext)).delete(uri, deleteDeviceCopies)
        }

        AsyncFunction("saveToGallery") { uri: String ->
            PhotoLibrary(requireNotNull(appContext.reactContext)).export(uri, newCopy = true)
        }

        AsyncFunction("sharePhoto") { uri: String, title: String, promise: Promise ->
            share(listOf(uri), title, promise)
        }
        AsyncFunction("sharePhotos") { uris: List<String>, title: String, promise: Promise ->
            share(uris, title, promise)
        }

        View(FocallyCameraView::class) {
            Events("onStatus", "onControls", "onShutter")
            Prop("interactionLocked") { view: FocallyCameraView, value: Boolean ->
                view.setInteractionLocked(value)
            }
            Prop("active") { view: FocallyCameraView, active: Boolean -> view.setActive(active) }
            Prop("focalLength") { view: FocallyCameraView, mm: Double -> view.setFocalLength(mm) }
            Prop("focalLabel") { view: FocallyCameraView, label: String ->
                view.setFocalLabel(label)
            }
            Prop("grid") { view: FocallyCameraView, grid: Boolean -> view.setGrid(grid) }
            Prop("ratio") { view: FocallyCameraView, value: String -> view.setRatio(value) }
            Prop("exposure") { view: FocallyCameraView, value: Double -> view.setExposure(value) }
            Prop("flash") { view: FocallyCameraView, value: String -> view.setFlash(value) }
            Prop("level") { view: FocallyCameraView, value: Boolean -> view.setLevel(value) }
            Prop("volumeShutter") { view: FocallyCameraView, value: Boolean ->
                view.setVolumeShutter(value)
            }
            Prop("photoLocation") { view: FocallyCameraView, value: Boolean ->
                view.setPhotoLocation(value)
            }
            AsyncFunction("unlockFocus") { view: FocallyCameraView -> view.unlockFocus() }
            AsyncFunction("capture") {
                view: FocallyCameraView,
                autoSave: Boolean,
                keepOriginal: Boolean,
                promise: Promise ->
                view.capture(autoSave, keepOriginal, promise)
            }
            OnViewDestroys { view: FocallyCameraView -> view.dispose() }
        }
    }

    private fun permission(
        values: Array<String>,
        request: Boolean,
        promise: Promise,
        anyGranted: Boolean = false,
    ) {
        val manager = appContext.legacyModule<Permissions>()
        if (manager == null) {
            promise.reject("PERMISSION_FAILED", "Permission service is unavailable.", null)
            return
        }
        val listener =
            PermissionsResponseListener { result ->
                val responses = values.mapNotNull(result::get)
                val granted =
                    if (anyGranted) responses.any { it.status == PermissionsStatus.GRANTED }
                    else
                        responses.size == values.size &&
                            responses.all { it.status == PermissionsStatus.GRANTED }
                promise.resolve(
                    when {
                        granted -> "granted"
                        responses.any { it.canAskAgain } -> "denied"
                        else -> "blocked"
                    }
                )
            }
        try {
            if (request) manager.askForPermissions(listener, *values)
            else manager.getPermissions(listener, *values)
        } catch (error: Exception) {
            promise.reject("PERMISSION_FAILED", "Could not access permissions.", error)
        }
    }

    private fun share(values: List<String>, title: String, promise: Promise) {
        try {
            require(values.isNotEmpty()) { "No photos selected." }
            val context = appContext.reactContext ?: error("Application context is unavailable.")
            val library = PhotoLibrary(context)
            val photos = values.distinct().map { library.shareUri(it) }
            ContextCompat.getMainExecutor(context).execute {
                try {
                    val activity =
                        appContext.currentActivity ?: error("Application activity is unavailable.")
                    val intent =
                        Intent(
                                if (photos.size == 1) Intent.ACTION_SEND
                                else Intent.ACTION_SEND_MULTIPLE
                            )
                            .apply {
                                type = "image/jpeg"
                                if (photos.size == 1) putExtra(Intent.EXTRA_STREAM, photos.first())
                                else
                                    putParcelableArrayListExtra(
                                        Intent.EXTRA_STREAM,
                                        ArrayList(photos),
                                    )
                                clipData =
                                    ClipData.newRawUri(title, photos.first()).apply {
                                        photos.drop(1).forEach { addItem(ClipData.Item(it)) }
                                    }
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                    activity.startActivity(Intent.createChooser(intent, title))
                    promise.resolve(null)
                } catch (error: Exception) {
                    promise.reject("SHARE_FAILED", "Could not share the selected photos.", error)
                }
            }
        } catch (error: Exception) {
            promise.reject("SHARE_FAILED", "Could not share the selected photos.", error)
        }
    }
}
