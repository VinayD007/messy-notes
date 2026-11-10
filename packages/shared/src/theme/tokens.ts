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
 * Material 3 Expressive dark palette featuring stepped obsidian tonal containers
 * paired with warm amber primary & secondary tonal surfaces.
 */
export const DarkMessNoteColors: MessyNotePalette = {
  bg: '#0B0B0F',
  headerBg: '#17171D',
  surfaceCard: '#17171D',
  surfaceElevated: '#21212A',
  surfaceContainerLow: '#121217',
  surfaceContainer: '#17171D',
  surfaceContainerHigh: '#21212A',
  surfaceContainerHighest: '#2B2B36',
  noteBubbleBackground: '#121217',
  noteBubbleAccent: '#FFD60A',
  onAccent: '#1A1400',
  primaryContainer: '#473B00',
  onPrimaryContainer: '#FFE678',
  secondaryContainer: '#2A2616',
  onSecondaryContainer: '#F7E080',
  selectedItemBackground: '#3B3208',
  destructiveAction: '#FF6B66',
  monospaceBg: '#1E1E27',
  monospaceText: '#FFE14D',
  linkAccent: '#FFE14D',
  textPrimary: '#F7F6F9',
  textSecondary: '#C2C1CC',
  textMuted: '#8F8E9B',
  borderSubtle: '#2F2F3B',
  outlineVariant: '#343442',
};

/**
 * Material 3 Expressive light palette featuring warm alabaster tonal surfaces
 * and rich gold primary/tonal containers.
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
  noteBubbleBackground: '#FFFFFF',
  noteBubbleAccent: '#C99600',
  onAccent: '#1A1400',
  primaryContainer: '#FFEFA8',
  onPrimaryContainer: '#362900',
  secondaryContainer: '#EFE5C4',
  onSecondaryContainer: '#3E3100',
  selectedItemBackground: '#FFF1B8',
  destructiveAction: '#C62828',
  monospaceBg: '#F4F0E6',
  monospaceText: '#8A6300',
  linkAccent: '#8A6300',
  textPrimary: '#161519',
  textSecondary: '#4B4954',
  textMuted: '#787683',
  borderSubtle: '#DED8C8',
  outlineVariant: '#D8D1C0',
};

export const MessNoteMetrics = {
  headerRowHeight: 68,
  headerActionTouchTarget: 48,
  dialogCornerRadius: 32,
  noteCardCornerRadius: 24,
  composerCornerRadius: 28,
  fabCornerRadius: 18,
  menuCornerRadius: 16,
  themeRevealDurationMs: 400,
} as const;

export const MessNoteTypography = {
  displayHeadline: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  titleLarge: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.25,
  },
  titleMedium: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  bodyLarge: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400' as const,
    letterSpacing: 0.15,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
    letterSpacing: 0.15,
  },
  labelLarge: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
  },
  labelMedium: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },
} as const;
