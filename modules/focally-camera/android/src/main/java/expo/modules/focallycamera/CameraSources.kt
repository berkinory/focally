package expo.modules.focallycamera

import android.hardware.camera2.CameraCharacteristics
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.CameraInfo
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import kotlin.math.max
import kotlin.math.min

data class CameraSource(
    val info: CameraInfo,
    val id: String,
    val baseMm: Double,
    val physicalMm: Double,
) {
    val selector: CameraSelector
        get() =
            CameraSelector.Builder()
                .addCameraFilter { cameras -> cameras.filter { it == info } }
                .build()
}

@androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
class CameraSources(provider: ProcessCameraProvider) {
    private val back = CameraSelector.DEFAULT_BACK_CAMERA.filter(provider.availableCameraInfos)
    val sources = back.mapNotNull { info -> read(info) }
    val main =
        sources.firstOrNull { it.info == back.firstOrNull() }
            ?: sources.minByOrNull { kotlin.math.abs(it.baseMm - 26) }
            ?: error("This camera does not report the lens information needed for framing.")

    fun forFocalLength(mm: Double): CameraSource {
        return if (mm >= 70)
            sources
                .filter { it.baseMm > main.baseMm * 1.6 && it.baseMm <= mm }
                .maxByOrNull { it.baseMm } ?: main
        else main
    }

    private fun read(info: CameraInfo): CameraSource? {
        val c = Camera2CameraInfo.from(info)
        val physical =
            c.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
                ?: return null
        val pixels =
            c.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE)
                ?: return null
        val active =
            c.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE)
                ?: return null
        val focal =
            c.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)
                ?.firstOrNull()
                ?.toDouble()
                ?.takeIf { it > 0 } ?: return null
        val activeWidth = physical.width * active.width() / pixels.width
        val activeHeight = physical.height * active.height() / pixels.height
        val sensorWidth =
            min(
                max(activeWidth, activeHeight).toDouble(),
                min(activeWidth, activeHeight) * 4.0 / 3.0,
            )
        if (sensorWidth <= 0) return null
        return CameraSource(
            info,
            c.cameraId,
            36 * focal / sensorWidth,
            focal,
        )
    }
}
