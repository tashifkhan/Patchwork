import { memo, useEffect, useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';

/**
 * Patch, the quilted blob from the app icon. Every mood shares the body,
 * patches and stitches, and changes the face, the right arm and whatever
 * Patch is holding.
 */
export type MascotMood =
  /** Waving, mouth open. Onboarding welcome, About. */
  | 'hello'
  /** The logo pose: a smile and a checked card. Done, all clear. */
  | 'done'
  /** Eyes shut, a few z's. Empty lists, nothing scheduled. */
  | 'sleepy'
  /** Looking up with a magnifier. Search, nothing found. */
  | 'curious'
  /** Eyes up at a sparkle. AI at work. */
  | 'thinking'
  /** A light bulb card. Brain dump, ideas. */
  | 'idea'
  /** A padlock card, set brows. App lock, privacy. */
  | 'guard'
  /** A timer card, set brows. Focus, pomodoro. */
  | 'focus'
  /** Worried, a crossed-out cloud. Errors, offline. */
  | 'oops'
  /** A three-column card. Boards. */
  | 'board'
  /** A plus card, grinning. Connect an account, add the first thing. */
  | 'connect';

type Eyes = 'open' | 'happy' | 'sleepy' | 'up' | 'wink';
type Mouth = 'smile' | 'grin' | 'flat' | 'o' | 'wobble' | 'small';
type Brows = 'none' | 'set' | 'worried';
type Arm = 'hold' | 'wave' | 'rest';
type Prop = 'check' | 'lock' | 'clock' | 'magnifier' | 'bulb' | 'columns' | 'cloud-off' | 'plus' | null;
type Extra = 'sparks' | 'zzz' | 'sparkle' | 'sweat' | null;

interface Pose {
  eyes: Eyes;
  mouth: Mouth;
  brows: Brows;
  arm: Arm;
  prop: Prop;
  extra: Extra;
}

const POSES: Record<MascotMood, Pose> = {
  hello: { eyes: 'open', mouth: 'grin', brows: 'none', arm: 'wave', prop: null, extra: 'sparks' },
  done: { eyes: 'happy', mouth: 'smile', brows: 'none', arm: 'hold', prop: 'check', extra: 'sparks' },
  sleepy: { eyes: 'sleepy', mouth: 'small', brows: 'none', arm: 'rest', prop: null, extra: 'zzz' },
  curious: { eyes: 'up', mouth: 'o', brows: 'none', arm: 'hold', prop: 'magnifier', extra: null },
  thinking: { eyes: 'up', mouth: 'flat', brows: 'none', arm: 'rest', prop: null, extra: 'sparkle' },
  idea: { eyes: 'open', mouth: 'grin', brows: 'none', arm: 'hold', prop: 'bulb', extra: 'sparks' },
  guard: { eyes: 'open', mouth: 'smile', brows: 'set', arm: 'hold', prop: 'lock', extra: null },
  focus: { eyes: 'open', mouth: 'flat', brows: 'set', arm: 'hold', prop: 'clock', extra: null },
  oops: { eyes: 'open', mouth: 'wobble', brows: 'worried', arm: 'hold', prop: 'cloud-off', extra: 'sweat' },
  board: { eyes: 'wink', mouth: 'smile', brows: 'none', arm: 'hold', prop: 'columns', extra: 'sparks' },
  connect: { eyes: 'open', mouth: 'grin', brows: 'none', arm: 'hold', prop: 'plus', extra: 'sparks' },
};

/** The icon's colors. The patches stay put on every theme. */
const C = {
  cream: '#F9EBDC',
  sage: '#8E9E82',
  terracotta: '#CE6A4B',
  amber: '#EFA83E',
  spark: '#DC9B3D',
  stitch: '#EED2A9',
  blush: '#C66243',
  ink: '#342D28',
  /** Outline and limbs on dark backgrounds, where the ink would vanish. */
  inkOnDark: '#CDB8A0',
  sweat: '#8EC3E6',
};

const BODY =
  'M 365 90 C 455 74, 545 74, 580 138 C 594 166, 586 265, 588 342 C 591 420, 596 488, 545 534 C 502 568, 435 568, 352 566 C 265 565, 178 562, 138 508 C 110 468, 108 395, 110 326 C 113 242, 128 172, 178 134 C 226 98, 298 98, 365 90 Z';
const CARD =
  'M 632 162 C 686 155, 712 158, 717 204 C 721 242, 722 284, 712 308 C 702 329, 666 328, 634 328 C 584 328, 558 326, 551 286 C 546 252, 547 208, 556 184 C 566 164, 594 167, 632 162 Z';

const EYE_L = { x: 303, y: 286 };
const EYE_R = { x: 465, y: 265 };

export interface PatchMascotProps {
  mood?: MascotMood;
  /** Width in points. Height follows the drawing's 760×660 shape. */
  size?: number;
  /** Bob, blink and breathe. Off under reduce motion regardless. */
  animate?: boolean;
  /** A tap squishes Patch, with a haptic. */
  interactive?: boolean;
  /** Null hides Patch from screen readers, for decoration next to a heading. */
  accessibilityLabel?: string | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * Draws Patch in `mood`. Outlines and limbs switch to a light ink on dark
 * themes (including AMOLED black) so the silhouette never disappears; the face
 * always sits on the cream body and keeps the dark ink.
 */
export const PatchMascot = memo(function PatchMascot({
  mood = 'done',
  size = 120,
  animate = true,
  interactive = true,
  accessibilityLabel = null,
  style,
}: PatchMascotProps) {
  const { scheme } = useTheme();
  const reduced = useReducedMotion();
  const live = animate && !reduced;
  const pose = POSES[mood];
  const edge = scheme === 'dark' ? C.inkOnDark : C.ink;
  const blinking = useBlink(live && (pose.eyes === 'open' || pose.eyes === 'up' || pose.eyes === 'wink'));

  const t = useSharedValue(0);
  const squish = useSharedValue(1);

  useEffect(() => {
    if (!live) {
      t.set(0);
      return;
    }
    const period = mood === 'sleepy' ? 2600 : mood === 'hello' ? 700 : 1900;
    t.set(withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [live, mood, t]);

  const motion = useAnimatedStyle(() => {
    const p = t.value;
    if (mood === 'sleepy') {
      // Breathing, anchored at the feet.
      return {
        transform: [
          { translateY: size * 0.03 * p * 0.5 },
          { scaleX: (1 + 0.02 * p) * squish.value },
          { scaleY: (1 + 0.035 * p) * (2 - squish.value) },
        ],
      };
    }
    if (mood === 'hello') {
      return { transform: [{ rotateZ: `${-3 + 6 * p}deg` }, { scale: squish.value }] };
    }
    return {
      transform: [
        { translateY: -size * 0.035 * p },
        { scaleX: squish.value },
        { scaleY: 2 - squish.value },
      ],
    };
  });

  const height = (size * 660) / 760;

  const drawing = (
    <Animated.View style={[{ width: size, height }, motion]}>
      <Svg width={size} height={height} viewBox="0 0 760 660">
        <Defs>
          <ClipPath id="patch-body">
            <Path d={BODY} />
          </ClipPath>
        </Defs>

        <ExtraLayer extra={pose.extra} edge={edge} />

        {/* Back limbs: left arm and both feet. */}
        <G fill={edge}>
          <Path d="M 116 376 C 72 396, 40 434, 46 465 C 52 492, 92 486, 120 442 Z" />
          <Path d="M 234 554 C 224 592, 222 618, 246 622 C 276 626, 306 608, 318 560 Z" />
          <Path d="M 375 560 C 386 608, 416 626, 446 622 C 470 618, 470 592, 462 554 Z" />
          {pose.arm === 'rest' ? <Path d="M 588 376 C 632 396, 664 434, 658 465 C 652 492, 612 486, 584 442 Z" /> : null}
        </G>

        <G clipPath="url(#patch-body)">
          <Path d={BODY} fill={C.cream} />
          <Path
            d="M 365 86 C 388 125, 368 178, 282 214 C 215 242, 182 280, 168 336 L 90 326 L 90 70 L 365 70 Z"
            fill={C.sage}
          />
          <Path
            d="M 106 325 C 145 326, 185 335, 224 374 C 264 414, 288 436, 340 432 C 378 429, 398 425, 417 447 C 395 470, 372 512, 350 572 L 90 575 Z"
            fill={C.terracotta}
          />
          <Path
            d="M 350 572 C 372 512, 395 470, 417 447 C 460 404, 522 372, 592 342 L 620 342 L 620 585 L 350 585 Z"
            fill={C.amber}
          />
          <G fill="none" stroke={C.ink} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M 365 86 C 388 125, 368 178, 282 214 C 215 242, 182 280, 168 336" />
            <Path d="M 106 325 C 145 326, 185 335, 224 374 C 264 414, 288 436, 340 432 C 378 429, 398 425, 417 447" />
            <Path d="M 350 572 C 372 512, 395 470, 417 447 C 460 404, 522 372, 592 342" />
          </G>
        </G>
        <Path d={BODY} fill="none" stroke={edge} strokeWidth={14} strokeLinejoin="round" />

        <G stroke={C.stitch} strokeWidth={15} strokeLinecap="round">
          <Line x1={354} y1={122} x2={388} y2={137} />
          <Line x1={329} y1={160} x2={359} y2={186} />
          <Line x1={145} y1={310} x2={139} y2={346} />
          <Line x1={210} y1={336} x2={183} y2={366} />
          <Line x1={246} y1={370} x2={218} y2={397} />
          <Line x1={386} y1={457} x2={416} y2={474} />
          <Line x1={362} y1={502} x2={392} y2={522} />
        </G>

        <Face pose={pose} blinking={blinking} />

        {pose.arm === 'hold' && pose.prop ? (
          <G>
            <Path d={CARD} fill={C.cream} stroke={edge} strokeWidth={13} strokeLinejoin="round" />
            <PropGlyph prop={pose.prop} />
          </G>
        ) : null}

        {pose.arm === 'hold' ? (
          <Path
            fill={edge}
            d="M 582 360 C 602 332, 622 298, 650 301 C 676 304, 682 334, 666 364 C 648 398, 616 416, 584 422 Z"
          />
        ) : null}
        {pose.arm === 'wave' ? (
          <Path
            fill={edge}
            d="M 580 352 C 606 304, 636 248, 664 214 C 684 190, 718 198, 712 232 C 704 274, 656 338, 586 414 Z"
          />
        ) : null}
      </Svg>
    </Animated.View>
  );

  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

  if (!interactive) {
    return (
      <Animated.View style={style} {...a11y}>
        {drawing}
      </Animated.View>
    );
  }

  return (
    <Pressable
      {...a11y}
      onPress={() => {
        haptics.impact('light');
        squish.set(
          withSequence(withTiming(1.12, { duration: 90 }), withSpring(1, { damping: 6, stiffness: 260 }))
        );
      }}
      style={style}>
      {drawing}
    </Pressable>
  );
});

/** Blinks every few seconds while `enabled`, with a little randomness. */
function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let open: ReturnType<typeof setTimeout> | undefined;
    let next: ReturnType<typeof setTimeout>;
    const schedule = () => {
      next = setTimeout(() => {
        setClosed(true);
        open = setTimeout(() => {
          setClosed(false);
          schedule();
        }, 130);
      }, 2600 + Math.random() * 2400);
    };
    schedule();
    return () => {
      clearTimeout(next);
      if (open) clearTimeout(open);
      setClosed(false);
    };
  }, [enabled]);
  return closed;
}

function Face({ pose, blinking }: { pose: Pose; blinking: boolean }) {
  return (
    <G>
      <EyePair eyes={pose.eyes} blinking={blinking} />
      <BrowLines brows={pose.brows} />
      <MouthShape mouth={pose.mouth} />
      <G stroke={C.blush} strokeWidth={8} strokeLinecap="round">
        <Line x1={258} y1={317} x2={249} y2={330} />
        <Line x1={275} y1={318} x2={266} y2={331} />
        <Line x1={501} y1={290} x2={491} y2={304} />
        <Line x1={518} y1={292} x2={508} y2={305} />
      </G>
    </G>
  );
}

function OpenEye({ x, y, lookUp }: { x: number; y: number; lookUp?: boolean }) {
  const cy = lookUp ? y - 8 : y;
  return (
    <G>
      <Ellipse cx={x} cy={cy} rx={21} ry={23} fill={C.ink} />
      <Circle cx={x + 7} cy={cy - 9} r={6.5} fill={C.cream} />
    </G>
  );
}

/** A closed eye drawn as an arc. `up` bends like a smile (^), otherwise it droops. */
function ArcEye({ x, y, up }: { x: number; y: number; up: boolean }) {
  const d = up
    ? `M ${x - 21} ${y + 6} Q ${x} ${y - 22} ${x + 21} ${y + 6}`
    : `M ${x - 21} ${y - 4} Q ${x} ${y + 16} ${x + 21} ${y - 4}`;
  return <Path d={d} fill="none" stroke={C.ink} strokeWidth={11} strokeLinecap="round" />;
}

function EyePair({ eyes, blinking }: { eyes: Eyes; blinking: boolean }) {
  if (eyes === 'happy') {
    return (
      <G>
        <ArcEye {...EYE_L} up />
        <ArcEye {...EYE_R} up />
      </G>
    );
  }
  if (eyes === 'sleepy' || blinking) {
    return (
      <G>
        <ArcEye {...EYE_L} up={false} />
        <ArcEye {...EYE_R} up={false} />
      </G>
    );
  }
  if (eyes === 'wink') {
    return (
      <G>
        <OpenEye {...EYE_L} />
        <ArcEye {...EYE_R} up />
      </G>
    );
  }
  return (
    <G>
      <OpenEye {...EYE_L} lookUp={eyes === 'up'} />
      <OpenEye {...EYE_R} lookUp={eyes === 'up'} />
    </G>
  );
}

function BrowLines({ brows }: { brows: Brows }) {
  if (brows === 'none') return null;
  // Set: inner ends low (determined). Worried: inner ends high.
  const set = brows === 'set';
  return (
    <G stroke={C.ink} strokeWidth={10} strokeLinecap="round">
      <Line x1={EYE_L.x - 24} y1={EYE_L.y - (set ? 44 : 34)} x2={EYE_L.x + 20} y2={EYE_L.y - (set ? 32 : 50)} />
      <Line x1={EYE_R.x - 20} y1={EYE_R.y - (set ? 32 : 50)} x2={EYE_R.x + 24} y2={EYE_R.y - (set ? 44 : 34)} />
    </G>
  );
}

function MouthShape({ mouth }: { mouth: Mouth }) {
  const stroke = { fill: 'none', stroke: C.ink, strokeWidth: 11, strokeLinecap: 'round' as const };
  switch (mouth) {
    case 'grin':
      return (
        <G>
          <Path d="M 360 294 Q 390 338 421 288 Q 391 302 360 294 Z" fill={C.ink} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <Path d="M 378 314 Q 392 306 405 312 Q 394 324 378 314 Z" fill={C.blush} />
        </G>
      );
    case 'flat':
      return <Path d="M 370 303 Q 391 309 412 299" {...stroke} />;
    case 'o':
      return <Ellipse cx={391} cy={307} rx={11} ry={13} fill={C.ink} />;
    case 'wobble':
      return <Path d="M 364 310 Q 377 298 390 307 Q 403 316 418 302" {...stroke} />;
    case 'small':
      return <Path d="M 378 304 Q 391 314 404 302" {...stroke} />;
    default:
      return <Path d="M 363 297 Q 391 322 416 291" {...stroke} />;
  }
}

/** What's drawn on the card, centred on it (about 634, 245). */
function PropGlyph({ prop }: { prop: NonNullable<Prop> }) {
  const line = {
    fill: 'none',
    stroke: C.ink,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (prop) {
    case 'check':
      return <Path d="M 594 242 L 622 270 L 679 208" {...line} strokeWidth={19} />;
    case 'lock':
      return (
        <G>
          <Path d="M 610 238 V 216 A 24 24 0 0 1 658 216 V 238" {...line} strokeWidth={13} />
          <Rect x={590} y={234} width={88} height={66} rx={14} fill={C.ink} />
          <Circle cx={634} cy={260} r={9} fill={C.amber} />
          <Rect x={630} y={262} width={8} height={20} rx={4} fill={C.amber} />
        </G>
      );
    case 'clock':
      return (
        <G>
          <Rect x={622} y={184} width={24} height={14} rx={5} fill={C.ink} />
          <Circle cx={634} cy={252} r={50} {...line} strokeWidth={12} />
          <Path d="M 634 252 V 222 M 634 252 L 656 266" {...line} strokeWidth={11} />
          <Path d="M 634 202 A 50 50 0 0 1 684 252 L 634 252 Z" fill={C.terracotta} opacity={0.85} />
        </G>
      );
    case 'magnifier':
      return (
        <G>
          <Circle cx={622} cy={234} r={32} fill={C.stitch} stroke={C.ink} strokeWidth={13} />
          <Path d="M 646 258 L 680 292" {...line} strokeWidth={19} />
        </G>
      );
    case 'bulb':
      return (
        <G>
          <Path
            d="M 610 262 C 588 246, 590 196, 634 194 C 678 196, 680 246, 658 262 L 654 276 L 614 276 Z"
            fill={C.amber}
            stroke={C.ink}
            strokeWidth={12}
            strokeLinejoin="round"
          />
          <Path d="M 618 298 H 650" {...line} strokeWidth={12} />
          <Path d="M 624 236 Q 634 250 644 236" {...line} strokeWidth={8} />
        </G>
      );
    case 'columns':
      return (
        <G>
          <Rect x={584} y={196} width={26} height={96} rx={9} fill={C.sage} stroke={C.ink} strokeWidth={8} />
          <Rect x={621} y={196} width={26} height={68} rx={9} fill={C.terracotta} stroke={C.ink} strokeWidth={8} />
          <Rect x={658} y={196} width={26} height={82} rx={9} fill={C.amber} stroke={C.ink} strokeWidth={8} />
        </G>
      );
    case 'cloud-off':
      return (
        <G>
          <Path
            d="M 604 278 C 580 278, 576 246, 598 240 C 598 214, 630 204, 646 222 C 666 210, 690 228, 682 250 C 700 256, 696 280, 676 278 Z"
            fill={C.stitch}
            stroke={C.ink}
            strokeWidth={11}
            strokeLinejoin="round"
          />
          <Path d="M 592 200 L 684 300" {...line} strokeWidth={13} />
        </G>
      );
    case 'plus':
      return <Path d="M 634 206 V 286 M 594 246 H 674" {...line} strokeWidth={19} />;
  }
}

function ExtraLayer({ extra, edge }: { extra: Extra; edge: string }) {
  switch (extra) {
    case 'sparks':
      return (
        <G stroke={C.spark} strokeLinecap="round">
          <Line x1={622} y1={53} x2={612} y2={86} strokeWidth={21} />
          <Line x1={640} y1={110} x2={668} y2={92} strokeWidth={20} />
          <Line x1={104} y1={178} x2={78} y2={160} strokeWidth={18} />
        </G>
      );
    case 'zzz':
      return (
        <G fill="none" stroke={C.spark} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M 560 92 H 598 L 560 130 H 598" strokeWidth={12} />
          <Path d="M 618 40 H 648 L 618 70 H 648" strokeWidth={10} />
          <Path d="M 670 6 H 692 L 670 28 H 692" strokeWidth={8} />
        </G>
      );
    case 'sparkle':
      return (
        <G fill={C.spark}>
          <Path d="M 626 30 Q 632 72 672 78 Q 632 84 626 126 Q 620 84 580 78 Q 620 72 626 30 Z" />
          <Path d="M 690 132 Q 693 150 710 153 Q 693 156 690 174 Q 687 156 670 153 Q 687 150 690 132 Z" />
        </G>
      );
    case 'sweat':
      return (
        <Path
          d="M 92 150 C 74 178, 70 198, 88 206 C 106 212, 118 196, 112 178 C 108 168, 100 158, 92 150 Z"
          fill={C.sweat}
          stroke={edge}
          strokeWidth={7}
        />
      );
    default:
      return null;
  }
}
