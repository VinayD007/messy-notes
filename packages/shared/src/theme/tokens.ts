export interface MessyNotePalette {
  bg: string;
  headerBg: string;
  surfaceCard: string;
  surfaceElevated: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  noteBubbleBackground: string;
  noteBubbleAccent: string;
  onAccent: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  selectedItemBackground: string;
  destructiveAction: string;
  monospaceBg: string;
  monospaceText: string;
  linkAccent: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderSubtle: string;
  outlineVariant: string;
}

/**
 * Material 3 Expressive Dark palette seeded from Violet (#6750A4):
 * obsidian surface canvas (#0F0D13), tonal containers (#1D1B20 / #2B2930),
 * expressive violet primary (#D0BCFF) & container (#4F378B), crimson destructive (#FF5449).
 */
export const DarkMessNoteColors: MessyNotePalette = {
  bg: '#0F0D13',
  headerBg: '#0F0D13',
  surfaceCard: '#1D1B20',
  surfaceElevated: '#2B2930',
  surfaceContainerLow: '#19171D',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  surfaceContainerHighest: '#36343B',
  noteBubbleBackground: '#1B1822',
  noteBubbleAccent: '#D0BCFF',
  onAccent: '#381E72',
  primaryContainer: '#4F378B',
  onPrimaryContainer: '#EADDFF',
  secondaryContainer: '#4A4458',
  onSecondaryContainer: '#E8DEF8',
  selectedItemBackground: 'rgba(208, 188, 255, 0.2)',
  destructiveAction: '#FF5449',
  monospaceBg: '#2B2930',
  monospaceText: '#EADDFF',
  linkAccent: '#D0BCFF',
  textPrimary: '#F5EFF7',
  textSecondary: '#CAC4D0',
  textMuted: '#938F99',
  borderSubtle: '#49454F',
  outlineVariant: '#49454F',
};

/**
 * Material 3 Expressive Light palette seeded from Violet (#6750A4).
 */
export const LightMessNoteColors: MessyNotePalette = {
  bg: '#FEF7FF',
  headerBg: '#FEF7FF',
  surfaceCard: '#F3EDF7',
  surfaceElevated: '#ECE6F0',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainer: '#F3EDF7',
  surfaceContainerHigh: '#ECE6F0',
  surfaceContainerHighest: '#E6E0E9',
  noteBubbleBackground: '#F7F2FA',
  noteBubbleAccent: '#6750A4',
  onAccent: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  secondaryContainer: '#E8DEF8',
  onSecondaryContainer: '#1D192B',
  selectedItemBackground: 'rgba(103, 80, 164, 0.14)',
  destructiveAction: '#B3261E',
  monospaceBg: '#ECE6F0',
  monospaceText: '#4F378B',
  linkAccent: '#6750A4',
  textPrimary: '#1D1B20',
  textSecondary: '#49454F',
  textMuted: '#79747E',
  borderSubtle: '#CAC4D0',
  outlineVariant: '#CAC4D0',
};

export const MessNoteMotion = {
  // M3 Expressive bouncy spring presets for spatial transforms and tactile touch responses.
  expressiveFast: {
    tension: 360,
    friction: 19,
  },
  expressiveSpatial: {
    tension: 240,
    friction: 18,
  },
  pressScale: 0.96,
} as const;

export const MessNoteMetrics = {
  outerGutter: 16,
  intraSpacing: 8,
  headerRowHeight: 64,
  headerActionTouchTarget: 48,
  dialogCornerRadius: 32,
  heroCornerRadius: 30,
  splitButtonOuterRadius: 28,
  splitButtonInnerRadius: 10,
  noteCardCornerRadius: 24,
  composerCornerRadius: 32,
  fabCornerRadius: 18,
  fabSize: 56,
  menuCornerRadius: 24,
  themeRevealDurationMs: 400,
} as const;

export const MessNoteFontFamily = {
  regular: 'Google Sans',
  mono: 'monospace',
} as const;

const withGoogleSans = <T extends Record<string, unknown>>(style: T) =>
  ({
    fontFamily: MessNoteFontFamily.regular,
    ...style,
  }) as T & { fontFamily: typeof MessNoteFontFamily.regular };

// M3E Emphasized type scale: tighter letter spacing and stronger headline weight contrast.
export const MessNoteTypography = {
  displayHeadline: withGoogleSans({
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700' as const,
    letterSpacing: -0.8,
  }),
  titleLarge: withGoogleSans({
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.45,
  }),
  titleMedium: withGoogleSans({
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.15,
  }),
  bodyLarge: withGoogleSans({
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    letterSpacing: 0,
  }),
  bodyMedium: withGoogleSans({
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
    letterSpacing: 0.05,
  }),
  labelLarge: withGoogleSans({
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700' as const,
    letterSpacing: 0.05,
  }),
  labelMedium: withGoogleSans({
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
  }),
} as const;
