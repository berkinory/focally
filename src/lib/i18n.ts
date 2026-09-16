import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";

export { useTranslation } from "react-i18next";

export const resources = { en: { translation: en } };
export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources,
  lng: Intl.DateTimeFormat().resolvedOptions().locale,
  supportedLngs: Object.keys(resources),
  fallbackLng: "en",
  initAsync: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

export function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  const locale = i18n.resolvedLanguage ?? "en";
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = dateFormats.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, formatter);
  }
  return formatter.format(new Date(value));
}
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
) {
  const locale = i18n.resolvedLanguage ?? "en";
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = numberFormats.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, formatter);
  }
  return formatter.format(value);
}
export function formatExposure(value: number) {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  const digits = formatNumber(rounded, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return rounded === 0 ? digits : `${value > 0 ? "+" : "−"}${digits}`;
}
export function nativeMessage(
  code: unknown,
  fallback: keyof typeof en.native = "CAMERA_UNAVAILABLE"
) {
  const key = isNativeMessage(code) ? code : fallback;
  return i18n.t(`native.${key}`);
}

function isNativeMessage(code: unknown): code is keyof typeof en.native {
  return typeof code === "string" && Object.hasOwn(en.native, code);
}

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
