package expo.modules.focallycamera

import android.hardware.camera2.CameraCharacteristics
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.view.PreviewView
import java.util.concurrent.Executor
import java.util.concurrent.TimeUnit

@androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
class CameraControls(
    private val preview: PreviewView,
    private val overlay: FramingOverlay,
    private val executor: Executor,
    private val failed: (String) -> Unit,
    private val changed: (Map<String, Any?>) -> Unit,
) {
    private val tuning = CameraTuning(executor) { publish() }
    val settling
        get() = tuning.settling || exposureRequests.pending

    private var camera: Camera? = null
    private var capture: ImageCapture? = null
    private var revision = 0
    private val exposureRequests = ExposureRequests()
    private var focusRevision = 0
    private var ev = 0.0
    private var flash = "off"
    private var aeAvailable = false
    private var aeRequested = false
    var focusLocked = false
        private set

    var exposureLocked = false
        private set

    private var focusing = false

    fun bind(value: Camera, imageCapture: ImageCapture) {
        clear()
        camera = value
        tuning.bind(value)
        exposureRequests.reset(value.cameraInfo.exposureState.exposureCompensationIndex)
        capture = imageCapture
        aeAvailable =
            Camera2CameraInfo.from(value.cameraInfo)
                .getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_LOCK_AVAILABLE) == true
        setFlash(flash)
        applyExposure()
    }

    fun clear() {
        revision++
        tuning.clear()
        focusRevision++
        exposureRequests.reset()
        aeAvailable = false
        aeRequested = false
        camera = null
        capture = null
        focusing = false
        focusLocked = false
        exposureLocked = false
        overlay.locked = false
        overlay.focus = null
        publish()
    }

    fun setExposure(value: Double) {
        require(value.isFinite()) { "Invalid exposure compensation." }
        if (aeRequested && ev != value) {
            try {
                val binding = revision
                val future = setAeLock(false)
                exposureLocked = false
                overlay.locked = focusLocked
                future?.addListener(
                    {
                        if (binding == revision)
                            try {
                                future.get()
                            } catch (_: Exception) {
                                failed("EXPOSURE_UNLOCK_FAILED")
                            }
                    },
                    executor,
                )
            } catch (_: Exception) {
                failed("EXPOSURE_UNLOCK_FAILED")
                return
            }
        }
        ev = value
        applyExposure()
    }

    private fun applyExposure() {
        val current = camera ?: return
        val state = current.cameraInfo.exposureState
        if (!state.isExposureCompensationSupported) {
            publish()
            return
        }
        val step = state.exposureCompensationStep.toDouble()
        val index =
            CameraMath.exposureIndex(
                ev,
                step,
                state.exposureCompensationRange.lower,
                state.exposureCompensationRange.upper,
            )
        val token = exposureRequests.request(index)
        if (token == null) {
            publish()
            return
        }
        val binding = revision
        try {
            val future = current.cameraControl.setExposureCompensationIndex(index)
            future.addListener(
                {
                    if (binding == revision) {
                        try {
                            if (exposureRequests.complete(token, future.get())) publish()
                        } catch (_: Exception) {
                            if (exposureRequests.fail(token)) failed("EXPOSURE_FAILED")
                        }
                    }
                },
                executor,
            )
        } catch (_: Exception) {
            if (exposureRequests.fail(token)) failed("EXPOSURE_FAILED")
        }
        publish()
    }

    fun setFlash(value: String) {
        require(value in listOf("off", "auto", "on")) { "Unsupported flash mode." }
        flash = value
        capture?.flashMode =
            if (camera?.cameraInfo?.hasFlashUnit() != true) ImageCapture.FLASH_MODE_OFF
            else
                when (value) {
                    "on" -> ImageCapture.FLASH_MODE_ON
                    "auto" -> ImageCapture.FLASH_MODE_AUTO
                    else -> ImageCapture.FLASH_MODE_OFF
                }
        publish()
    }

    private fun watch(
        future: com.google.common.util.concurrent.ListenableFuture<Void?>?,
        message: String,
    ) {
        if (future == null) return
        val binding = revision
        future.addListener(
            {
                if (binding == revision) {
                    try {
                        future.get()
                        publish()
                    } catch (_: Exception) {
                        failed(message)
                    }
                }
            },
            executor,
        )
    }

    fun setFrame(frame: FrameCrop) = watch(tuning.setFrame(frame), "METERING_FAILED")

    fun focusAt(x: Float, y: Float, lock: Boolean) {
        val current = camera ?: return
        val bounds = overlay.frame ?: return
        if (!bounds.contains(x, y)) return
        val point = preview.meteringPointFactory.createPoint(x, y)
        val topLeft = preview.meteringPointFactory.createPoint(bounds.left, bounds.top)
        val topRight = preview.meteringPointFactory.createPoint(bounds.right, bounds.top)
        val bottomLeft = preview.meteringPointFactory.createPoint(bounds.left, bounds.bottom)
        val bottomRight = preview.meteringPointFactory.createPoint(bounds.right, bounds.bottom)
        val xs = listOf(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x)
        val ys = listOf(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y)
        val nx = ((point.x - xs.min()) / (xs.max() - xs.min())).toDouble()
        val ny = ((point.y - ys.min()) / (ys.max() - ys.min())).toDouble()
        unlock(resetMetering = false)
        val token = ++focusRevision
        val binding = revision
        overlay.focus = x to y
        focusing = true
        val metering = tuning.setPoint(nx, ny)
        publish()
        metering.addListener(
            {
                if (binding != revision || token != focusRevision) return@addListener
                try {
                    metering.get()
                    val builder = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF)
                    if (lock) builder.disableAutoCancel()
                    else builder.setAutoCancelDuration(3, TimeUnit.SECONDS)
                    val action = builder.build()
                    if (!current.cameraInfo.isFocusMeteringSupported(action)) {
                        completeMetering(false, lock, binding, token)
                        return@addListener
                    }
                    val future = current.cameraControl.startFocusAndMetering(action)
                    future.addListener(
                        {
                            if (binding == revision && token == focusRevision) {
                                try {
                                    if (!future.get().isFocusSuccessful) {
                                        current.cameraControl.cancelFocusAndMetering()
                                        overlay.focus = null
                                        finishFocus(false, false)
                                    } else completeMetering(lock, lock, binding, token)
                                } catch (_: Exception) {
                                    current.cameraControl.cancelFocusAndMetering()
                                    overlay.focus = null
                                    finishFocus(false, false)
                                }
                            }
                        },
                        executor,
                    )
                } catch (_: Exception) {
                    focusing = false
                    failed("METERING_FAILED")
                }
            },
            executor,
        )
    }

    private fun completeMetering(
        lockFocus: Boolean,
        lockExposure: Boolean,
        binding: Int,
        token: Int,
    ) {
        val future = if (lockExposure) setAeLock(true) else null
        if (future == null) {
            finishFocus(lockFocus, false)
            return
        }
        future.addListener(
            {
                if (binding == revision && token == focusRevision) {
                    try {
                        future.get()
                        finishFocus(lockFocus, true)
                    } catch (_: Exception) {
                        failed("EXPOSURE_LOCK_FAILED")
                    }
                }
            },
            executor,
        )
    }

    private fun finishFocus(lock: Boolean, lockExposure: Boolean) {
        focusing = false
        focusLocked = lock
        exposureLocked = lockExposure
        overlay.locked = lock || lockExposure
        val token = focusRevision
        if (!lock && !lockExposure)
            overlay.postDelayed(
                { if (token == focusRevision && !focusLocked && !focusing) overlay.focus = null },
                1200,
            )
        publish()
    }

    private fun setAeLock(
        value: Boolean
    ): com.google.common.util.concurrent.ListenableFuture<Void?>? {
        if (camera == null || !aeAvailable) return null
        val future = tuning.setExposureLock(value)
        aeRequested = value
        return future
    }

    fun unlock(resetMetering: Boolean = true) {
        val token = ++focusRevision
        val binding = revision
        focusLocked = false
        exposureLocked = false
        focusing = false
        overlay.locked = false
        overlay.focus = null
        camera?.cameraControl?.cancelFocusAndMetering()
        if (aeRequested) {
            try {
                val future = setAeLock(false)
                focusing = future != null
                future?.addListener(
                    {
                        if (binding == revision && token == focusRevision) {
                            focusing = false
                            try {
                                future.get()
                                publish()
                            } catch (_: Exception) {
                                failed("EXPOSURE_UNLOCK_FAILED")
                            }
                        }
                    },
                    executor,
                )
            } catch (_: Exception) {
                failed("EXPOSURE_UNLOCK_FAILED")
                return
            }
        }
        if (resetMetering && camera != null) watch(tuning.resetPoint(), "METERING_FAILED")
        publish()
    }

    fun publish() {
        val state = camera?.cameraInfo?.exposureState
        val step = state?.exposureCompensationStep?.toDouble() ?: 0.0
        changed(
            mapOf(
                "exposureSupported" to (state?.isExposureCompensationSupported == true),
                "exposureMin" to ((state?.exposureCompensationRange?.lower ?: 0) * step),
                "exposureMax" to ((state?.exposureCompensationRange?.upper ?: 0) * step),
                "exposureStep" to step,
                "exposure" to (exposureRequests.applied * step),
                "hasFlash" to (camera?.cameraInfo?.hasFlashUnit() == true),
                "focusLocked" to focusLocked,
                "exposureLocked" to exposureLocked,
                "lockPoint" to overlay.lockPoint(),
                "settling" to settling,
            )
        )
    }
}
