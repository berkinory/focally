cmake_minimum_required(VERSION 3.22)
project(focally_jpeg LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
include(ExternalProject)
if(POLICY CMP0135)
  cmake_policy(SET CMP0135 NEW)
endif()
set(jpeg_SOURCE_DIR "${CMAKE_CURRENT_BINARY_DIR}/jpeg-source")
set(jpeg_BINARY_DIR "${CMAKE_CURRENT_BINARY_DIR}/jpeg-build")
set(jpeg_PLATFORM_ARGS)
foreach(variable CMAKE_TOOLCHAIN_FILE CMAKE_MAKE_PROGRAM ANDROID_ABI ANDROID_PLATFORM ANDROID_STL CMAKE_OSX_ARCHITECTURES WITH_SIMD)
  if(DEFINED ${variable})
    list(APPEND jpeg_PLATFORM_ARGS "-D${variable}=${${variable}}")
  endif()
endforeach()
ExternalProject_Add(jpeg
  URL "${CMAKE_CURRENT_SOURCE_DIR}/third-party/libjpeg-turbo-3.2.0.tar.gz"
  URL_HASH SHA256=6f30092cef9fb839779646608f4ee14ae3cbac989c47fa05e841b0841f09878e
  SOURCE_DIR "${jpeg_SOURCE_DIR}"
  BINARY_DIR "${jpeg_BINARY_DIR}"
  CMAKE_ARGS -DCMAKE_BUILD_TYPE=Release -DCMAKE_POSITION_INDEPENDENT_CODE=ON
    -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_TURBOJPEG=ON -DWITH_TOOLS=OFF
    -DWITH_TESTS=OFF ${jpeg_PLATFORM_ARGS}
  BUILD_COMMAND "${CMAKE_COMMAND}" --build <BINARY_DIR> --target turbojpeg-static --parallel 2
  INSTALL_COMMAND ""
  BUILD_BYPRODUCTS "${jpeg_BINARY_DIR}/libturbojpeg.a")
file(MAKE_DIRECTORY "${jpeg_SOURCE_DIR}/src" "${jpeg_BINARY_DIR}")
add_library(turbojpeg STATIC IMPORTED)
set_target_properties(turbojpeg PROPERTIES IMPORTED_LOCATION "${jpeg_BINARY_DIR}/libturbojpeg.a")
add_dependencies(turbojpeg jpeg)
add_library(focally-transform STATIC src/main/cpp/jpeg-transform.cpp)
target_include_directories(focally-transform PUBLIC src/main/cpp "${jpeg_SOURCE_DIR}/src" "${jpeg_BINARY_DIR}")
target_link_libraries(focally-transform PUBLIC turbojpeg)
if(ANDROID)
  add_library(focally-jpeg SHARED src/main/cpp/jpeg-jni.cpp)
  target_link_libraries(focally-jpeg PRIVATE focally-transform)
  target_link_options(focally-jpeg PRIVATE "-Wl,--exclude-libs,ALL" "-Wl,-z,max-page-size=16384")
else()
  enable_testing()
  add_executable(jpeg-transform-test src/test/cpp/jpeg-transform-test.cpp)
  target_link_libraries(jpeg-transform-test PRIVATE focally-transform)
  add_test(NAME jpeg-transform COMMAND jpeg-transform-test)
endif()
