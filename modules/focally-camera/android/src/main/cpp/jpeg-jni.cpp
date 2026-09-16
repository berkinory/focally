#include "jpeg-transform.h"
#include <fstream>
#include <jni.h>
#include <stdexcept>
#include <string>

static std::string path(JNIEnv* env, jstring value) {
  if (!value) throw std::runtime_error("Missing JPEG path.");
  const char* chars = env->GetStringUTFChars(value, nullptr);
  if (!chars) throw std::runtime_error("Could not read JPEG path.");
  std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_focallycamera_JpegTransform_crop(JNIEnv* env, jobject,
    jstring inputPath, jstring outputPath, jint x, jint y, jint width, jint height, jint rotation) {
  try {
    std::ifstream input(path(env, inputPath), std::ios::binary | std::ios::ate);
    const auto size = input.tellg();
    if (!input || size <= 0 || size > 128 * 1024 * 1024) throw std::runtime_error("Invalid camera JPEG file.");
    std::vector<unsigned char> bytes(static_cast<size_t>(size));
    input.seekg(0);
    if (!input.read(reinterpret_cast<char*>(bytes.data()), size)) throw std::runtime_error("Could not read camera JPEG.");
    auto encoded = transformJpeg(bytes, {x, y, width, height}, rotation);
    std::ofstream output(path(env, outputPath), std::ios::binary | std::ios::trunc);
    output.write(reinterpret_cast<const char*>(encoded.data()), encoded.size());
    output.close();
    if (!output) throw std::runtime_error("Could not save cropped JPEG.");
  } catch (const std::exception& error) {
    if (!env->ExceptionCheck()) env->ThrowNew(env->FindClass("java/io/IOException"), error.what());
  }
}
