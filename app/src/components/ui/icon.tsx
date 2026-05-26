import { SymbolView, type SymbolViewProps, type SymbolWeight } from 'expo-symbols';

export interface IconProps {
  name: SymbolViewProps['name'];
  size?: number;
  color?: string;
  weight?: SymbolWeight;
  animationSpec?: SymbolViewProps['animationSpec'];
}

// Thin wrapper over SF Symbols. iOS-first; on Android/web symbols may not
// render, so accompany important icons with text labels.
export function Icon({ name, size = 20, color, weight = 'regular', animationSpec }: IconProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      animationSpec={animationSpec}
      style={{ width: size, height: size }}
    />
  );
}
