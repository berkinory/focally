package expo.modules.focallycamera

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.RectF
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.util.Rational
import android.util.Size
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.Surface
import android.widget.FrameLayout
import androidx.camera.core.AspectRatio
import androidx.camera.core.Camera
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.ViewPort
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors

@SuppressLint("ViewConstructor")
class FocallyCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    override val shouldUseAndroidLayout = true
    private val onStatus by EventDispatcher<Map<String, Any?>>()
    private val onControls by EventDispatcher<Map<String, Any?>>()
    private val onShutter by EventDispatcher<Map<String, Any?>>()
    private val mainExecutor = ContextCompat.getMainExecutor(context)
    private val io = Executors.newSingleThreadExecutor()
    private val displays = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    private val displayListener =
        object : DisplayManager.DisplayListener {
            override fun onDisplayAdded(displayId: Int) = Unit

            override fun onDisplayRemoved(displayId: Int) = Unit

            override fun onDisplayChanged(displayId: Int) {
                if (display?.displayId == displayId && rotation != display?.rotation)
                    synchronizeCamera()
            }
        }
    private val previewView =
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            layoutDirection = android.view.View.LAYOUT_DIRECTION_LTR
            scaleType = PreviewView.ScaleType.FIT_START
            setBackgroundColor(Color.rgb(20, 21, 24))
        }
    private val overlay = FramingOverlay(context)
    private val controls =
        CameraControls(
            previewView,
            overlay,
            mainExecutor,
            { message ->
                releaseUseCases()
                emit("error", message)
            },
        ) {
            if (!disposed) onControls(it)
        }
    private val horizon =
        HorizonLevel(context, { display?.rotation ?: Surface.ROTATION_0 }) { overlay.level = it }
    private val volume = VolumeShutter { if (active && !disposed) onShutter(emptyMap()) }
    private val location = PhotoLocation(context.applicationContext)
    private var interactionLocked = false
    private var levelEnabled = false
    private var volumeEnabled = false
    private var locationEnabled = false
    private var ratio = PhotoRatio.SENSOR
    private val store by lazy(LazyThreadSafetyMode.NONE) { PhotoStore(context.applicationContext) }
    private var provider: ProcessCameraProvider? = null
    private var sources: CameraSources? = null
    private var source: CameraSource? = null
    private var camera: Camera? = null
    private var preview: Preview? = null
    private var imageCapture: ImageCapture? = null
    private var crop: FrameCrop? = null
    private var requestedMm = 35.0
    private var framingMm = 35.0
    private var active = false
    private var attached = false
    private var disposed = false
    private var starting = false
    private var streaming = false
    private var busy = false
    private var rotation = -1
    @Volatile private var generation = 0
    private var status = "starting"
    private var capturePromise: Promise? = null

    init {
        setBackgroundColor(Color.rgb(20, 21, 24))
        val container = FrameLayout(context)
        container.addView(previewView, FrameLayout.LayoutParams(-1, -1))
        container.addView(overlay, FrameLayout.LayoutParams(-1, -1))
        addView(container, LayoutParams(-1, -1))
        previewView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> refreshFrame() }
        overlay.onFrameSettled = { refreshFrame() }
        val gestures =
            GestureDetector(
                context,
                object : GestureDetector.SimpleOnGestureListener() {
                    override fun onDown(event: MotionEvent) = true

                    override fun onSingleTapUp(event: MotionEvent): Boolean {
                        if (canFocus(event)) controls.focusAt(event.x, event.y, false)
                        performClick()
                        return true
                    }

                    override fun onLongPress(event: MotionEvent) {
                        if (canFocus(event)) controls.focusAt(event.x, event.y, true)
                    }
                },
            )
        setOnTouchListener { _, event ->
            gestures.onTouchEvent(event)
            true
        }
    }

    override fun onInterceptTouchEvent(event: MotionEvent) = active

    private fun canFocus(event: MotionEvent) =
        status == "ready" &&
            !busy &&
            !interactionLocked &&
            overlay.frame?.contains(event.x, event.y) == true

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        attached = true
        displays.registerDisplayListener(displayListener, Handler(Looper.getMainLooper()))
        post { synchronizeCamera() }
    }

    override fun onDetachedFromWindow() {
        attached = false
        displays.unregisterDisplayListener(displayListener)
        stop()
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) post { synchronizeCamera() }
    }

    fun setActive(value: Boolean) {
        active = value
        keepScreenOn = value
        if (value) post { synchronizeCamera() } else stop()
    }

    fun setFocalLength(value: Double) {
        if (value !in listOf(35.0, 50.0, 85.0)) {
            emit("error", "UNSUPPORTED_FOCAL_LENGTH")
            return
        }
        if (requestedMm == value) return
        requestedMm = value
        if (!busy) synchronizeCamera()
    }

    fun setGrid(value: Boolean) {
        overlay.grid = value
    }

    fun setFocalLabel(value: String) {
        overlay.focalLabel = value
    }

    fun setRatio(value: String) {
        val next = PhotoRatio.from(value)
        if (ratio == next) return
        ratio = next
        controls.unlock()
        emit("adjusting")
        refreshFrame()
    }

    fun setInteractionLocked(value: Boolean) {
        interactionLocked = value
    }

    fun setExposure(value: Double) = controls.setExposure(value)

    fun setFlash(value: String) = controls.setFlash(value)

    fun unlockFocus() = controls.unlock()

    fun setLevel(value: Boolean) {
        levelEnabled = value
        updateAccessories()
    }

    fun setVolumeShutter(value: Boolean) {
        volumeEnabled = value
        updateAccessories()
    }

    fun setPhotoLocation(value: Boolean) {
        locationEnabled = value
        updateAccessories()
    }

    private fun updateAccessories() {
        val live = active && attached && !disposed && streaming
        horizon.setEnabled(live && levelEnabled)
        location.setEnabled(live && locationEnabled)
        volume.attach(if (live && volumeEnabled) appContext.currentActivity?.window else null)
    }

    private fun synchronizeCamera() {
        if (
            !active ||
                disposed ||
                !attached ||
                !isAttachedToWindow ||
                width == 0 ||
                height == 0 ||
                busy ||
                starting
        )
            return
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            emit("error", "CAMERA_PERMISSION")
            return
        }
        keepScreenOn = true
        updateAccessories()
        val currentProvider = provider
        if (currentProvider == null) {
            starting = true
            emit("starting")
            val attempt = generation
            val future = ProcessCameraProvider.getInstance(context)
            future.addListener(
                {
                    starting = false
                    if (disposed || attempt != generation || !active) return@addListener
                    try {
                        provider = future.get()
                        sources = CameraSources(checkNotNull(provider))
                        synchronizeCamera()
                    } catch (error: Exception) {
                        starting = false
                        emit(
                            "error",
                            "CAMERA_START_FAILED",
                        )
                    }
                },
                mainExecutor,
            )
            return
        }
        try {
            val selected = checkNotNull(sources).forFocalLength(requestedMm)
            val nextRotation = display?.rotation ?: Surface.ROTATION_0
            if (framingMm != requestedMm) {
                controls.unlock()
                emit("adjusting")
            }
            framingMm = requestedMm
            CropGeometry.frame(selected.baseMm, framingMm, ratio = ratio)
            if (camera != null && source?.id == selected.id && rotation == nextRotation) {
                refreshFrame()
                return
            }
            releaseUseCases(preserveFrame = true)
            source = selected
            rotation = nextRotation
            starting = true
            emit("starting")
            val owner =
                appContext.currentActivity as? LifecycleOwner
                    ?: error("Camera activity is unavailable.")
            val aspect =
                AspectRatioStrategy(AspectRatio.RATIO_4_3, AspectRatioStrategy.FALLBACK_RULE_AUTO)
            val previewSize = CameraMath.previewSize(width, height)
            val previewBuilder =
                Preview.Builder()
                    .setTargetRotation(nextRotation)
                    .setResolutionSelector(
                        ResolutionSelector.Builder()
                            .setAspectRatioStrategy(aspect)
                            .setResolutionStrategy(
                                ResolutionStrategy(
                                    Size(previewSize.first, previewSize.second),
                                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                                )
                            )
                            .setResolutionFilter { sizes, _ ->
                                sizes.filter { maxOf(it.width, it.height) <= 1920 }
                            }
                            .build()
                    )
            val captureBuilder =
                ImageCapture.Builder()
                    .setTargetRotation(nextRotation)
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                    .setOutputFormat(ImageCapture.OUTPUT_FORMAT_JPEG)
                    .setJpegQuality(95)
                    .setResolutionSelector(
                        ResolutionSelector.Builder()
                            .setAspectRatioStrategy(aspect)
                            .setAllowedResolutionMode(
                                ResolutionSelector.PREFER_CAPTURE_RATE_OVER_HIGHER_RESOLUTION
                            )
                            .setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
                            .setResolutionFilter { sizes, _ ->
                                sizes.filter { it.width.toLong() * it.height <= 16_000_000L }
                            }
                            .build()
                    )
            val sessionGeneration = generation
            val nextPreview = previewBuilder.build()
            val nextCapture = captureBuilder.build()
            val portrait = selected.info.getSensorRotationDegrees(nextRotation) % 180 != 0
            val viewport =
                ViewPort.Builder(if (portrait) Rational(3, 4) else Rational(4, 3), nextRotation)
                    .setScaleType(ViewPort.FILL_CENTER)
                    .build()
            nextPreview.setSurfaceProvider(previewView.surfaceProvider)
            preview = nextPreview
            imageCapture = nextCapture
            camera =
                currentProvider.bindToLifecycle(
                    owner,
                    selected.selector,
                    UseCaseGroup.Builder()
                        .setViewPort(viewport)
                        .addUseCase(nextPreview)
                        .addUseCase(nextCapture)
                        .build(),
                )
            controls.bind(checkNotNull(camera), nextCapture)
            previewView.previewStreamState.removeObservers(owner)
            previewView.previewStreamState.observe(owner) { state ->
                if (sessionGeneration != generation || disposed) return@observe
                streaming = state == PreviewView.StreamState.STREAMING
                updateAccessories()
                if (streaming && !busy) refreshFrame()
            }
            camera?.cameraInfo?.cameraState?.observe(owner) { state ->
                if (sessionGeneration == generation && state.error != null) {
                    if (status != "saving")
                        capturePromise?.let {
                            failCapture(
                                it,
                                "CAMERA_UNAVAILABLE",
                                null,
                                false,
                            )
                        }
                    releaseUseCases()
                    emit(
                        "error",
                        "CAMERA_UNAVAILABLE",
                    )
                }
            }
            starting = false
        } catch (error: Exception) {
            starting = false
            releaseUseCases()
            emit("error", "CAMERA_START_FAILED")
        }
    }

    private fun refreshFrame() {
        if (!streaming || busy || !active || disposed) return
        val selected = source ?: return
        val info = preview?.resolutionInfo ?: return
        val next = CropGeometry.frame(selected.baseMm, framingMm, ratio = ratio)
        val captureInfo = imageCapture?.resolutionInfo ?: return
        val captureArea = captureInfo.cropRect
        val pixels =
            CropGeometry.jpegPixels(
                next,
                captureArea.left,
                captureArea.top,
                captureArea.width(),
                captureArea.height(),
                captureInfo.rotationDegrees,
            )
        val displayed =
            CropGeometry.normalized(
                pixels,
                captureArea.left,
                captureArea.top,
                captureArea.width(),
                captureArea.height(),
                ratio,
            )
        val bounds =
            CropGeometry.fitStart(
                displayed,
                info.cropRect.width(),
                info.cropRect.height(),
                info.rotationDegrees,
                previewView.width,
                previewView.height,
            )
        val rect =
            RectF(
                bounds.left.toFloat(),
                bounds.top.toFloat(),
                (bounds.left + bounds.width).toFloat(),
                (bounds.top + bounds.height).toFloat(),
            )
        if (rect.width() <= 0 || rect.height() <= 0) return
        val sideways = info.rotationDegrees % 180 != 0
        val sourceWidth = if (sideways) info.cropRect.height() else info.cropRect.width()
        val sourceHeight = if (sideways) info.cropRect.width() else info.cropRect.height()
        val scale =
            minOf(
                previewView.width.toFloat() / sourceWidth,
                previewView.height.toFloat() / sourceHeight,
            )
        overlay.previewBounds = RectF(0f, 0f, sourceWidth * scale, sourceHeight * scale)
        crop = next
        controls.setFrame(displayed)
        if (overlay.frame != rect) overlay.frame = rect
        if (overlay.settling) {
            if (status != "adjusting") emit("adjusting")
        } else if (status != "ready") emit("ready")
    }

    fun capture(autoSave: Boolean, keepOriginal: Boolean, promise: Promise) {
        val current = camera
        val frame = crop
        val capture = imageCapture
        val selected = source
        if (
            busy ||
                controls.settling ||
                overlay.settling ||
                status != "ready" ||
                current == null ||
                frame == null ||
                capture == null ||
                selected == null
        ) {
            promise.reject("CAMERA_NOT_READY", "The camera is not ready yet.", null)
            return
        }
        busy = true
        capturePromise = promise
        val shotMm = framingMm
        val shotLocation = if (locationEnabled) location.snapshot() else null
        // CameraX owns the quality-priority AF/AE capture sequence. An AF miss is
        // not a capture failure: textureless subjects must still be photographable.
        emit("capturing")
        capture.takePicture(
            mainExecutor,
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    saveCapturedImage(
                        image,
                        frame,
                        shotMm,
                        selected.baseMm,
                        autoSave,
                        keepOriginal,
                        shotLocation,
                        promise,
                    )
                }

                override fun onError(exception: ImageCaptureException) {
                    failCapture(promise, "CAPTURE_FAILED", exception)
                }
            },
        )
    }

    private fun saveCapturedImage(
        image: ImageProxy,
        frame: FrameCrop,
        mm: Double,
        baseMm: Double,
        autoSave: Boolean,
        keepOriginal: Boolean,
        shotLocation: PhotoLocation.Fix?,
        promise: Promise,
    ) {
        if (disposed) {
            image.close()
            failCapture(promise, "CAMERA_CLOSED", null, false)
            return
        }
        emit("saving")
        // Camera callbacks use the main executor so disposal cannot reject a callback before
        // its ImageProxy is closed. Only the actual image processing uses the owned executor.
        io.execute {
            try {
                val result =
                    store.write(image, frame, mm, baseMm, autoSave, keepOriginal, shotLocation)
                mainExecutor.execute {
                    if (capturePromise === promise) {
                        promise.resolve(result)
                        capturePromise = null
                        finishCapture()
                    }
                }
            } catch (error: Exception) {
                image.close()
                mainExecutor.execute {
                    failCapture(
                        promise,
                        "SAVE_FAILED",
                        error,
                    )
                }
            }
        }
    }

    private fun failCapture(
        promise: Promise,
        errorCode: String,
        error: Throwable?,
        resume: Boolean = true,
    ) {
        if (capturePromise !== promise) return
        promise.reject(errorCode, error?.message ?: errorCode, error)
        capturePromise = null
        if (resume) finishCapture() else busy = false
    }

    private fun finishCapture() {
        busy = false
        if (disposed) return
        if (active) {
            emit("adjusting")
            synchronizeCamera()
            refreshFrame()
        } else emit("paused")
    }

    private fun emit(value: String, errorCode: String? = null) {
        status = value
        if (value == "error") {
            streaming = false
            keepScreenOn = false
        }
        if (!disposed)
            onStatus(
                mapOf(
                    "status" to value,
                    "frame" to
                        overlay.frame
                            ?.takeIf { width > 0 && height > 0 }
                            ?.let {
                                mapOf(
                                    "x" to it.left / width,
                                    "y" to it.top / height,
                                    "width" to it.width() / width,
                                    "height" to it.height() / height,
                                )
                            },
                    "errorCode" to errorCode,
                    "focalLength" to framingMm,
                    "baseFocalLength" to source?.baseMm,
                    "cameraId" to source?.id,
                    "ratio" to ratio.label,
                )
            )
    }

    private fun releaseUseCases(preserveFrame: Boolean = false) {
        controls.clear()
        generation++
        streaming = false
        updateAccessories()
        crop = null
        if (!preserveFrame) overlay.frame = null
        val owner = appContext.currentActivity as? LifecycleOwner
        if (owner != null) {
            camera?.cameraInfo?.cameraState?.removeObservers(owner)
            previewView.previewStreamState.removeObservers(owner)
        }
        preview?.let { provider?.unbind(it) }
        imageCapture?.let { provider?.unbind(it) }
        preview = null
        imageCapture = null
        camera = null
    }

    private fun stop() {
        horizon.setEnabled(false)
        volume.detach()
        starting = false
        keepScreenOn = false
        releaseUseCases()
        if (!busy) emit("paused")
    }

    fun dispose() {
        active = false
        displays.unregisterDisplayListener(displayListener)
        stop()
        disposed = true
        if (status != "saving")
            capturePromise?.let {
                failCapture(it, "CAMERA_CLOSED", null, false)
            }
        io.shutdown()
    }
}
