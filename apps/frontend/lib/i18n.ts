import { useState, useEffect } from 'react';
import tr from '../locales/tr.json';
import en from '../locales/en.json';

const dictionaries: Record<string, any> = { tr, en };

export function useTranslation() {
  const [lang, setLang] = useState<string>('tr');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lang');
      if (saved === 'en' || saved === 'tr') {
        setLang(saved);
      }
    }
  }, []);

  const changeLanguage = (newLang: 'tr' | 'en') => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lang', newLang);
      setLang(newLang);
      window.location.reload();
    }
  };

  const t = (path: string): string => {
    const dict = dictionaries[lang] || tr;
    const value = path.split('.').reduce((obj, key) => obj?.[key], dict);
    return typeof value === 'string' ? value : path;
  };

  return { t, lang, changeLanguage };
}
