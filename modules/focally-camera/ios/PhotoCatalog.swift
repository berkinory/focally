import Foundation
import Photos
import SQLite3

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

struct StoredPhoto {
  let id: Int64
  let uri: String
  let width: Int
  let height: Int
  let captured: Int64
  let size: Int64
  let favorite: Bool
  let original: Bool
  let exported: Bool
  let focalLength: Double?
  let iso: Double?
  let exposureTime: Double?
  let aperture: Double?

  var fileURL: URL {
    URL(string: uri)!
  }

  var dictionary: [String: Any?] {
    [
      "uri": uri,
      "width": width,
      "height": height,
      "capturedAt": PhotoCatalog.isoDate(captured),
      "size": size,
      "favorite": favorite,
      "original": original,
      "inGallery": exported,
      "privateCopy": true,
      "focalLength": focalLength,
      "iso": iso,
      "exposureTime": exposureTime,
      "aperture": aperture,
    ]
  }
}

struct PendingPhoto {
  let fileURL: URL
  let width: Int
  let height: Int
  let captured: Int64
  let original: Bool
  let focalLength: Double?
  let iso: Double?
  let exposureTime: Double?
  let aperture: Double?
}

final class PhotoCatalog: @unchecked Sendable {
  static let shared = PhotoCatalog()
  private static let formatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private let queue = DispatchQueue(label: "dev.berk.focally.photo-catalog")
  private var database: OpaquePointer?
  private var recovered = false
  let directory: URL
  private let databaseURL: URL

  private init() {
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let root = support.appendingPathComponent("Focally", isDirectory: true)
    directory = root.appendingPathComponent("photos", isDirectory: true)
    databaseURL = root.appendingPathComponent("photos.sqlite3")
  }

  deinit {
    if let database {
      sqlite3_close(database)
    }
  }

  static func isoDate(_ milliseconds: Int64) -> String {
    formatter.string(from: Date(timeIntervalSince1970: Double(milliseconds) / 1000))
  }

  func add(_ pending: [PendingPhoto]) throws -> [StoredPhoto] {
    try queue.sync {
      let db = try open()
      try recoverIfNeeded(db, preserving: Set(pending.map { $0.fileURL.absoluteString }))
      try execute(db, "BEGIN IMMEDIATE")
      do {
        let sql = """
          INSERT INTO photos
            (uri, width, height, captured, size, original, focal, iso, exposure_time, aperture)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """
        let statement = try prepare(db, sql)
        defer { sqlite3_finalize(statement) }
        var stored: [StoredPhoto] = []
        for photo in pending {
          let file = try checkedFile(photo.fileURL)
          let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
          let size = (attributes[.size] as? NSNumber)?.int64Value ?? 0
          sqlite3_reset(statement)
          sqlite3_clear_bindings(statement)
          bind(statement, 1, photo.fileURL.absoluteString)
          sqlite3_bind_int(statement, 2, Int32(photo.width))
          sqlite3_bind_int(statement, 3, Int32(photo.height))
          sqlite3_bind_int64(statement, 4, photo.captured)
          sqlite3_bind_int64(statement, 5, size)
          sqlite3_bind_int(statement, 6, photo.original ? 1 : 0)
          bind(statement, 7, photo.focalLength)
          bind(statement, 8, photo.iso)
          bind(statement, 9, photo.exposureTime)
          bind(statement, 10, photo.aperture)
          try stepDone(db, statement)
          stored.append(
            StoredPhoto(
              id: sqlite3_last_insert_rowid(db),
              uri: photo.fileURL.absoluteString,
              width: photo.width,
              height: photo.height,
              captured: photo.captured,
              size: size,
              favorite: false,
              original: photo.original,
              exported: false,
              focalLength: photo.focalLength,
              iso: photo.iso,
              exposureTime: photo.exposureTime,
              aperture: photo.aperture
            )
          )
        }
        try execute(db, "COMMIT")
        return stored
      } catch {
        try? execute(db, "ROLLBACK")
        throw error
      }
    }
  }

  func page(before: String?, favoritesOnly: Bool) throws -> (photos: [[String: Any?]], cursor: String?) {
    try queue.sync {
      let db = try open()
      try recoverIfNeeded(db)
      var clauses: [String] = []
      var cursor: (Int64, Int64)?
      if let before {
        let parts = before.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2,
          let captured = Int64(parts[0]),
          let id = Int64(parts[1])
        else {
          throw CatalogError("Invalid photo cursor.")
        }
        cursor = (captured, id)
        clauses.append("(captured < ? OR (captured = ? AND id < ?))")
      }
      if favoritesOnly {
        clauses.append("favorite = 1")
      }
      let whereClause = clauses.isEmpty ? "" : " WHERE " + clauses.joined(separator: " AND ")
      let statement = try prepare(
        db,
        "SELECT \(columns) FROM photos\(whereClause) ORDER BY captured DESC, id DESC LIMIT 49"
      )
      defer { sqlite3_finalize(statement) }
      if let cursor {
        sqlite3_bind_int64(statement, 1, cursor.0)
        sqlite3_bind_int64(statement, 2, cursor.0)
        sqlite3_bind_int64(statement, 3, cursor.1)
      }
      var records: [StoredPhoto] = []
      while sqlite3_step(statement) == SQLITE_ROW {
        records.append(read(statement))
      }
      let hasMore = records.count > 48
      let visible = Array(records.prefix(48))
      let next = hasMore ? visible.last.map { "\($0.captured):\($0.id)" } : nil
      return (visible.map(\.dictionary), next)
    }
  }

  func details(_ uri: String) throws -> StoredPhoto? {
    try queue.sync {
      let db = try open()
      try recoverIfNeeded(db)
      return try record(db, uri)
    }
  }

  func latest() throws -> StoredPhoto? {
    try queue.sync {
      let db = try open()
      try recoverIfNeeded(db)
      let statement = try prepare(
        db,
        "SELECT \(columns) FROM photos ORDER BY captured DESC, id DESC LIMIT 1"
      )
      defer { sqlite3_finalize(statement) }
      return sqlite3_step(statement) == SQLITE_ROW ? read(statement) : nil
    }
  }

  func setFavorite(_ uri: String, _ favorite: Bool) throws {
    try queue.sync {
      let db = try open()
      let statement = try prepare(db, "UPDATE photos SET favorite = ? WHERE uri = ?")
      defer { sqlite3_finalize(statement) }
      sqlite3_bind_int(statement, 1, favorite ? 1 : 0)
      bind(statement, 2, uri)
      try stepDone(db, statement)
      guard sqlite3_changes(db) == 1 else {
        throw CatalogError("Photo is no longer available.")
      }
    }
  }

  func delete(_ uri: String) throws {
    try queue.sync {
      let db = try open()
      guard let photo = try record(db, uri) else {
        throw CatalogError("Photo is no longer available.")
      }
      let file = try checkedFile(photo.fileURL)
      if FileManager.default.fileExists(atPath: file.path) {
        try FileManager.default.removeItem(at: file)
      }
      let statement = try prepare(db, "DELETE FROM photos WHERE uri = ?")
      defer { sqlite3_finalize(statement) }
      bind(statement, 1, uri)
      try stepDone(db, statement)
    }
  }

  func markExported(_ uri: String, identifier: String) throws -> StoredPhoto {
    try queue.sync {
      let db = try open()
      let statement = try prepare(
        db,
        "UPDATE photos SET exported = 1, gallery_identifier = ? WHERE uri = ?"
      )
      defer { sqlite3_finalize(statement) }
      bind(statement, 1, identifier)
      bind(statement, 2, uri)
      try stepDone(db, statement)
      guard let result = try record(db, uri) else {
        throw CatalogError("Photo is no longer available.")
      }
      return result
    }
  }

  func checkedURL(_ uri: String) throws -> URL {
    try queue.sync {
      guard let url = URL(string: uri) else {
        throw CatalogError("Invalid private photo URI.")
      }
      let checked = try checkedFile(url)
      guard FileManager.default.isReadableFile(atPath: checked.path) else {
        throw CatalogError("Photo is no longer available.")
      }
      return checked
    }
  }

  private func open() throws -> OpaquePointer {
    if let database {
      return database
    }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var handle: OpaquePointer?
    guard sqlite3_open_v2(
      databaseURL.path,
      &handle,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX,
      nil
    ) == SQLITE_OK, let handle else {
      if let handle { sqlite3_close(handle) }
      throw CatalogError("Could not open the photo catalog.")
    }
    database = handle
    sqlite3_busy_timeout(handle, 5_000)
    try execute(handle, "PRAGMA journal_mode = WAL")
    try execute(
      handle,
      """
      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uri TEXT NOT NULL UNIQUE,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        captured INTEGER NOT NULL,
        size INTEGER NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        original INTEGER NOT NULL DEFAULT 0,
        exported INTEGER NOT NULL DEFAULT 0,
        gallery_identifier TEXT,
        focal REAL,
        iso REAL,
        exposure_time REAL,
        aperture REAL
      );
      CREATE INDEX IF NOT EXISTS photos_order ON photos(captured DESC, id DESC);
      """
    )
    return handle
  }

  private func recoverIfNeeded(_ db: OpaquePointer, preserving: Set<String> = []) throws {
    guard !recovered else { return }
    let statement = try prepare(db, "SELECT uri FROM photos")
    defer { sqlite3_finalize(statement) }
    var known = Set<String>()
    var missing: [String] = []
    while sqlite3_step(statement) == SQLITE_ROW {
      let uri = string(statement, 0)
      known.insert(uri)
      if let url = URL(string: uri), !FileManager.default.fileExists(atPath: url.path) {
        missing.append(uri)
      }
    }
    let removal = try prepare(db, "DELETE FROM photos WHERE uri = ?")
    defer { sqlite3_finalize(removal) }
    for uri in missing {
      sqlite3_reset(removal)
      sqlite3_clear_bindings(removal)
      bind(removal, 1, uri)
      try stepDone(db, removal)
      known.remove(uri)
    }
    for file in try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil
    ) where file.pathExtension.lowercased() == "jpg"
      && !known.contains(file.absoluteString)
      && !preserving.contains(file.absoluteString)
    {
      try? FileManager.default.removeItem(at: file)
    }
    recovered = true
  }

  private func record(_ db: OpaquePointer, _ uri: String) throws -> StoredPhoto? {
    let statement = try prepare(db, "SELECT \(columns) FROM photos WHERE uri = ? LIMIT 1")
    defer { sqlite3_finalize(statement) }
    bind(statement, 1, uri)
    return sqlite3_step(statement) == SQLITE_ROW ? read(statement) : nil
  }

  private func checkedFile(_ url: URL) throws -> URL {
    guard url.isFileURL else {
      throw CatalogError("Invalid private photo URI.")
    }
    let file = url.standardizedFileURL.resolvingSymlinksInPath()
    let parent = directory.standardizedFileURL.resolvingSymlinksInPath()
    guard file.deletingLastPathComponent() == parent,
      file.pathExtension.lowercased() == "jpg"
    else {
      throw CatalogError("Invalid private photo path.")
    }
    return file
  }

  private var columns: String {
    "id, uri, width, height, captured, size, favorite, original, exported, focal, iso, exposure_time, aperture"
  }

  private func read(_ statement: OpaquePointer?) -> StoredPhoto {
    StoredPhoto(
      id: sqlite3_column_int64(statement, 0),
      uri: string(statement, 1),
      width: Int(sqlite3_column_int(statement, 2)),
      height: Int(sqlite3_column_int(statement, 3)),
      captured: sqlite3_column_int64(statement, 4),
      size: sqlite3_column_int64(statement, 5),
      favorite: sqlite3_column_int(statement, 6) == 1,
      original: sqlite3_column_int(statement, 7) == 1,
      exported: sqlite3_column_int(statement, 8) == 1,
      focalLength: optionalDouble(statement, 9),
      iso: optionalDouble(statement, 10),
      exposureTime: optionalDouble(statement, 11),
      aperture: optionalDouble(statement, 12)
    )
  }

  private func execute(_ db: OpaquePointer, _ sql: String) throws {
    guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else {
      throw CatalogError(String(cString: sqlite3_errmsg(db)))
    }
  }

  private func prepare(_ db: OpaquePointer, _ sql: String) throws -> OpaquePointer? {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else {
      throw CatalogError(String(cString: sqlite3_errmsg(db)))
    }
    return statement
  }

  private func stepDone(_ db: OpaquePointer, _ statement: OpaquePointer?) throws {
    guard sqlite3_step(statement) == SQLITE_DONE else {
      throw CatalogError(String(cString: sqlite3_errmsg(db)))
    }
  }

  private func bind(_ statement: OpaquePointer?, _ index: Int32, _ value: String) {
    sqlite3_bind_text(statement, index, value, -1, sqliteTransient)
  }

  private func bind(_ statement: OpaquePointer?, _ index: Int32, _ value: Double?) {
    if let value {
      sqlite3_bind_double(statement, index, value)
    } else {
      sqlite3_bind_null(statement, index)
    }
  }

  private func string(_ statement: OpaquePointer?, _ index: Int32) -> String {
    String(cString: sqlite3_column_text(statement, index))
  }

  private func optionalDouble(_ statement: OpaquePointer?, _ index: Int32) -> Double? {
    sqlite3_column_type(statement, index) == SQLITE_NULL
      ? nil
      : sqlite3_column_double(statement, index)
  }
}

struct CatalogError: LocalizedError {
  let message: String

  init(_ message: String) {
    self.message = message
  }

  var errorDescription: String? { message }
}

enum PhotoExporter {
  static func export(_ photo: StoredPhoto, newCopy: Bool) async throws -> StoredPhoto {
    if photo.exported && !newCopy {
      return photo
    }
    let authorization = await authorization()
    guard authorization == .authorized || authorization == .limited else {
      throw CatalogError("Photo library access was not granted.")
    }
    let identifier = try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<String, Error>) in
      var placeholder: PHObjectPlaceholder?
      PHPhotoLibrary.shared().performChanges {
        let request = PHAssetCreationRequest.forAsset()
        request.creationDate = Date(timeIntervalSince1970: Double(photo.captured) / 1000)
        let options = PHAssetResourceCreationOptions()
        options.originalFilename = photo.fileURL.lastPathComponent
        request.addResource(with: .photo, fileURL: photo.fileURL, options: options)
        placeholder = request.placeholderForCreatedAsset
      } completionHandler: { success, error in
        if success, let identifier = placeholder?.localIdentifier {
          continuation.resume(returning: identifier)
        } else {
          continuation.resume(
            throwing: error ?? CatalogError("Could not save the photo to the library.")
          )
        }
      }
    }
    return try PhotoCatalog.shared.markExported(photo.uri, identifier: identifier)
  }

  private static func authorization() async -> PHAuthorizationStatus {
    let current = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    guard current == .notDetermined else {
      return current
    }
    return await withCheckedContinuation { continuation in
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
        continuation.resume(returning: status)
      }
    }
  }
}
