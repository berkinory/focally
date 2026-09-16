#pragma once
#include <vector>

struct JpegCrop {
  int left, top, width, height;
};

std::vector<unsigned char> transformJpeg(const std::vector<unsigned char>& source,
                                       JpegCrop crop, int rotation);
