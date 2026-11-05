import ExpoModulesCore

/// iOS has no public hinge API: iPad, iPhone and any foldable iPhone report
/// their usable area through size classes and the window size, which JS
/// already reads from `useWindowDimensions()`. The module exists so the JS
/// API is the same on both platforms; it never reports a fold.
public class PatchworkWindowModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PatchworkWindow")

    Events("onFoldChange")

    Function("getFold") { () -> [String: Any]? in
      nil
    }
  }
}
