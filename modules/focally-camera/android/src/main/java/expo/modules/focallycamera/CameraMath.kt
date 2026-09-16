package expo.modules.focallycamera

import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.roundToInt

object CameraMath {
    fun sensorFrame(frame: FrameCrop, left: Int, top: Int, width: Int, height: Int): PixelCrop {
        require(width > 0 && height > 0)
        val portrait = height > width
        val wide = maxOf(width, height)
        val tall = minOf(width, height)
        val units = minOf(wide / 4, tall / 3)
        val viewportWidth = units * if (portrait) 3 else 4
        val viewportHeight = units * if (portrait) 4 else 3
        return CropGeometry.pixels(
            frame,
            left + (width - viewportWidth) / 2,
            top + (height - viewportHeight) / 2,
            viewportWidth,
            viewportHeight,
        )
    }

    fun meteringArea(
        left: Int,
        top: Int,
        width: Int,
        height: Int,
        x: Double?,
        y: Double?,
    ): PixelCrop {
        require(width > 0 && height > 0)
        if (x == null || y == null) return PixelCrop(left, top, width, height)
        require(x.isFinite() && y.isFinite())
        val w = maxOf(1, width / 5)
        val h = maxOf(1, height / 5)
        return PixelCrop(
            (left + width * x - w / 2.0).roundToInt().coerceIn(left, left + width - w),
            (top + height * y - h / 2.0).roundToInt().coerceIn(top, top + height - h),
            w,
            h,
        )
    }

    fun previewSize(viewWidth: Int, viewHeight: Int): Pair<Int, Int> {
        require(viewWidth > 0 && viewHeight > 0)
        val wide = maxOf(viewWidth, viewHeight)
        val tall = minOf(viewWidth, viewHeight)
        val needed = minOf(wide.toDouble(), tall * 4.0 / 3.0).coerceIn(960.0, 1920.0)
        val units = kotlin.math.ceil(needed / 4).toInt()
        return units * 4 to units * 3
    }

    fun exposureIndex(ev: Double, step: Double, minimum: Int, maximum: Int): Int {
        require(ev.isFinite() && step.isFinite() && step > 0 && minimum <= maximum)
        return (ev / step).roundToInt().coerceIn(minimum, maximum)
    }

    fun followAngle(current: Float, target: Float, seconds: Double): Float {
        require(current.isFinite() && target.isFinite() && seconds.isFinite() && seconds >= 0)
        val delta = ((target - current + 540f) % 360f) - 180f
        val next = current + delta * (1 - kotlin.math.exp(-seconds / 0.055)).toFloat()
        return ((next + 540f) % 360f) - 180f
    }

    fun horizon(x: Float, y: Float, rotation: Int): Float? {
        if (!x.isFinite() || !y.isFinite() || hypot(x, y) < 3f) return null
        val (sx, sy) =
            when (rotation) {
                0 -> x to y
                1 -> -y to x
                2 -> -x to -y
                3 -> y to -x
                else -> return null
            }
        return Math.toDegrees(atan2(sx.toDouble(), sy.toDouble())).toFloat()
    }
}
