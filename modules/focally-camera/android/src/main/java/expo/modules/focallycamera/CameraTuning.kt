package expo.modules.focallycamera

import android.graphics.Rect
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.MeteringRectangle
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.concurrent.futures.CallbackToFutureAdapter
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.Executor

@androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
class CameraTuning(private val executor: Executor, private val changed: () -> Unit) {
    private var camera: Camera? = null
    private var info: Camera2CameraInfo? = null
    private var revision = 0
    private var desired = 0
    private var applied = 0
    private var inFlight = false
    private val waiting = mutableListOf<Pair<Int, CallbackToFutureAdapter.Completer<Void?>>>()
    private var frame: Rect? = null
    private var point: Pair<Double, Double>? = null
    var exposureLocked = false
        private set

    val settling
        get() = inFlight || desired != applied

    fun bind(value: Camera) {
        clear()
        camera = value
        val metadata = Camera2CameraInfo.from(value.cameraInfo)
        info = metadata
    }

    fun clear() {
        revision++
        camera = null
        info = null
        frame = null
        point = null
        exposureLocked = false
        inFlight = false
        desired = 0
        applied = 0
        val old = waiting.toList()
        waiting.clear()
        old.forEach { it.second.setCancelled() }
    }

    fun setFrame(crop: FrameCrop): ListenableFuture<Void?>? {
        val sensor =
            info?.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE)
                ?: return null
        val area =
            CameraMath.sensorFrame(crop, sensor.left, sensor.top, sensor.width(), sensor.height())
        val next = Rect(area.left, area.top, area.left + area.width, area.top + area.height)
        if (frame == next) return null
        frame = next
        point = null
        return apply()
    }

    fun setPoint(x: Double, y: Double): ListenableFuture<Void?> {
        point = x.coerceIn(0.0, 1.0) to y.coerceIn(0.0, 1.0)
        return apply()
    }

    fun resetPoint(): ListenableFuture<Void?> {
        point = null
        return apply()
    }

    fun setExposureLock(value: Boolean): ListenableFuture<Void?> {
        exposureLocked = value
        return apply()
    }

    private fun options(): CaptureRequestOptions {
        val metadata = checkNotNull(info)
        val builder = CaptureRequestOptions.Builder()
        // Omitting an unlocked setting releases the override, so CameraX can still perform
        // its own quality-priority capture/flash sequence.
        if (exposureLocked) builder.setCaptureRequestOption(CaptureRequest.CONTROL_AE_LOCK, true)
        if (
            metadata
                .getCameraCharacteristic(
                    CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION
                )
                ?.contains(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON) == true
        ) {
            builder.setCaptureRequestOption(
                CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON,
            )
        }
        frame?.let { bounds ->
            val area =
                CameraMath.meteringArea(
                    bounds.left,
                    bounds.top,
                    bounds.width(),
                    bounds.height(),
                    point?.first,
                    point?.second,
                )
            val region =
                arrayOf(
                    MeteringRectangle(
                        Rect(area.left, area.top, area.left + area.width, area.top + area.height),
                        MeteringRectangle.METERING_WEIGHT_MAX,
                    )
                )
            if (
                (metadata.getCameraCharacteristic(CameraCharacteristics.CONTROL_MAX_REGIONS_AF)
                    ?: 0) > 0
            )
                builder.setCaptureRequestOption(CaptureRequest.CONTROL_AF_REGIONS, region)
            if (
                (metadata.getCameraCharacteristic(CameraCharacteristics.CONTROL_MAX_REGIONS_AE)
                    ?: 0) > 0
            )
                builder.setCaptureRequestOption(CaptureRequest.CONTROL_AE_REGIONS, region)
            if (
                (metadata.getCameraCharacteristic(CameraCharacteristics.CONTROL_MAX_REGIONS_AWB)
                    ?: 0) > 0
            )
                builder.setCaptureRequestOption(CaptureRequest.CONTROL_AWB_REGIONS, region)
        }
        return builder.build()
    }

    private fun apply(): ListenableFuture<Void?> = CallbackToFutureAdapter.getFuture { result ->
        if (camera == null) {
            result.setException(IllegalStateException("The camera is unavailable."))
        } else {
            waiting.add(++desired to result)
            submit()
        }
        "Focally camera controls"
    }

    private fun submit() {
        val current = camera ?: return
        if (inFlight || desired == applied) return
        val token = revision
        val batch = desired
        inFlight = true
        changed()
        // Serialize the shared interop options so point metering cannot clear an AE lock.
        val future =
            try {
                Camera2CameraControl.from(current.cameraControl).setCaptureRequestOptions(options())
            } catch (error: Exception) {
                inFlight = false
                applied = desired
                val failed = waiting.toList()
                waiting.clear()
                failed.forEach { it.second.setException(error) }
                if (token == revision) changed()
                return
            }
        future.addListener(
            {
                if (token == revision) {
                    inFlight = false
                    applied = batch
                    val completed = waiting.filter { it.first <= batch }
                    waiting.removeAll(completed.toSet())
                    try {
                        future.get()
                        completed.forEach { it.second.set(null) }
                    } catch (error: Exception) {
                        completed.forEach { it.second.setException(error) }
                    }
                    if (token == revision) {
                        submit()
                        changed()
                    }
                }
            },
            executor,
        )
    }
}
