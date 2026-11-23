Pod::Spec.new do |s|
  s.name           = 'PatchworkLocalAi'
  s.version        = '1.0.0'
  s.summary        = 'On-device AI through Apple Foundation Models'
  s.description    = 'On-device AI through Apple Foundation Models (Apple Intelligence)'
  s.license        = 'MIT'
  s.author         = 'Patchwork'
  s.homepage       = 'https://github.com/tashifkhan/patchwork'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # Weak, so iOS 16.4 to 25 still launch; the code checks #available first.
  s.weak_frameworks = 'FoundationModels'
  s.source_files = "**/*.{h,m,swift}"
end
