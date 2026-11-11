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
 * Material 3 Dark OLED palette: pure #000000 canvas, #1C1C1E primary surfaces,
 * #2C2C2E raised containers, #FFD60A accent, #38383A hairlines, #FF453A destructive.
 */
export const DarkMessNoteColors: MessyNotePalette = {
  bg: '#000000',
  headerBg: '#1C1C1E',
  surfaceCard: '#1C1C1E',
  surfaceElevated: '#2C2C2E',
  surfaceContainerLow: '#1C1C1E',
  surfaceContainer: '#1C1C1E',
  surfaceContainerHigh: '#2C2C2E',
  surfaceContainerHighest: '#2C2C2E',
  noteBubbleBackground: 'transparent',
  noteBubbleAccent: '#FFD60A',
  onAccent: '#000000',
  primaryContainer: 'rgba(255, 214, 10, 0.16)',
  onPrimaryContainer: '#FFD60A',
  secondaryContainer: '#2C2C2E',
  onSecondaryContainer: '#FFFFFF',
  selectedItemBackground: 'rgba(255, 214, 10, 0.14)',
  destructiveAction: '#FF453A',
  monospaceBg: '#2C2C2E',
  monospaceText: '#FFD60A',
  linkAccent: '#FFD60A',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B5',
  textMuted: '#8E8E93',
  borderSubtle: '#38383A',
  outlineVariant: '#38383A',
};

/**
 * Material 3 light palette parity retaining transparent accent-outlined note bubbles.
 */
export const LightMessNoteColors: MessyNotePalette = {
  bg: '#FAF8F3',
  headerBg: '#F1EDE2',
  surfaceCard: '#F1EDE2',
  surfaceElevated: '#FFFFFF',
  surfaceContainerLow: '#FFFFFF',
  surfaceContainer: '#F4F0E6',
  surfaceContainerHigh: '#EBE5D7',
  surfaceContainerHighest: '#E2DBC9',
  noteBubbleBackground: 'transparent',
  noteBubbleAccent: '#C99600',
  onAccent: '#000000',
  primaryContainer: '#FFEFA8',
  onPrimaryContainer: '#362900',
  secondaryContainer: '#EFE5C4',
  onSecondaryContainer: '#161519',
  selectedItemBackground: 'rgba(201, 150, 0, 0.14)',
  destructiveAction: '#D32F2F',
  monospaceBg: '#EBE5D7',
  monospaceText: '#8A6300',
  linkAccent: '#8A6300',
  textPrimary: '#161519',
  textSecondary: '#4B4954',
  textMuted: '#787683',
  borderSubtle: '#D8D1C0',
  outlineVariant: '#D8D1C0',
};

export const MessNoteMetrics = {
  headerRowHeight: 64,
  headerActionTouchTarget: 48,
  dialogCornerRadius: 28,
  noteCardCornerRadius: 16,
  composerCornerRadius: 28,
  fabCornerRadius: 26,
  fabSize: 52,
  menuCornerRadius: 20,
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

export const MessNoteTypography = {
  displayHeadline: withGoogleSans({
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  }),
  titleLarge: withGoogleSans({
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  }),
  titleMedium: withGoogleSans({
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  }),
  bodyLarge: withGoogleSans({
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    letterSpacing: 0.15,
  }),
  bodyMedium: withGoogleSans({
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400' as const,
    letterSpacing: 0.15,
  }),
  labelLarge: withGoogleSans({
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
    letterSpacing: 0.15,
  }),
  labelMedium: withGoogleSans({
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
    letterSpacing: 0.25,
  }),
} as const;
