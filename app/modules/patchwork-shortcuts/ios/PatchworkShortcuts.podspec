Pod::Spec.new do |s|
  s.name           = 'PatchworkShortcuts'
  s.version        = '1.0.0'
  s.summary        = 'Quick actions and Siri shortcut hand-off for Patchwork'
  s.description    = 'Queues home-screen quick actions and App Intents for the JS side to run'
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
