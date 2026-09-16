package expo.modules.focallycamera

import androidx.annotation.Keep

@Keep
internal object JpegTransform {
    init {
        System.loadLibrary("focally-jpeg")
    }

    external fun crop(
        source: String,
        output: String,
        x: Int,
        y: Int,
        width: Int,
        height: Int,
        rotation: Int,
    )
}
