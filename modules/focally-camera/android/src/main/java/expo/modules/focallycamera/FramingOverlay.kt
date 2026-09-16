package expo.modules.focallycamera

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.SystemClock
import android.view.View
import com.facebook.react.common.assets.ReactFontManager
import kotlin.math.abs

class FramingOverlay(context: Context) : View(context) {
    var onFrameSettled: (() -> Unit)? = null
    private var shown: RectF? = null
    private var animator: ValueAnimator? = null
    val settling
        get() = animator?.isRunning == true

    var frame: RectF? = null
        set(value) {
            if (field == value) return
            field = value
            animator?.cancel()
            val from = shown
            if (from == null || value == null || !ValueAnimator.areAnimatorsEnabled()) {
                shown = value?.let(::RectF)
                invalidate()
                return
            }
            val start = RectF(from)
            val target = RectF(value)
            val animated = RectF(from)
            shown = animated
            animator =
                ValueAnimator.ofFloat(0f, 1f).apply {
                    duration = 140
                    addUpdateListener { animation ->
                        val p = animation.animatedValue as Float
                        animated.set(
                            start.left + (target.left - start.left) * p,
                            start.top + (target.top - start.top) * p,
                            start.right + (target.right - start.right) * p,
                            start.bottom + (target.bottom - start.bottom) * p,
                        )
                        invalidate()
                        if (p == 1f) post { onFrameSettled?.invoke() }
                    }
                    start()
                }
        }

    var previewBounds: RectF? = null
        set(value) {
            if (field != value) {
                field = value
                invalidate()
            }
        }

    var grid = false
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    var focalLabel = ""
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    var focus: Pair<Float, Float>? = null
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    var locked = false
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    private var displayedLevel: Float? = null
    private var levelFrameTime = 0L
    var level: Float? = null
        set(value) {
            if (field == value) return
            field = value
            if (value == null || displayedLevel == null) {
                displayedLevel = value
                levelFrameTime = 0L
            }
            postInvalidateOnAnimation()
        }

    private fun animatedLevel(): Float? {
        val target = level ?: return null
        val now = SystemClock.elapsedRealtimeNanos()
        val dt =
            if (levelFrameTime == 0L) 1.0 / 60
            else ((now - levelFrameTime) / 1e9).coerceIn(0.0, 0.1)
        levelFrameTime = now
        val next =
            if (ValueAnimator.areAnimatorsEnabled())
                CameraMath.followAngle(displayedLevel ?: target, target, dt)
            else target
        displayedLevel = next
        if (abs((next - target + 540f) % 360f - 180f) > 0.03f) postInvalidateOnAnimation()
        return next
    }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val mask = Path()
    private val dp = resources.displayMetrics.density
    private val accent = Color.rgb(235, 205, 133)
    private val labelTypeface =
        ReactFontManager.getInstance().getTypeface("Manrope", 500, false, context.assets)

    fun lockPoint(): Map<String, Float>? {
        val point = focus ?: return null
        val bounds = frame ?: return null
        if (
            !locked ||
                width == 0 ||
                height == 0 ||
                bounds.width() < 20 * dp ||
                bounds.height() < 20 * dp
        )
            return null
        return mapOf(
            "x" to point.first.coerceIn(bounds.left + 10 * dp, bounds.right - 10 * dp) / width,
            "y" to
                (point.second + 31 * dp).coerceIn(bounds.top + 10 * dp, bounds.bottom - 10 * dp) /
                    height,
        )
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val r =
            shown
                ?: run {
                    canvas.drawColor(Color.rgb(20, 21, 24))
                    return
                }
        val radius = 9 * dp
        mask.reset()
        mask.addRoundRect(r, radius, radius, Path.Direction.CW)
        canvas.save()
        previewBounds?.let { canvas.clipRect(it) }
        canvas.clipOutPath(mask)
        canvas.drawColor(Color.argb(214, 8, 9, 11))
        canvas.restore()
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.2f * dp
        paint.color = accent
        canvas.drawRoundRect(r, radius, radius, paint)
        if (grid) {
            canvas.save()
            canvas.clipPath(mask)
            paint.color = Color.argb(95, 255, 255, 255)
            paint.strokeWidth = 0.6f * dp
            for (i in 1..2) {
                val x = r.left + r.width() * i / 3
                val y = r.top + r.height() * i / 3
                canvas.drawLine(x, r.top, x, r.bottom, paint)
                canvas.drawLine(r.left, y, r.right, y, paint)
            }
            canvas.restore()
        }
        paint.style = Paint.Style.FILL
        paint.color = accent
        paint.textSize = 12 * dp
        paint.textAlign = Paint.Align.CENTER
        paint.typeface = labelTypeface
        canvas.drawText(
            focalLabel,
            r.centerX(),
            (r.top - 12 * dp).coerceAtLeast(18 * dp),
            paint,
        )
        animatedLevel()?.let { angle ->
            val y = r.centerY()
            val span = (r.width() * 0.18f).coerceAtMost(44 * dp)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1.5f * dp
            paint.color = Color.argb(100, 255, 255, 255)
            canvas.drawLine(r.centerX() - span - 12 * dp, y, r.centerX() - span - 4 * dp, y, paint)
            canvas.drawLine(r.centerX() + span + 4 * dp, y, r.centerX() + span + 12 * dp, y, paint)
            canvas.save()
            canvas.rotate(-angle.coerceIn(-45f, 45f), r.centerX(), y)
            paint.color = if (abs(angle) < 1.2f) accent else Color.argb(155, 255, 255, 255)
            canvas.drawLine(r.centerX() - span, y, r.centerX() + span, y, paint)
            canvas.restore()
        }
        focus?.let { (x, y) ->
            paint.style = Paint.Style.STROKE
            paint.color = accent
            paint.strokeWidth = dp
            canvas.save()
            canvas.clipPath(mask)
            val size = 18 * dp
            canvas.drawRoundRect(x - size, y - size, x + size, y + size, 6 * dp, 6 * dp, paint)
            canvas.restore()
        }
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        animator = null
        level = null
        super.onDetachedFromWindow()
    }
}
