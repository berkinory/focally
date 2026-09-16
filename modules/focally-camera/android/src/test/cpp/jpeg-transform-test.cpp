#include "jpeg-transform.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <turbojpeg.h>

using Bytes = std::vector<unsigned char>;
using Handle = std::unique_ptr<void, decltype(&tj3Destroy)>;
static void expect(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}
static void check(void* handle, int code) {
  if (code) throw std::runtime_error(tj3GetErrorStr(handle));
}
static Bytes jpeg(int width, int height, int sampling) {
  Handle handle(tj3Init(TJINIT_COMPRESS), tj3Destroy);
  check(handle.get(), tj3Set(handle.get(), TJPARAM_QUALITY, 93));
  check(handle.get(), tj3Set(handle.get(), TJPARAM_SUBSAMP, sampling));
  Bytes profile{1, 2, 3, 4, 5, 6};
  check(handle.get(), tj3SetICCProfile(handle.get(), profile.data(), profile.size()));
  Bytes rgb(width * height * 3);
  for (int y = 0; y < height; ++y) for (int x = 0; x < width; ++x) {
    const int i = (y * width + x) * 3;
    rgb[i] = (x * 197 / width + y * 31 / height) % 256;
    rgb[i + 1] = (x * 43 / width + y * 181 / height) % 256;
    rgb[i + 2] = (x / 16 + y / 16) % 2 ? 180 : 40;
  }
  unsigned char* bytes = nullptr;
  size_t size = 0;
  check(handle.get(), tj3Compress8(handle.get(), rgb.data(), width, 0, height, TJPF_RGB, &bytes, &size));
  Bytes result(bytes, bytes + size);
  tj3Free(bytes);
  // An EXIF-like private marker must not survive the transform. Kotlin rebuilds its whitelist.
  const Bytes app1{0xff, 0xe1, 0x00, 0x0a, 'E', 'x', 'i', 'f', 0, 0, 1, 2};
  result.insert(result.begin() + 2, app1.begin(), app1.end());
  return result;
}
struct Image { int width, height; Bytes pixels; };
static Image decode(const Bytes& bytes) {
  Handle handle(tj3Init(TJINIT_DECOMPRESS), tj3Destroy);
  check(handle.get(), tj3DecompressHeader(handle.get(), bytes.data(), bytes.size()));
  const int w = tj3Get(handle.get(), TJPARAM_JPEGWIDTH);
  const int h = tj3Get(handle.get(), TJPARAM_JPEGHEIGHT);
  // Nearest chroma sampling avoids dependence on pixels just outside a cropped edge.
  check(handle.get(), tj3Set(handle.get(), TJPARAM_FASTUPSAMPLE, 1));
  Image image{w, h, Bytes(w * h * 3)};
  check(handle.get(), tj3Decompress8(handle.get(), bytes.data(), bytes.size(), image.pixels.data(), 0, TJPF_RGB));
  return image;
}
static bool hasMarker(const Bytes& bytes, unsigned char wanted) {
  size_t i = 2;
  while (i + 3 < bytes.size() && bytes[i] == 0xff) {
    const auto marker = bytes[i + 1];
    if (marker == wanted) return true;
    if (marker == 0xda || marker == 0xd9) break;
    i += 2 + (bytes[i + 2] << 8) + bytes[i + 3];
  }
  return false;
}
static void compare(const Bytes& source, JpegCrop crop, int rotation) {
  auto encoded = transformJpeg(source, crop, rotation);
  auto original = decode(source), output = decode(encoded);
  bool sideways = rotation == 90 || rotation == 270;
  expect(output.width == (sideways ? crop.height : crop.width), "Wrong output width");
  expect(output.height == (sideways ? crop.width : crop.height), "Wrong output height");
  int maximum = 0;
  for (int y = 0; y < output.height; ++y) for (int x = 0; x < output.width; ++x) {
    int sx = x, sy = y;
    if (rotation == 90) { sx = y; sy = crop.height - 1 - x; }
    if (rotation == 180) { sx = crop.width - 1 - x; sy = crop.height - 1 - y; }
    if (rotation == 270) { sx = crop.width - 1 - y; sy = x; }
    for (int c = 0; c < 3; ++c) {
      int expected = original.pixels[((sy + crop.top) * original.width + sx + crop.left) * 3 + c];
      int actual = output.pixels[(y * output.width + x) * 3 + c];
      maximum = std::max(maximum, std::abs(actual - expected));
    }
  }
  // Transposing quantized DCT blocks can round the integer decoder by a few levels.
  expect(maximum <= (rotation == 0 ? 0 : 3), "Rotated pixels do not match the source crop");
  expect(!hasMarker(encoded, 0xe1), "Source EXIF/private metadata was copied");
  Handle handle(tj3Init(TJINIT_DECOMPRESS), tj3Destroy);
  check(handle.get(), tj3DecompressHeader(handle.get(), encoded.data(), encoded.size()));
  unsigned char* profile = nullptr;
  size_t length = 0;
  check(handle.get(), tj3GetICCProfile(handle.get(), &profile, &length));
  Bytes actualProfile(profile, profile + length);
  tj3Free(profile);
  expect(actualProfile == Bytes({1, 2, 3, 4, 5, 6}), "ICC color profile changed");
}
template<class Action> static void rejects(Action action) {
  try { action(); } catch (const std::runtime_error&) { return; }
  throw std::runtime_error("Invalid input was accepted");
}
int main() {
  try {
    int count = 0;
    for (int sampling : {TJSAMP_444, TJSAMP_422, TJSAMP_420, TJSAMP_GRAY, TJSAMP_440, TJSAMP_411, TJSAMP_441}) {
      for (auto dimensions : {std::pair{320, 240}, std::pair{307, 221}, std::pair{221, 307}}) {
        auto source = jpeg(dimensions.first, dimensions.second, sampling);
        for (int rotation : {0, 90, 180, 270}) {
          // Asymmetric, non-block-sized 3:2 frame. Align only the rotated upper-left corner.
          const int x = (rotation == 180 || rotation == 270) ? 160 - 99 : 64;
          const int y = (rotation == 90 || rotation == 180) ? 128 - 66 : 32;
          compare(source, {x, y, 99, 66}, rotation);
          ++count;
        }
      }
    }
    auto source = jpeg(320, 240, TJSAMP_420);
    rejects([&] { transformJpeg(source, {1, 0, 99, 66}, 0); });
    rejects([&] { transformJpeg(source, {0, 0, 999, 66}, 0); });
    rejects([&] { transformJpeg(source, {0, 0, 99, 66}, 45); });
    rejects([&] { transformJpeg(Bytes{0, 1, 2}, {0, 0, 99, 66}, 0); });
    std::cout << count << " rotation/sampling/dimension cases and 4 rejection cases passed.\n";
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
