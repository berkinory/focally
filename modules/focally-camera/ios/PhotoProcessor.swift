import CoreImage
import CoreLocation
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct ProcessedCapture {
  let photos: [StoredPhoto]
  let selected: StoredPhoto
}

enum PhotoProcessor {
  private static let context = CIContext(options: [.cacheIntermediates: false])

  static func process(
    data: Data,
    targetMillimeters: Double,
    baseMillimeters: Double,
    ratio: PhotoRatio,
    keepOriginal: Bool,
    location: CLLocation?
  ) throws -> ProcessedCapture {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
      let input = CIImage(data: data, options: [.applyOrientationProperty: false])
    else {
      throw CatalogError("The captured JPEG could not be decoded.")
    }

    let orientation = (properties[kCGImagePropertyOrientation as String] as? NSNumber)?.int32Value ?? 1
    let oriented = input.oriented(forExifOrientation: orientation)
    let translated = oriented.transformed(
      by: CGAffineTransform(translationX: -oriented.extent.minX, y: -oriented.extent.minY)
    )
    guard let fullImage = context.createCGImage(translated, from: translated.extent.integral) else {
      throw CatalogError("The captured JPEG could not be rendered.")
    }

    let captured = Int64(Date().timeIntervalSince1970 * 1_000)
    try FileManager.default.createDirectory(
      at: PhotoCatalog.shared.directory,
      withIntermediateDirectories: true
    )
    let details = captureDetails(properties)
    let metadata = outputMetadata(
      properties,
      width: fullImage.width,
      height: fullImage.height,
      focalLength: targetMillimeters,
      location: location,
      captured: captured
    )
    var files: [URL] = []
    do {
      var pending: [PendingPhoto] = []
      if keepOriginal {
        let original = outputURL(suffix: "_original")
        try write(fullImage, to: original, metadata: metadata)
        files.append(original)
        pending.append(
          PendingPhoto(
            fileURL: original,
            width: fullImage.width,
            height: fullImage.height,
            captured: captured,
            original: true,
            focalLength: targetMillimeters,
            iso: details.iso,
            exposureTime: details.exposureTime,
            aperture: details.aperture
          )
        )
      }

      let crop = CameraGeometry.pixelCrop(
        imageSize: CGSize(width: fullImage.width, height: fullImage.height),
        baseMillimeters: baseMillimeters,
        targetMillimeters: targetMillimeters,
        ratio: ratio
      )
      guard let cropped = fullImage.cropping(to: crop) else {
        throw CatalogError("The selected frame could not be cropped.")
      }
      let photo = outputURL(suffix: "")
      let croppedMetadata = outputMetadata(
        properties,
        width: cropped.width,
        height: cropped.height,
        focalLength: targetMillimeters,
        location: location,
        captured: captured
      )
      try write(cropped, to: photo, metadata: croppedMetadata)
      files.append(photo)
      pending.append(
        PendingPhoto(
          fileURL: photo,
          width: cropped.width,
          height: cropped.height,
          captured: captured,
          original: false,
          focalLength: targetMillimeters,
          iso: details.iso,
          exposureTime: details.exposureTime,
          aperture: details.aperture
        )
      )
      let stored = try PhotoCatalog.shared.add(pending)
      guard let selected = stored.last else {
        throw CatalogError("The captured photo was not stored.")
      }
      return ProcessedCapture(photos: stored, selected: selected)
    } catch {
      files.forEach { try? FileManager.default.removeItem(at: $0) }
      throw error
    }
  }

  private static func outputURL(suffix: String) -> URL {
    PhotoCatalog.shared.directory.appendingPathComponent("Focally_\(UUID().uuidString)\(suffix).jpg")
  }

  private static func write(_ image: CGImage, to url: URL, metadata: [String: Any]) throws {
    guard let destination = CGImageDestinationCreateWithURL(
      url as CFURL,
      UTType.jpeg.identifier as CFString,
      1,
      nil
    ) else {
      throw CatalogError("Could not create the private photo file.")
    }
    var options = metadata
    options[kCGImageDestinationLossyCompressionQuality as String] = 0.95
    CGImageDestinationAddImage(destination, image, options as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
      throw CatalogError("Could not write the private photo file.")
    }
  }

  private static func outputMetadata(
    _ source: [String: Any],
    width: Int,
    height: Int,
    focalLength: Double,
    location: CLLocation?,
    captured: Int64
  ) -> [String: Any] {
    var result = source
    result[kCGImagePropertyOrientation as String] = 1
    result[kCGImagePropertyPixelWidth as String] = width
    result[kCGImagePropertyPixelHeight as String] = height

    var exif = source[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
    exif[kCGImagePropertyExifPixelXDimension as String] = width
    exif[kCGImagePropertyExifPixelYDimension as String] = height
    exif[kCGImagePropertyExifFocalLenIn35mmFilm as String] = Int(focalLength.rounded())
    result[kCGImagePropertyExifDictionary as String] = exif

    var tiff = source[kCGImagePropertyTIFFDictionary as String] as? [String: Any] ?? [:]
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
    tiff[kCGImagePropertyTIFFSoftware as String] = "Focally \(version)"
    result[kCGImagePropertyTIFFDictionary as String] = tiff

    if let location {
      result[kCGImagePropertyGPSDictionary as String] = gpsMetadata(location, captured: captured)
    } else {
      result.removeValue(forKey: kCGImagePropertyGPSDictionary as String)
    }
    return result
  }

  private static func captureDetails(_ properties: [String: Any]) -> (
    iso: Double?, exposureTime: Double?, aperture: Double?
  ) {
    let exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
    let sensitivity = exif[kCGImagePropertyExifISOSpeedRatings as String] as? [NSNumber]
    return (
      sensitivity?.first?.doubleValue,
      (exif[kCGImagePropertyExifExposureTime as String] as? NSNumber)?.doubleValue,
      (exif[kCGImagePropertyExifFNumber as String] as? NSNumber)?.doubleValue
    )
  }

  private static func gpsMetadata(_ location: CLLocation, captured: Int64) -> [String: Any] {
    let coordinate = location.coordinate
    let date = Date(timeIntervalSince1970: Double(captured) / 1_000)
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "HH:mm:ss.SSSSSS"
    let dateFormatter = DateFormatter()
    dateFormatter.locale = formatter.locale
    dateFormatter.timeZone = formatter.timeZone
    dateFormatter.dateFormat = "yyyy:MM:dd"
    var gps: [String: Any] = [
      kCGImagePropertyGPSLatitude as String: abs(coordinate.latitude),
      kCGImagePropertyGPSLatitudeRef as String: coordinate.latitude >= 0 ? "N" : "S",
      kCGImagePropertyGPSLongitude as String: abs(coordinate.longitude),
      kCGImagePropertyGPSLongitudeRef as String: coordinate.longitude >= 0 ? "E" : "W",
      kCGImagePropertyGPSTimeStamp as String: formatter.string(from: date),
      kCGImagePropertyGPSDateStamp as String: dateFormatter.string(from: date),
      kCGImagePropertyGPSHPositioningError as String: location.horizontalAccuracy,
    ]
    if location.verticalAccuracy >= 0 {
      gps[kCGImagePropertyGPSAltitude as String] = abs(location.altitude)
      gps[kCGImagePropertyGPSAltitudeRef as String] = location.altitude >= 0 ? 0 : 1
    }
    return gps
  }
}
