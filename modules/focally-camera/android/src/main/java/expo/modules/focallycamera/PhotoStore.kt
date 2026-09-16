package expo.modules.focallycamera

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Rect
import androidx.camera.core.ImageProxy
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.time.Instant
import java.util.UUID
import kotlin.math.roundToInt

class PhotoStore(private val context: Context) {
    private val library = PhotoLibrary(context)
    private val directory = File(context.cacheDir, "focally-captures").also { it.mkdirs() }

    fun write(
        image: ImageProxy,
        frame: FrameCrop,
        focalMm: Double,
        baseMm: Double,
        autoSave: Boolean,
        keepOriginal: Boolean,
        location: PhotoLocation.Fix?,
    ): Map<String, Any?> =
        synchronized(PhotoLibrary.lock) {
            library.recover()
            val source = File.createTempFile("source-", ".jpg", directory)
            val encoded = File.createTempFile("crop-", ".jpg", directory)
            val files = mutableListOf<PhotoLibrary.SavedFile>()
            var catalogued = false
            try {
                val rotation = image.imageInfo.rotationDegrees
                val sourceWidth = image.width
                val sourceHeight = image.height
                val sourceCrop = Rect(image.cropRect)
                try {
                    FileOutputStream(source).channel.use { channel ->
                        val buffer = image.planes[0].buffer.duplicate()
                        while (buffer.hasRemaining()) channel.write(buffer)
                    }
                } finally {
                    image.close()
                }
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(source.path, bounds)
                check(bounds.outWidth == sourceWidth && bounds.outHeight == sourceHeight) {
                    "The camera returned an unexpected image orientation. No incorrect crop was saved."
                }
                check(sourceWidth.toLong() * sourceHeight <= 16_000_000L) {
                    "Unexpected camera resolution."
                }
                val pixels =
                    CropGeometry.jpegPixels(
                        frame,
                        sourceCrop.left,
                        sourceCrop.top,
                        sourceCrop.width(),
                        sourceCrop.height(),
                        rotation,
                    )
                val rect =
                    Rect(
                        pixels.left,
                        pixels.top,
                        pixels.left + pixels.width,
                        pixels.top + pixels.height,
                    )
                check(Rect(0, 0, sourceWidth, sourceHeight).contains(rect)) {
                    "Frame is outside the captured image."
                }
                try {
                    JpegTransform.crop(
                        source.path,
                        encoded.path,
                        rect.left,
                        rect.top,
                        rect.width(),
                        rect.height(),
                        rotation,
                    )
                } catch (error: LinkageError) {
                    throw IllegalStateException(
                        "Photo processing is unavailable. Please reinstall Focally.",
                        error,
                    )
                }
                val outputWidth = if (rotation % 180 == 0) rect.width() else rect.height()
                val outputHeight = if (rotation % 180 == 0) rect.height() else rect.width()
                val outputBounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(encoded.path, outputBounds)
                check(
                    outputBounds.outWidth == outputWidth && outputBounds.outHeight == outputHeight
                ) {
                    "The JPEG crop did not match the displayed frame."
                }
                writeExif(source, encoded, outputWidth, outputHeight, focalMm, location)
                RandomAccessFile(encoded, "rw").use { it.fd.sync() }
                val instant = Instant.now()
                val id = UUID.randomUUID().toString()
                if (keepOriginal) {
                    val original = File(library.directory, "Focally_${id}_original.jpg")
                    val sideways = rotation % 180 != 0
                    val width = if (sideways) sourceHeight else sourceWidth
                    val height = if (sideways) sourceWidth else sourceHeight
                    files += PhotoLibrary.SavedFile(original, width, height, true)
                    // A no-rotation transform keeps every source pixel and only strips private
                    // markers. EXIF orientation displays the original without edge trimming.
                    JpegTransform.crop(
                        source.path,
                        original.path,
                        0,
                        0,
                        sourceWidth,
                        sourceHeight,
                        0,
                    )
                    val originalBounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeFile(original.path, originalBounds)
                    check(
                        originalBounds.outWidth == sourceWidth &&
                            originalBounds.outHeight == sourceHeight
                    ) {
                        "Original JPEG dimensions changed."
                    }
                    writeExif(
                        source,
                        original,
                        sourceWidth,
                        sourceHeight,
                        baseMm,
                        location,
                        rotation,
                    )
                    RandomAccessFile(original, "rw").use { it.fd.sync() }
                }
                val photo = File(library.directory, "Focally_$id.jpg")
                check(encoded.renameTo(photo)) { "Could not commit photo file." }
                files += PhotoLibrary.SavedFile(photo, outputWidth, outputHeight, false)
                val uris = library.add(files, instant)
                catalogued = true
                var exportFailed = false
                if (autoSave)
                    for (uri in uris) {
                        try {
                            library.export(uri)
                        } catch (_: Exception) {
                            exportFailed = true
                        }
                    }
                requireNotNull(library.details(uris.last())).toMutableMap().apply {
                    put("exportFailed", exportFailed)
                }
            } finally {
                image.close()
                if (!catalogued) files.forEach { it.file.delete() }
                source.delete()
                encoded.delete()
            }
        }

    private fun writeExif(
        source: File,
        output: File,
        width: Int,
        height: Int,
        focalMm: Double,
        location: PhotoLocation.Fix?,
        rotation: Int = 0,
    ) {
        val from = ExifInterface(source)
        val to = ExifInterface(output)
        for (tag in EXIF_TAGS) from.getAttribute(tag)?.let { to.setAttribute(tag, it) }
        to.setAttribute(ExifInterface.TAG_SOFTWARE, "Focally ${BuildConfig.VERSION_NAME}")
        val orientation =
            when (rotation) {
                90 -> ExifInterface.ORIENTATION_ROTATE_90
                180 -> ExifInterface.ORIENTATION_ROTATE_180
                270 -> ExifInterface.ORIENTATION_ROTATE_270
                else -> ExifInterface.ORIENTATION_NORMAL
            }
        to.setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
        to.setAttribute(ExifInterface.TAG_IMAGE_WIDTH, width.toString())
        to.setAttribute(ExifInterface.TAG_IMAGE_LENGTH, height.toString())
        to.setAttribute(ExifInterface.TAG_PIXEL_X_DIMENSION, width.toString())
        to.setAttribute(ExifInterface.TAG_PIXEL_Y_DIMENSION, height.toString())
        to.setAttribute(
            ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM,
            focalMm.roundToInt().toString(),
        )
        location?.permitted(context)?.let { to.setGpsInfo(it) }
        to.saveAttributes()
    }

    companion object {
        private val EXIF_TAGS =
            listOf(
                ExifInterface.TAG_COLOR_SPACE,
                ExifInterface.TAG_MAKE,
                ExifInterface.TAG_MODEL,
                ExifInterface.TAG_DATETIME,
                ExifInterface.TAG_DATETIME_ORIGINAL,
                ExifInterface.TAG_SUBSEC_TIME_ORIGINAL,
                ExifInterface.TAG_OFFSET_TIME_ORIGINAL,
                ExifInterface.TAG_EXPOSURE_TIME,
                ExifInterface.TAG_F_NUMBER,
                ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY,
                ExifInterface.TAG_FOCAL_LENGTH,
                ExifInterface.TAG_WHITE_BALANCE,
                ExifInterface.TAG_EXPOSURE_BIAS_VALUE,
                ExifInterface.TAG_METERING_MODE,
                ExifInterface.TAG_FLASH,
                ExifInterface.TAG_LENS_MODEL,
            )
    }
}
