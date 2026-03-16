/**
 * LanguageSwitcher — Phase 10: Dynamic UI Language Toggle
 *
 * Shadcn DropdownMenu triggered by a Globe icon + current locale code.
 * Calls i18n.changeLanguage() on selection, which triggers a re-render
 * across all components using the useTranslation() hook.
 */

import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supportedLanguages, type SupportedLocale } from "@/i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLang = (i18n.language?.slice(0, 2) ?? "en") as SupportedLocale;

  const handleLanguageChange = (locale: SupportedLocale) => {
    i18n.changeLanguage(locale);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          data-testid="button-language-switcher"
          className="relative"
        >
          <Globe className="h-4 w-4" />
          <span className="sr-only">{t("locale.label")}</span>
          <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-mono font-bold uppercase leading-none bg-background rounded-sm px-0.5">
            {currentLang}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {supportedLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            data-testid={`locale-${lang.code}`}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm">{lang.flag}</span>
              <span>{t(`locale.${lang.code}`)}</span>
            </span>
            {currentLang === lang.code && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
