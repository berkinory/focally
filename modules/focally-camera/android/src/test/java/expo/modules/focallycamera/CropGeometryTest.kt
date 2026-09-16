package expo.modules.focallycamera

import org.junit.Assert.*
import org.junit.Test

class CropGeometryTest {
    @Test
    fun previewStartsAtTheTopWithoutCroppingItsSourceOrStretchingIt() {
        val frame = FrameCrop(0.0, 0.0, 1.0, 1.0, PhotoRatio.SENSOR)
        for (rotation in listOf(0, 90, 180, 270)) {
            for ((w, h) in listOf(1080 to 1800, 1800 to 1080)) {
                val bounds = CropGeometry.fitStart(frame, 4000, 3000, rotation, w, h)
                assertEquals(0.0, bounds.left, 0.00001)
                assertEquals(0.0, bounds.top, 0.00001)
                assertTrue(bounds.width <= w && bounds.height <= h)
                assertEquals(
                    if (rotation % 180 == 0) 4.0 / 3 else 3.0 / 4,
                    bounds.width / bounds.height,
                    0.00001,
                )
            }
        }
    }

    @Test
    fun losslessFramesKeepTheirRatioStayInsideTheCropAndAlignForEveryRotation() {
        for (ratio in PhotoRatio.entries) for (mm in listOf(35.0, 50.0, 85.0)) {
            val frame = CropGeometry.frame(24.0, mm, ratio = ratio)
            for ((w, h) in listOf(4000 to 3000, 4032 to 3024, 3000 to 4000, 3263 to 2447)) {
                val wanted = CropGeometry.pixels(frame, 11, 17, w, h)
                for (rotation in listOf(0, 90, 180, 270)) {
                    val crop = CropGeometry.jpegPixels(frame, 11, 17, w, h, rotation)
                    assertTrue(crop.left >= wanted.left && crop.top >= wanted.top)
                    assertTrue(crop.left + crop.width <= wanted.left + wanted.width)
                    assertTrue(crop.top + crop.height <= wanted.top + wanted.height)
                    val rw = if (w > h) ratio.wide else ratio.tall
                    val rh = if (w > h) ratio.tall else ratio.wide
                    assertEquals(crop.width * rh, crop.height * rw)
                    assertEquals(
                        0,
                        (if (rotation == 180 || rotation == 270) crop.left + crop.width
                        else crop.left) % 32,
                    )
                    assertEquals(
                        0,
                        (if (rotation == 90 || rotation == 180) crop.top + crop.height
                        else crop.top) % 32,
                    )
                    val normalized = CropGeometry.normalized(crop, 11, 17, w, h, ratio)
                    val raw = CropGeometry.inBuffer(normalized, h > w)
                    assertEquals(crop.left.toDouble(), 11 + raw.left * w, 0.00001)
                    assertEquals(crop.top.toDouble(), 17 + raw.top * h, 0.00001)
                    assertEquals(crop.width.toDouble(), raw.width * w, 0.00001)
                    assertEquals(crop.height.toDouble(), raw.height * h, 0.00001)
                }
            }
        }
    }

    @Test
    fun offCenterPreviewRotatesTheActualSavedRectangle() {
        val frame = FrameCrop(0.1, 0.2, 0.3, 0.4)
        val expected =
            listOf(
                FrameBounds(40.0, 60.0, 120.0, 120.0),
                FrameBounds(120.0, 40.0, 120.0, 120.0),
                FrameBounds(240.0, 120.0, 120.0, 120.0),
                FrameBounds(60.0, 240.0, 120.0, 120.0),
            )
        for ((index, rotation) in listOf(0, 90, 180, 270).withIndex()) {
            val sideways = rotation % 180 != 0
            val actual =
                CropGeometry.fitStart(
                    frame,
                    400,
                    300,
                    rotation,
                    if (sideways) 300 else 400,
                    if (sideways) 400 else 300,
                )
            assertEquals(expected[index].left, actual.left, 0.00001)
            assertEquals(expected[index].top, actual.top, 0.00001)
            assertEquals(expected[index].width, actual.width, 0.00001)
            assertEquals(expected[index].height, actual.height, 0.00001)
        }
    }

    @Test
    fun pixelCropsKeepTheirRatioCenterAndPreviewBoundsWithoutUpscaling() {
        for (ratio in PhotoRatio.entries) for (base in listOf(24.0, 25.7, 70.0)) {
            for (target in listOf(35.0, 50.0, 85.0).filter { it >= base }) {
                val frame = CropGeometry.frame(base, target, ratio = ratio)
                assertTrue(
                    frame.left >= 0 && frame.top >= 0 && frame.right <= 1 && frame.bottom <= 1
                )
                for ((width, height) in
                    listOf(4000 to 3000, 4032 to 3024, 3264 to 2448, 1920 to 1440)) {
                    for ((w, h) in listOf(width to height, height to width)) {
                        val crop = CropGeometry.pixels(frame, 11, 17, w, h)
                        val wide = if (w > h) ratio.wide else ratio.tall
                        val tall = if (w > h) ratio.tall else ratio.wide
                        assertEquals(crop.width * tall, crop.height * wide)
                        val raw = CropGeometry.inBuffer(frame, h > w)
                        assertTrue(crop.width <= w * raw.width + 0.00001)
                        assertTrue(crop.height <= h * raw.height + 0.00001)
                        assertTrue(crop.left >= 11 && crop.top >= 17)
                        assertTrue(crop.left + crop.width <= 11 + w)
                        assertTrue(crop.top + crop.height <= 17 + h)
                        assertEquals(11 + w / 2.0, crop.left + crop.width / 2.0, 1.0)
                        assertEquals(17 + h / 2.0, crop.top + crop.height / 2.0, 1.0)
                        for (rotation in listOf(0, 90, 180, 270)) {
                            val bounds = CropGeometry.fitStart(frame, w, h, rotation, 1080, 1600)
                            val expected =
                                if (rotation % 180 == 0) crop.width.toDouble() / crop.height
                                else crop.height.toDouble() / crop.width
                            assertEquals(expected, bounds.width / bounds.height, 0.00001)
                        }
                    }
                }
            }
        }
    }

    @Test
    fun previewMatchesTheSavedFrameAfterRotationAndLetterboxing() {
        val frame = CropGeometry.frame(24.0, 50.0, ratio = PhotoRatio.CLASSIC)
        for (rotation in listOf(90, 270)) {
            val view = CropGeometry.fitStart(frame, 4000, 3000, rotation, 1080, 1600)
            assertEquals(540.0, view.left + view.width / 2, 0.00001)
            assertEquals(720.0, view.top + view.height / 2, 0.00001)
            assertEquals(460.8, view.width, 0.00001)
            assertEquals(691.2, view.height, 0.00001)
        }
        for (rotation in listOf(0, 180)) {
            val view = CropGeometry.fitStart(frame, 4000, 3000, rotation, 1600, 900)
            assertEquals(312.0, view.left, 0.00001)
            assertEquals(258.0, view.top, 0.00001)
            assertEquals(576.0, view.width, 0.00001)
            assertEquals(384.0, view.height, 0.00001)
        }
    }

    @Test
    fun presetsNarrowTheFrameWithoutChangingItsCenter() {
        val frames =
            listOf(35.0, 50.0, 85.0).map {
                CropGeometry.frame(24.0, it, ratio = PhotoRatio.CLASSIC)
            }
        frames.forEach {
            assertEquals(0.5, it.left + it.width / 2, 0.0000001)
            assertEquals(0.5, it.top + it.height / 2, 0.0000001)
            assertEquals(1.5, it.width * 4000 / (it.height * 3000), 0.0000001)
        }
        assertTrue(frames[0].width > frames[1].width)
        assertTrue(frames[1].width > frames[2].width)
        assertEquals(0.48, frames[1].width, 0.0000001)
    }

    @Test
    fun viewportOffsetsAreIncludedInTheSavedCrop() {
        val frame = CropGeometry.frame(24.0, 50.0, ratio = PhotoRatio.CLASSIC)
        val crop = CropGeometry.pixels(frame, 100, 240, 4000, 3000)
        assertEquals(PixelCrop(1140, 1100, 1920, 1280), crop)
    }

    @Test
    fun portraitSensorBuffersTransposeTheSameFrame() {
        val frame = CropGeometry.frame(24.0, 50.0)
        val wide = CropGeometry.pixels(frame, 0, 0, 4000, 3000)
        val tall = CropGeometry.pixels(frame, 0, 0, 3000, 4000)
        assertEquals(wide.width, tall.height)
        assertEquals(wide.height, tall.width)
        assertEquals(wide.left, tall.top)
        assertEquals(wide.top, tall.left)
    }

    @Test
    fun telephotoUsesMoreOfItsOwnSensorAt85mm() {
        val main = CropGeometry.frame(24.0, 85.0)
        val tele = CropGeometry.frame(70.0, 85.0)
        assertTrue(tele.width > main.width)
        assertTrue(tele.right <= 1 && tele.bottom <= 1)
    }

    @Test
    fun invalidCalibrationAndImpossibleFramesAreRejected() {
        assertThrows(IllegalArgumentException::class.java) { PhotoRatio.from("16:9") }
        listOf(0.0, -24.0, Double.NaN, Double.POSITIVE_INFINITY).forEach { base ->
            assertThrows(IllegalArgumentException::class.java) { CropGeometry.frame(base, 35.0) }
        }
        assertThrows(IllegalArgumentException::class.java) { CropGeometry.frame(70.0, 35.0) }
        assertThrows(IllegalArgumentException::class.java) { CropGeometry.frame(24.0, 0.0) }
        assertThrows(IllegalArgumentException::class.java) {
            CropGeometry.pixels(FrameCrop(-0.1, 0.0, 0.5, 0.5), 0, 0, 4000, 3000)
        }
        assertThrows(IllegalArgumentException::class.java) {
            CropGeometry.pixels(FrameCrop(0.0, 0.0, 1.1, 1.0), 0, 0, 4000, 3000)
        }
        assertThrows(IllegalArgumentException::class.java) {
            CropGeometry.pixels(CropGeometry.frame(24.0, 85.0), 0, 0, 1, 1)
        }
    }
}
