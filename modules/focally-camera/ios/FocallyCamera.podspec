Pod::Spec.new do |s|
  s.name            = 'FocallyCamera'
  s.version         = '0.0.1'
  s.summary         = 'Focally native camera and private photo library.'
  s.description     = 'The iOS implementation of Focally camera capture, processing, and storage.'
  s.license         = 'MIT'
  s.author          = 'Focally'
  s.homepage        = 'https://github.com/berkinory/focally'
  s.platforms       = { :ios => '16.4' }
  s.swift_version   = '5.9'
  s.source          = { :git => 'https://github.com/berkinory/focally.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreImage', 'CoreLocation', 'CoreMotion', 'ImageIO', 'Photos'
  s.libraries = 'sqlite3'
  s.source_files = '**/*.{h,m,mm,swift,cpp}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
