package expo.modules.focallycamera

import org.junit.Assert.*
import org.junit.Test

class CameraMathTest {
    @Test
    fun meteringNeverEscapesTheSavedFrameEvenAtItsCorners() {
        val frame =
            CameraMath.sensorFrame(
                CropGeometry.frame(24.0, 50.0, ratio = PhotoRatio.CLASSIC),
                40,
                60,
                4000,
                3000,
            )
        assertEquals(PixelCrop(1080, 920, 1920, 1280), frame)
        assertEquals(
            frame,
            CameraMath.meteringArea(frame.left, frame.top, frame.width, frame.height, null, null),
        )
        for (x in listOf(-1.0, 0.0, 0.5, 1.0, 2.0)) for (y in listOf(-1.0, 0.0, 0.5, 1.0, 2.0)) {
            val point =
                CameraMath.meteringArea(frame.left, frame.top, frame.width, frame.height, x, y)
            assertTrue(point.left >= frame.left && point.top >= frame.top)
            assertTrue(point.left + point.width <= frame.left + frame.width)
            assertTrue(point.top + point.height <= frame.top + frame.height)
        }
        assertThrows(IllegalArgumentException::class.java) {
            CameraMath.meteringArea(0, 0, 100, 100, Double.NaN, 0.0)
        }
    }

    @Test
    fun previewResolutionFitsTheVisibleAreaAndIsBounded() {
        for ((w, h) in listOf(320 to 480, 1080 to 1800, 2560 to 3840)) {
            val (wide, tall) = CameraMath.previewSize(w, h)
            assertEquals(wide to tall, CameraMath.previewSize(h, w))
            assertEquals(wide * 3, tall * 4)
            assertTrue(wide <= 1920)
            val visibleShortSide = minOf(w, h).coerceAtMost(1440)
            assertTrue(tall >= visibleShortSide)
        }
    }

    @Test
    fun exposureUsesTheActualLensStepAndLimits() {
        assertEquals(1, CameraMath.exposureIndex(0.41, 1.0 / 3, -6, 6))
        assertEquals(6, CameraMath.exposureIndex(4.0, 1.0 / 3, -6, 6))
        assertEquals(-6, CameraMath.exposureIndex(-4.0, 1.0 / 3, -6, 6))
        assertEquals(0, CameraMath.exposureIndex(0.0, 0.5, -4, 4))
        assertThrows(IllegalArgumentException::class.java) {
            CameraMath.exposureIndex(Double.NaN, 0.5, -4, 4)
        }
        assertThrows(IllegalArgumentException::class.java) {
            CameraMath.exposureIndex(1.0, 0.0, -4, 4)
        }
    }

    @Test
    fun horizonSmoothingIsIndependentOfRefreshRate() {
        var sixty = 0f
        var oneTwenty = 0f
        repeat(12) { sixty = CameraMath.followAngle(sixty, 20f, 1.0 / 60) }
        repeat(24) { oneTwenty = CameraMath.followAngle(oneTwenty, 20f, 1.0 / 120) }
        assertEquals(sixty, oneTwenty, 0.01f)
        assertTrue(sixty > 0f && sixty < 20f)
        assertEquals(15f, CameraMath.followAngle(15f, 25f, 0.0), 0.001f)
    }

    @Test
    fun horizonCrossesTheAngleBoundaryWithoutSpinning() {
        val angle = CameraMath.followAngle(179f, -179f, 1.0 / 60)
        assertTrue(angle > 179f || angle < -179f)
        assertEquals(-180f, CameraMath.followAngle(-180f, 180f, 0.1), 0.001f)
    }

    @Test
    fun horizonRespectsEveryDisplayRotation() {
        assertEquals(0f, CameraMath.horizon(0f, 9.8f, 0)!!, 0.001f)
        assertEquals(0f, CameraMath.horizon(9.8f, 0f, 1)!!, 0.001f)
        assertEquals(0f, CameraMath.horizon(0f, -9.8f, 2)!!, 0.001f)
        assertEquals(0f, CameraMath.horizon(-9.8f, 0f, 3)!!, 0.001f)
        assertEquals(45f, CameraMath.horizon(6.9f, 6.9f, 0)!!, 0.01f)
        assertNull(CameraMath.horizon(0f, 0.2f, 0))
        assertNull(CameraMath.horizon(Float.NaN, 9.8f, 0))
    }
}
