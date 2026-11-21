import { useColorScheme, StyleSheet, type TextStyle } from 'react-native';

// Tokens from docs/design-system.md. apple/Shared/Theme.swift mirrors these values.
const light = {
  bg: '#F4F2EE',
  surface: '#FFFFFF',
  raised: '#FFFFFF',
  surfaceAlt: '#ECE9E3',
  border: '#E3DFD8',
  text: '#151515',
  textMuted: '#6B675F',
  textFaint: '#9C978E',
  accent: '#FF5A1F',
  onAccent: '#151515',
  accentSoft: '#FFE7DC',
  accentText: '#C2410C',
  data: '#3557F0',
  dataSoft: '#E5EAFF',
  success: '#12805A',
  onSuccess: '#FFFFFF',
  successSoft: '#DCF2E8',
  warning: '#A86500',
  warningSoft: '#FBEFD9',
  danger: '#C93636',
  dangerSoft: '#FBE3E3',
  inverse: '#151515',
  onInverse: '#F4F2EE',
  overlay: 'rgba(21, 21, 21, 0.45)',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0E0E0F',
  surface: '#18181A',
  raised: '#2C2C30',
  surfaceAlt: '#232326',
  border: '#2A2A2E',
  text: '#F4F2EE',
  textMuted: '#A39E95',
  textFaint: '#6C6862',
  accent: '#FF6B35',
  onAccent: '#151515',
  accentSoft: '#33190D',
  accentText: '#FF8A5C',
  data: '#8197FF',
  dataSoft: '#1B2142',
  success: '#3DD68C',
  onSuccess: '#0E0E0F',
  successSoft: '#10281C',
  warning: '#F5B544',
  warningSoft: '#33260C',
  danger: '#FF6B6B',
  dangerSoft: '#3A1616',
  inverse: '#F4F2EE',
  onInverse: '#151515',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const palettes = { light, dark };
export type Scheme = keyof typeof palettes;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  display: { fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -1.2, fontVariant: tabular },
  title1: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  title3: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  number: { fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.4, fontVariant: tabular },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40, page: 20, card: 18 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export function useTheme() {
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, c: palettes[scheme] };
}

/** Builds a themed StyleSheet once per color scheme. Call at module scope, use the hook in components. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Palette) => T) {
  const cache = new Map<Scheme, T>();
  return function useStyles() {
    const { scheme, c } = useTheme();
    let styles = cache.get(scheme);
    if (!styles) {
      styles = StyleSheet.create(factory(c));
      cache.set(scheme, styles);
    }
    return styles;
  };
}
