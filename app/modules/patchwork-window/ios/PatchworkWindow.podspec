Pod::Spec.new do |s|
  s.name           = 'PatchworkWindow'
  s.version        = '1.0.0'
  s.summary        = 'Window fold info (no-op on Apple platforms)'
  s.description    = 'Window fold info (no-op on Apple platforms)'
  s.license        = 'MIT'
  s.author         = 'Patchwork'
  s.homepage       = 'https://github.com/tashifkhan/patchwork'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
end
