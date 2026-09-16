package expo.modules.focallycamera

import kotlin.math.floor
import kotlin.math.min

enum class PhotoRatio(val label: String, val wide: Int, val tall: Int) {
    SENSOR("4:3", 4, 3),
    CLASSIC("3:2", 3, 2),
    SQUARE("1:1", 1, 1);

    companion object {
        fun from(value: String) =
            entries.firstOrNull { it.label == value }
                ?: throw IllegalArgumentException("Unsupported photo ratio.")
    }
}

data class FrameCrop(
    val left: Double,
    val top: Double,
    val width: Double,
    val height: Double,
    val ratio: PhotoRatio = PhotoRatio.SENSOR,
) {
    val right
        get() = left + width

    val bottom
        get() = top + height
}

data class PixelCrop(val left: Int, val top: Int, val width: Int, val height: Int)

data class FrameBounds(val left: Double, val top: Double, val width: Double, val height: Double)

object CropGeometry {
    // All supported JPEG MCU dimensions divide 32. Align only the corner that becomes
    // top-left after rotation; keep the largest exact-ratio rectangle inside the frame.
    fun jpegPixels(
        frame: FrameCrop,
        sourceLeft: Int,
        sourceTop: Int,
        sourceWidth: Int,
        sourceHeight: Int,
        rotation: Int,
    ): PixelCrop {
        require(rotation in listOf(0, 90, 180, 270))
        val wanted = pixels(frame, sourceLeft, sourceTop, sourceWidth, sourceHeight)
        val fromRight = rotation == 180 || rotation == 270
        val fromBottom = rotation == 90 || rotation == 180
        val left = if (fromRight) wanted.left else ((wanted.left + 31) / 32) * 32
        val top = if (fromBottom) wanted.top else ((wanted.top + 31) / 32) * 32
        val right =
            if (fromRight) ((wanted.left + wanted.width) / 32) * 32 else wanted.left + wanted.width
        val bottom =
            if (fromBottom) ((wanted.top + wanted.height) / 32) * 32 else wanted.top + wanted.height
        val rw = if (sourceHeight > sourceWidth) frame.ratio.tall else frame.ratio.wide
        val rh = if (sourceHeight > sourceWidth) frame.ratio.wide else frame.ratio.tall
        val units = minOf((right - left) / rw, (bottom - top) / rh)
        require(units > 0) { "The selected frame is too small." }
        val w = units * rw
        val h = units * rh
        return PixelCrop(
            if (fromRight) right - w else left,
            if (fromBottom) bottom - h else top,
            w,
            h,
        )
    }

    fun normalized(
        pixels: PixelCrop,
        sourceLeft: Int,
        sourceTop: Int,
        sourceWidth: Int,
        sourceHeight: Int,
        ratio: PhotoRatio,
    ): FrameCrop {
        require(sourceWidth > 0 && sourceHeight > 0)
        val frame =
            FrameCrop(
                (pixels.left - sourceLeft).toDouble() / sourceWidth,
                (pixels.top - sourceTop).toDouble() / sourceHeight,
                pixels.width.toDouble() / sourceWidth,
                pixels.height.toDouble() / sourceHeight,
                ratio,
            )
        return inBuffer(frame, sourceHeight > sourceWidth)
    }

    fun frame(
        baseMm: Double,
        targetMm: Double,
        sourceAspect: Double = 4.0 / 3.0,
        ratio: PhotoRatio = PhotoRatio.SENSOR,
    ): FrameCrop {
        require(baseMm.isFinite() && baseMm > 0) { "Missing lens calibration." }
        require(targetMm.isFinite() && targetMm > 0) { "Invalid focal length." }
        require(sourceAspect.isFinite() && sourceAspect > 0) { "Invalid source aspect ratio." }
        val coverage = baseMm / targetMm
        require(coverage <= 1.0) { "This lens cannot cover the selected frame." }
        val aspect = ratio.wide.toDouble() / ratio.tall
        val width = coverage * min(1.0, aspect / sourceAspect)
        val height = coverage * min(1.0, sourceAspect / aspect)
        require(width <= 1.0 && height <= 1.0) { "This lens cannot cover the selected frame." }
        return FrameCrop((1 - width) / 2, (1 - height) / 2, width, height, ratio)
    }

    fun inBuffer(frame: FrameCrop, portrait: Boolean): FrameCrop =
        if (portrait) FrameCrop(frame.top, frame.left, frame.height, frame.width, frame.ratio)
        else frame

    fun fitStart(
        frame: FrameCrop,
        bufferWidth: Int,
        bufferHeight: Int,
        rotation: Int,
        viewWidth: Int,
        viewHeight: Int,
    ): FrameBounds {
        require(bufferWidth > 0 && bufferHeight > 0 && viewWidth > 0 && viewHeight > 0)
        require(rotation in listOf(0, 90, 180, 270))
        val sideways = rotation % 180 != 0
        val uprightWidth = if (sideways) bufferHeight else bufferWidth
        val uprightHeight = if (sideways) bufferWidth else bufferHeight
        val scale = min(viewWidth.toDouble() / uprightWidth, viewHeight.toDouble() / uprightHeight)
        val width = uprightWidth * scale
        val height = uprightHeight * scale
        val raw = inBuffer(frame, bufferHeight > bufferWidth)
        val uprightFrame =
            when (rotation) {
                90 -> FrameCrop(1 - raw.bottom, raw.left, raw.height, raw.width, frame.ratio)
                180 -> FrameCrop(1 - raw.right, 1 - raw.bottom, raw.width, raw.height, frame.ratio)
                270 -> FrameCrop(raw.top, 1 - raw.right, raw.height, raw.width, frame.ratio)
                else -> raw
            }
        return FrameBounds(
            uprightFrame.left * width,
            uprightFrame.top * height,
            uprightFrame.width * width,
            uprightFrame.height * height,
        )
    }

    fun pixels(
        frame: FrameCrop,
        sourceLeft: Int,
        sourceTop: Int,
        sourceWidth: Int,
        sourceHeight: Int,
    ): PixelCrop {
        require(sourceLeft >= 0 && sourceTop >= 0 && sourceWidth > 0 && sourceHeight > 0)
        require(listOf(frame.left, frame.top, frame.width, frame.height).all { it.isFinite() })
        require(frame.left >= 0 && frame.top >= 0 && frame.width > 0 && frame.height > 0)
        require(frame.right <= 1.000001 && frame.bottom <= 1.000001)
        val portrait = sourceHeight > sourceWidth
        val bufferFrame = inBuffer(frame, portrait)
        val ratioWidth = if (portrait) frame.ratio.tall else frame.ratio.wide
        val ratioHeight = if (portrait) frame.ratio.wide else frame.ratio.tall
        // A one-ULP roundoff at an exact boundary must not discard another 3 x 2 block.
        val units =
            floor(
                    Math.nextUp(
                        min(
                            sourceWidth * bufferFrame.width / ratioWidth,
                            sourceHeight * bufferFrame.height / ratioHeight,
                        )
                    )
                )
                .toInt()
        require(units > 0) { "The selected frame is too small." }
        val width = units * ratioWidth
        val height = units * ratioHeight
        val centerX = sourceLeft + sourceWidth * (bufferFrame.left + bufferFrame.width / 2)
        val centerY = sourceTop + sourceHeight * (bufferFrame.top + bufferFrame.height / 2)
        return PixelCrop(
            floor(centerX - width / 2.0).toInt(),
            floor(centerY - height / 2.0).toInt(),
            width,
            height,
        )
    }
}
