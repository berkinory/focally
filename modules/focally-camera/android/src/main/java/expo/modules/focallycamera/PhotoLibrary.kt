package expo.modules.focallycamera

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import android.provider.MediaStore
import androidx.core.content.FileProvider
import androidx.core.content.edit
import androidx.core.net.toUri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.time.Instant
import java.util.UUID

class PhotoLibrary(private val context: Context) {
    private val resolver = context.contentResolver
    private val db = database(context).writableDatabase
    private val prefs = context.getSharedPreferences("focally-photos", Context.MODE_PRIVATE)
    val directory = File(context.filesDir, "photos").also { check(it.isDirectory || it.mkdirs()) }
    private val collection =
        MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    private val selection =
        "${MediaStore.Images.Media.RELATIVE_PATH} = ? AND ${MediaStore.Images.Media.OWNER_PACKAGE_NAME} = ? AND ${MediaStore.Images.Media.MIME_TYPE} = ?"
    private val args
        get() = arrayOf("Pictures/Focally/", context.packageName, "image/jpeg")

    data class SavedFile(val file: File, val width: Int, val height: Int, val original: Boolean)

    fun add(files: List<SavedFile>, instant: Instant): List<String> =
        synchronized(lock) {
            db.beginTransaction()
            try {
                val uris = files.map { item ->
                    val uri = Uri.fromFile(item.file).toString()
                    db.insertOrThrow(
                        "photos",
                        null,
                        ContentValues().apply {
                            put("uri", uri)
                            put("width", item.width)
                            put("height", item.height)
                            put("captured", instant.toEpochMilli())
                            put("size", item.file.length())
                            put("original", if (item.original) 1 else 0)
                        },
                    )
                    uri
                }
                db.setTransactionSuccessful()
                uris
            } finally {
                db.endTransaction()
            }
        }

    fun page(before: String?, favoritesOnly: Boolean): Map<String, Any?> =
        synchronized(lock) {
            recover()
            if (before == null) syncMedia()
            val cursor = before?.split(":")
            require(
                cursor == null || (cursor.size == 2 && cursor.all { it.toLongOrNull() != null })
            ) {
                "Invalid photo cursor."
            }
            val clauses = mutableListOf("1 = 1")
            val values = mutableListOf<String>()
            if (cursor != null) {
                clauses += "(captured < ? OR (captured = ? AND id < ?))"
                values += listOf(cursor[0], cursor[0], cursor[1])
            }
            if (favoritesOnly) clauses += "favorite = 1"
            val photos = mutableListOf<Map<String, Any?>>()
            var next: String? = null
            db.query(
                    "photos",
                    null,
                    clauses.joinToString(" AND "),
                    values.toTypedArray(),
                    null,
                    null,
                    "captured DESC, id DESC",
                    "49",
                )
                .use { rows ->
                    while (rows.moveToNext()) {
                        if (photos.size == 48) break
                        photos += read(rows)
                        next =
                            "${rows.getLong(rows.getColumnIndexOrThrow("captured"))}:${rows.getLong(rows.getColumnIndexOrThrow("id"))}"
                    }
                    if (rows.count <= 48) next = null
                }
            mapOf("photos" to photos, "nextCursor" to next)
        }

    fun details(value: String): Map<String, Any?>? =
        synchronized(lock) {
            val photo = record(value)?.toMutableMap() ?: return@synchronized null
            val uri = value.toUri()
            for (exported in exports(value)) if (!mediaExists(exported)) {
                db.delete("photo_exports", "media_uri = ?", arrayOf(exported.toString()))
                db.update(
                    "photos",
                    ContentValues().apply {
                        putNull("media_uri")
                        put("pending", 0)
                    },
                    "uri = ? AND media_uri = ?",
                    arrayOf(value, exported.toString()),
                )
            }
            photo["inGallery"] = exports(value).isNotEmpty()
            try {
                val stream =
                    if (uri.scheme == "file") checkedFile(uri).inputStream()
                    else resolver.openInputStream(ownedMedia(uri))
                stream?.use { input ->
                    val exif = ExifInterface(input)
                    photo["focalLength"] =
                        exif
                            .getAttributeInt(ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM, 0)
                            .takeIf { it > 0 }
                    photo["iso"] =
                        exif.getAttributeInt(ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY, 0).takeIf {
                            it > 0
                        }
                    photo["exposureTime"] =
                        exif.getAttributeDouble(ExifInterface.TAG_EXPOSURE_TIME, 0.0).takeIf {
                            it > 0
                        }
                    photo["aperture"] =
                        exif.getAttributeDouble(ExifInterface.TAG_F_NUMBER, 0.0).takeIf { it > 0 }
                } ?: return@synchronized null
            } catch (_: java.io.FileNotFoundException) {
                return@synchronized null
            }
            photo
        }

    fun shareUri(value: String): Uri =
        synchronized(lock) {
            requireNotNull(record(value)) { "Photo is no longer available." }
            val uri = value.toUri()
            if (uri.scheme == "file") {
                val file = checkedFile(uri)
                check(file.isFile && file.canRead()) { "Photo is no longer available." }
                FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.photos",
                    file,
                )
            } else ownedMedia(uri)
        }

    fun favorite(value: String, selected: Boolean) =
        synchronized(lock) {
            check(
                db.update(
                    "photos",
                    ContentValues().apply { put("favorite", if (selected) 1 else 0) },
                    "uri = ?",
                    arrayOf(value),
                ) == 1
            )
        }

    fun delete(value: String, deleteDeviceCopies: Boolean) =
        synchronized(lock) {
            requireNotNull(record(value)) { "Photo is no longer available." }
            val uri = value.toUri()
            val copies = exports(value)
            if (deleteDeviceCopies) {
                for (media in copies) {
                    if (mediaExists(media)) check(resolver.delete(media, selection, args) == 1)
                }
            }
            if (uri.scheme == "file") {
                val file = checkedFile(uri)
                check(!file.exists() || file.delete()) { "Could not delete photo." }
            }
            db.beginTransaction()
            try {
                // Retain detached public URIs so sync cannot import a deliberately removed photo.
                db.update(
                    "photo_exports",
                    ContentValues().apply { putNull("photo_uri") },
                    "photo_uri = ?",
                    arrayOf(value),
                )
                check(db.delete("photos", "uri = ?", arrayOf(value)) == 1)
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }

    private fun exports(value: String): List<Uri> =
        db.query(
                "photo_exports",
                arrayOf("media_uri"),
                "photo_uri = ?",
                arrayOf(value),
                null,
                null,
                null,
            )
            .use { rows ->
                buildList { while (rows.moveToNext()) add(rows.getString(0).toUri()) }
            }

    fun export(value: String, newCopy: Boolean = false): Map<String, Any?> =
        synchronized(lock) {
            recover()
            val photo = requireNotNull(record(value)) { "Photo is no longer available." }
            val existing = mediaUri(value)
            if (!newCopy && existing != null && mediaExists(existing)) {
                val pending =
                    resolver
                        .query(
                            existing,
                            arrayOf(MediaStore.Images.Media.IS_PENDING),
                            selection,
                            args,
                            null,
                        )
                        ?.use { it.moveToFirst() && it.getInt(0) == 1 }
                        ?: error("Could not query gallery save state.")
                if (!pending) {
                    db.update(
                        "photos",
                        ContentValues().apply { put("pending", 0) },
                        "uri = ?",
                        arrayOf(value),
                    )
                    return@synchronized requireNotNull(details(value))
                }
                check(resolver.delete(existing, selection, args) == 1)
                db.update(
                    "photos",
                    ContentValues().apply {
                        putNull("media_uri")
                        put("pending", 0)
                    },
                    "uri = ?",
                    arrayOf(value),
                )
            }
            val file = checkedFile(value.toUri())
            val target =
                resolver.insert(
                    collection,
                    ContentValues().apply {
                        put(MediaStore.Images.Media.DISPLAY_NAME, file.name)
                        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                        put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Focally")
                        put(MediaStore.Images.Media.IS_PENDING, 1)
                        put(
                            MediaStore.Images.Media.DATE_TAKEN,
                            Instant.parse(photo["capturedAt"].toString()).toEpochMilli(),
                        )
                        put(MediaStore.Images.Media.WIDTH, photo["width"] as Int)
                        put(MediaStore.Images.Media.HEIGHT, photo["height"] as Int)
                    },
                ) ?: error("Could not create gallery photo.")
            var published = false
            try {
                db.insertOrThrow(
                    "photo_exports",
                    null,
                    ContentValues().apply {
                        put("media_uri", target.toString())
                        put("photo_uri", value)
                        put("pending", 1)
                    },
                )
                check(
                    db.update(
                        "photos",
                        ContentValues().apply {
                            put("media_uri", target.toString())
                            put("pending", 1)
                        },
                        "uri = ?",
                        arrayOf(value),
                    ) == 1
                )
                resolver.openFileDescriptor(target, "w")?.use { descriptor ->
                    java.io.FileOutputStream(descriptor.fileDescriptor).use { output ->
                        file.inputStream().use { it.copyTo(output) }
                        output.fd.sync()
                    }
                } ?: error("Could not write gallery photo.")
                check(
                    resolver.update(
                        target,
                        ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) },
                        null,
                        null,
                    ) == 1
                )
                published = true
                db.update(
                    "photo_exports",
                    ContentValues().apply { put("pending", 0) },
                    "media_uri = ?",
                    arrayOf(target.toString()),
                )
                db.update(
                    "photos",
                    ContentValues().apply { put("pending", 0) },
                    "uri = ?",
                    arrayOf(value),
                )
            } finally {
                if (!published) {
                    try {
                        resolver.delete(target, selection, args)
                        db.delete("photo_exports", "media_uri = ?", arrayOf(target.toString()))
                        db.update(
                            "photos",
                            ContentValues().apply {
                                putNull("media_uri")
                                put("pending", 0)
                            },
                            "uri = ?",
                            arrayOf(value),
                        )
                    } catch (_: Exception) {
                        /* recover() retries this persisted pending write. */
                    }
                }
            }
            requireNotNull(details(value))
        }

    fun latest(): Map<String, Any?>? =
        synchronized(lock) {
            recover()
            syncMedia()
            db.query("photos", null, null, null, null, null, "captured DESC, id DESC", "1").use {
                if (it.moveToFirst()) read(it) else null
            }
        }

    private fun record(value: String): Map<String, Any?>? =
        db.query("photos", null, "uri = ?", arrayOf(value), null, null, null).use {
            if (it.moveToFirst()) read(it) else null
        }

    private fun mediaUri(value: String): Uri? =
        db.query("photos", arrayOf("media_uri"), "uri = ?", arrayOf(value), null, null, null).use {
            if (it.moveToFirst() && !it.isNull(0)) it.getString(0).toUri() else null
        }

    private fun checkedFile(uri: Uri): File {
        require(uri.scheme == "file" && uri.authority.isNullOrEmpty()) {
            "Invalid private photo URI."
        }
        val file = File(requireNotNull(uri.path)).canonicalFile
        require(file.parentFile == directory.canonicalFile && file.extension == "jpg") {
            "Invalid private photo path."
        }
        return file
    }

    private fun validMedia(uri: Uri) {
        require(
            uri.scheme == "content" &&
                uri.authority == collection.authority &&
                uri.pathSegments.dropLast(1) == collection.pathSegments &&
                ContentUris.parseId(uri) > 0
        ) {
            "Invalid gallery photo URI."
        }
    }

    private fun mediaExists(uri: Uri): Boolean {
        validMedia(uri)
        return resolver
            .query(uri, arrayOf(MediaStore.Images.Media._ID), selection, args, null)
            ?.use { it.moveToFirst() } ?: error("Could not query device gallery.")
    }

    private fun ownedMedia(uri: Uri): Uri {
        require(mediaExists(uri)) { "Photo is no longer owned or available." }
        return uri
    }

    private fun syncMedia() {
        val seen = mutableSetOf<String>()
        val known = mutableSetOf<String>()
        val legacy = mutableSetOf<String>()
        db.rawQuery("SELECT uri, media_uri FROM photos", null).use { rows ->
            while (rows.moveToNext()) {
                known += rows.getString(0)
                if (!rows.isNull(1)) known += rows.getString(1)
                if (rows.getString(0).startsWith("content:")) legacy += rows.getString(0)
            }
        }
        db.rawQuery("SELECT media_uri FROM photo_exports", null).use { rows ->
            while (rows.moveToNext()) known += rows.getString(0)
        }
        val favorites = prefs.getStringSet("favorites", emptySet()) ?: emptySet()
        val projection =
            arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.WIDTH,
                MediaStore.Images.Media.HEIGHT,
                MediaStore.Images.Media.DATE_TAKEN,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.SIZE,
            )
        resolver
            .query(
                collection,
                projection,
                "$selection AND ${MediaStore.Images.Media.IS_PENDING} = 0",
                args,
                null,
            )
            ?.use { rows ->
                while (rows.moveToNext()) {
                    val media = ContentUris.withAppendedId(collection, rows.getLong(0))
                    val value = media.toString()
                    seen += value
                    if (value !in known || value in legacy) {
                        val file = File(directory, "import-${UUID.randomUUID()}.jpg")
                        var committed = false
                        try {
                            resolver.openInputStream(media)?.use { input ->
                                java.io.FileOutputStream(file).use { output ->
                                    input.copyTo(output)
                                    output.fd.sync()
                                }
                            } ?: error("Could not preserve gallery photo.")
                            val local = Uri.fromFile(file).toString()
                            db.beginTransaction()
                            try {
                                if (value in legacy) {
                                    check(
                                        db.update(
                                            "photos",
                                            ContentValues().apply {
                                                put("uri", local)
                                                put("size", file.length())
                                            },
                                            "uri = ?",
                                            arrayOf(value),
                                        ) == 1
                                    )
                                    db.update(
                                        "photo_exports",
                                        ContentValues().apply { put("photo_uri", local) },
                                        "photo_uri = ?",
                                        arrayOf(value),
                                    )
                                } else {
                                    db.insertOrThrow(
                                        "photos",
                                        null,
                                        ContentValues().apply {
                                            put("uri", local)
                                            put("media_uri", value)
                                            put("width", rows.getInt(1))
                                            put("height", rows.getInt(2))
                                            put(
                                                "captured",
                                                rows.getLong(3).takeIf { it > 0 }
                                                    ?: rows.getLong(4) * 1000,
                                            )
                                            put("size", file.length())
                                            put("favorite", if (value in favorites) 1 else 0)
                                        },
                                    )
                                }
                                check(
                                    db.insertWithOnConflict(
                                        "photo_exports",
                                        null,
                                        ContentValues().apply {
                                            put("media_uri", value)
                                            put("photo_uri", local)
                                            put("pending", 0)
                                        },
                                        SQLiteDatabase.CONFLICT_REPLACE,
                                    ) != -1L
                                )
                                db.setTransactionSuccessful()
                            } finally {
                                db.endTransaction()
                            }
                            committed = true
                        } finally {
                            if (!committed) file.delete()
                        }
                    }
                }
            } ?: error("Could not read gallery photos.")
        db.beginTransaction()
        try {
            db.rawQuery("SELECT media_uri FROM photo_exports WHERE pending = 0", null).use { rows ->
                while (rows.moveToNext()) if (rows.getString(0) !in seen) {
                    db.delete("photo_exports", "media_uri = ?", arrayOf(rows.getString(0)))
                }
            }
            db.execSQL(
                "UPDATE photos SET media_uri = NULL, pending = 0 WHERE media_uri IS NOT NULL AND media_uri NOT IN (SELECT media_uri FROM photo_exports)"
            )
            db.execSQL("DELETE FROM photos WHERE uri LIKE 'content:%' AND media_uri IS NULL")
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun recover() =
        synchronized(lock) {
            if (recovered) return@synchronized
            val oldPending = prefs.getString("pending", null)
            val pending = mutableListOf<Pair<String?, Uri>>()
            oldPending?.let { pending += null to it.toUri() }
            db.rawQuery("SELECT photo_uri, media_uri FROM photo_exports WHERE pending = 1", null)
                .use { rows ->
                    while (rows.moveToNext()) pending +=
                        rows.getString(0) to rows.getString(1).toUri()
                }
            resolver
                .query(
                    collection,
                    arrayOf(MediaStore.Images.Media._ID),
                    "$selection AND ${MediaStore.Images.Media.IS_PENDING} = 1",
                    args,
                    null,
                )
                ?.use { rows ->
                    while (rows.moveToNext()) {
                        val uri = ContentUris.withAppendedId(collection, rows.getLong(0))
                        if (pending.none { it.second == uri }) pending += null to uri
                    }
                } ?: error("Could not recover unfinished gallery saves.")
            for ((local, uri) in pending) {
                var complete = false
                try {
                    validMedia(uri)
                    resolver
                        .query(
                            uri,
                            arrayOf(MediaStore.Images.Media.IS_PENDING),
                            selection,
                            args,
                            null,
                        )
                        ?.use { rows ->
                            if (rows.moveToFirst()) {
                                complete = rows.getInt(0) == 0
                                if (!complete) check(resolver.delete(uri, selection, args) == 1)
                            }
                        } ?: error("Could not query unfinished gallery save.")
                } catch (_: SecurityException) {
                    /* URI no longer belongs to this installation. */
                }
                if (complete)
                    db.update(
                        "photo_exports",
                        ContentValues().apply { put("pending", 0) },
                        "media_uri = ?",
                        arrayOf(uri.toString()),
                    )
                else db.delete("photo_exports", "media_uri = ?", arrayOf(uri.toString()))
                if (local != null)
                    db.update(
                        "photos",
                        ContentValues().apply {
                            put("pending", 0)
                            if (!complete) putNull("media_uri")
                        },
                        "uri = ? AND media_uri = ?",
                        arrayOf(local, uri.toString()),
                    )
            }
            prefs.edit {
                remove("pending")
                remove("last")
            }
            val known = mutableSetOf<String>()
            db.rawQuery("SELECT uri FROM photos", null).use { rows ->
                while (rows.moveToNext()) known += rows.getString(0)
            }
            directory
                .listFiles()
                ?.filter { it.isFile && Uri.fromFile(it).toString() !in known }
                ?.forEach { check(it.delete()) }
            File(context.cacheDir, "focally-captures")
                .listFiles()
                ?.filter { it.isFile }
                ?.forEach { it.delete() }
            recovered = true
        }

    private fun read(row: Cursor): Map<String, Any?> {
        fun text(name: String) = row.getString(row.getColumnIndexOrThrow(name))
        fun number(name: String) = row.getLong(row.getColumnIndexOrThrow(name))
        return mapOf(
            "uri" to text("uri"),
            "width" to number("width").toInt(),
            "height" to number("height").toInt(),
            "capturedAt" to Instant.ofEpochMilli(number("captured")).toString(),
            "size" to number("size"),
            "favorite" to (number("favorite") == 1L),
            "original" to (number("original") == 1L),
            "inGallery" to
                db.rawQuery(
                        "SELECT 1 FROM photo_exports WHERE photo_uri = ? AND pending = 0 LIMIT 1",
                        arrayOf(text("uri")),
                    )
                    .use { it.moveToFirst() },
            "privateCopy" to text("uri").startsWith("file:"),
            "focalLength" to null,
        )
    }

    companion object {
        internal val lock = Any()
        private var recovered = false
        private var helper: PhotoDatabase? = null

        private fun database(context: Context) =
            synchronized(lock) {
                helper ?: PhotoDatabase(context.applicationContext).also { helper = it }
            }
    }
}

private class PhotoDatabase(private val context: Context) :
    SQLiteOpenHelper(context, "photos.db", null, 2) {
    private fun migrate(db: SQLiteDatabase, first: Int, last: Int) {
        for (version in first..last) {
            val sql =
                context.assets.open("focally-photos-v$version.sql").bufferedReader().use {
                    it.readText()
                }
            for (statement in sql.split(';').map { it.trim() }.filter { it.isNotEmpty() }) db
                .execSQL(statement)
        }
    }

    override fun onCreate(db: SQLiteDatabase) = migrate(db, 1, 2)

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) = migrate(db, old + 1, new)
}

class PhotoFileProvider : FileProvider()
