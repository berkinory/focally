#include "jpeg-transform.h"
#include <memory>
#include <stdexcept>
#include <turbojpeg.h>

std::vector<unsigned char> transformJpeg(const std::vector<unsigned char>& source,
                                       JpegCrop crop, int rotation) {
  std::unique_ptr<void, decltype(&tj3Destroy)> handle(tj3Init(TJINIT_TRANSFORM), tj3Destroy);
  if (!handle) throw std::runtime_error("Could not initialize JPEG transform.");
  const auto check = [&](int code) {
    if (code != 0) throw std::runtime_error(tj3GetErrorStr(handle.get()));
  };
  check(tj3Set(handle.get(), TJPARAM_MAXPIXELS, 16000000));
  check(tj3Set(handle.get(), TJPARAM_MAXMEMORY, 128));
  check(tj3Set(handle.get(), TJPARAM_STOPONWARNING, 1));
  // Preserve the color profile; Kotlin rebuilds EXIF from approved fields.
  check(tj3Set(handle.get(), TJPARAM_SAVEMARKERS, 4));
  check(tj3DecompressHeader(handle.get(), source.data(), source.size()));
  const int width = tj3Get(handle.get(), TJPARAM_JPEGWIDTH);
  const int height = tj3Get(handle.get(), TJPARAM_JPEGHEIGHT);
  const int sampling = tj3Get(handle.get(), TJPARAM_SUBSAMP);
  if (sampling < 0 || sampling >= TJ_NUMSAMP || crop.left < 0 || crop.top < 0 ||
      crop.width <= 0 || crop.height <= 0 || crop.left > width - crop.width ||
      crop.top > height - crop.height || static_cast<long long>(width) * height > 16000000)
    throw std::runtime_error("Invalid JPEG crop.");
  const int blockWidth = tjMCUWidth[sampling], blockHeight = tjMCUHeight[sampling];
  const int usableWidth = width / blockWidth * blockWidth;
  const int usableHeight = height / blockHeight * blockHeight;
  tjtransform transform{};
  transform.options = TJXOPT_CROP | TJXOPT_TRIM;
  switch (rotation) {
    case 0:
      transform.op = TJXOP_NONE;
      transform.r = {crop.left, crop.top, crop.width, crop.height};
      break;
    case 90:
      transform.op = TJXOP_ROT90;
      transform.r = {usableHeight - crop.top - crop.height, crop.left, crop.height, crop.width};
      break;
    case 180:
      transform.op = TJXOP_ROT180;
      transform.r = {usableWidth - crop.left - crop.width,
                     usableHeight - crop.top - crop.height, crop.width, crop.height};
      break;
    case 270:
      transform.op = TJXOP_ROT270;
      transform.r = {crop.top, usableWidth - crop.left - crop.width, crop.height, crop.width};
      break;
    default: throw std::runtime_error("Invalid JPEG rotation.");
  }
  const bool sideways = rotation == 90 || rotation == 270;
  const int alignmentX = sideways ? blockHeight : blockWidth;
  const int alignmentY = sideways ? blockWidth : blockHeight;
  if (transform.r.x < 0 || transform.r.y < 0 || transform.r.x % alignmentX || transform.r.y % alignmentY)
    throw std::runtime_error("JPEG crop is not aligned to the displayed frame.");
  unsigned char* output = nullptr;
  size_t outputSize = 0;
  const int result = tj3Transform(handle.get(), source.data(), source.size(), 1, &output, &outputSize, &transform);
  std::unique_ptr<unsigned char, decltype(&tj3Free)> owned(output, tj3Free);
  check(result);
  if (!output || outputSize == 0) throw std::runtime_error("JPEG transform produced no image.");
  return {output, output + outputSize};
}
