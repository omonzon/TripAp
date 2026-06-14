import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import he from './he.json';
import fr from './fr.json';
import de from './de.json';
import es from './es.json';
import ru from './ru.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
      fr: { translation: fr },
      de: { translation: de },
      es: { translation: es },
      ru: { translation: ru },
    },
    lng: 'he',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
