import type { Language } from './types'

export const LANGUAGES: readonly Language[] = ['en', 'ar']

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ar'
}

export function dirFor(lang: Language): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'

/** Arabic shows Arabic-Indic digits (٢٠) and the Arabic percent sign; English is untouched. */
export function localizeDigits(text: string, lang: Language): string {
  if (lang !== 'ar') return text
  return text.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)] ?? d).replace(/%/g, '٪')
}

/** Every user-facing string in the app. Keys under `settings` are also `data-i18n` keys. */
export interface Strings {
  settings: {
    windowTitle: string
    tagline: string
    language: string
    sectionTimer: string
    workPeriod: string
    breakLength: string
    skippable: string
    strictBreaks: string
    strictBreaksDesc: string
    sectionOverlay: string
    overlayOpacity: string
    sound: string
    messages: string
    messagesDesc: string
    sectionHint: string
    hintEnabled: string
    hintLead: string
    sectionActivity: string
    idlePause: string
    idlePauseDesc: string
    openAtLogin: string
    saveNote: string
    reset: string
    save: string
    unitMin: string
    unitSec: string
  }
  status: {
    saved: string
    defaultsRestored: string
  }
  overlay: {
    kicker: string
    strict: string
    skippable: string
    holdEsc: (seconds: number) => string
  }
  hint: {
    title: string
    dismiss: string
  }
  tray: {
    nextBreakIn: (time: string) => string
    breakLeft: (time: string) => string
    idle: string
    untilTomorrow: string
    snoozedUntil: (time: string) => string
    breakNow: string
    snooze: string
    pauseUntilTomorrow: string
    resume: string
    settings: string
    quit: string
  }
  /** Short seconds suffix for countdowns ("30s"). */
  secondsSuffix: string
}

export type SettingsStringKey = keyof Strings['settings']

export const STRINGS: Record<Language, Strings> = {
  en: {
    settings: {
      windowTitle: 'twenty — Settings',
      tagline: 'Every 20 minutes, look at something 20 feet away for 20 seconds.',
      language: 'Language',
      sectionTimer: 'Timer',
      workPeriod: 'Work period',
      breakLength: 'Break length',
      skippable: 'Allow skipping breaks with Esc',
      strictBreaks: 'Strict breaks',
      strictBreaksDesc: 'No way to end a break early, not even by holding Esc.',
      sectionOverlay: 'Overlay',
      overlayOpacity: 'Overlay opacity',
      sound: 'Play a soft chime when the break starts',
      messages: 'Messages',
      messagesDesc: 'One per line. A random one is shown on each break.',
      sectionHint: 'Pre-break hint',
      hintEnabled: 'Show a small hint before the break',
      hintLead: 'Show the hint this long before',
      sectionActivity: 'Activity',
      idlePause: 'Pause the timer after inactivity',
      idlePauseDesc: "The work period starts over when you're back.",
      openAtLogin: 'Start twenty when I log in',
      saveNote: 'Saving restarts the current work period.',
      reset: 'Restore defaults',
      save: 'Save',
      unitMin: 'min',
      unitSec: 's',
    },
    status: {
      saved: 'Saved',
      defaultsRestored: 'Defaults restored',
    },
    overlay: {
      kicker: 'Time to rest your eyes',
      strict: "This break can't be skipped",
      skippable: 'Press Esc to skip this break',
      holdEsc: (s) => `Hold Esc for ${s} seconds to end the break in an emergency`,
    },
    hint: {
      title: 'Break soon',
      dismiss: 'Dismiss',
    },
    tray: {
      nextBreakIn: (t) => `Next break in ${t}`,
      breakLeft: (t) => `Break — ${t} left`,
      idle: 'Paused — away from keyboard',
      untilTomorrow: 'Paused until tomorrow',
      snoozedUntil: (t) => `Snoozed until ${t}`,
      breakNow: 'Take a Break Now',
      snooze: 'Snooze for 1 Hour',
      pauseUntilTomorrow: 'Pause Until Tomorrow',
      resume: 'Resume Now',
      settings: 'Settings…',
      quit: 'Quit twenty',
    },
    secondsSuffix: 's',
  },
  ar: {
    settings: {
      windowTitle: 'twenty — الإعدادات',
      tagline: 'كل ٢٠ دقيقة، بُص على حاجة بعيدة عنك ٦ متر لمدة ٢٠ ثانية.',
      language: 'اللغة',
      sectionTimer: 'المؤقت',
      workPeriod: 'مدة الشغل',
      breakLength: 'مدة الاستراحة',
      skippable: 'السماح بتخطي الاستراحة بزرار Esc',
      strictBreaks: 'استراحة إجبارية',
      strictBreaksDesc: 'مفيش أي طريقة تنهي بيها الاستراحة بدري، ولا حتى بالضغط المطوّل على Esc.',
      sectionOverlay: 'شاشة الاستراحة',
      overlayOpacity: 'درجة التعتيم',
      sound: 'شغّل نغمة هادية مع بداية الاستراحة',
      messages: 'الرسائل',
      messagesDesc: 'رسالة في كل سطر. بتظهر واحدة عشوائية في كل استراحة.',
      sectionHint: 'تنبيه قبل الاستراحة',
      hintEnabled: 'اظهر تنبيه صغير قبل الاستراحة',
      hintLead: 'يظهر التنبيه قبل الاستراحة بـ',
      sectionActivity: 'النشاط',
      idlePause: 'وقّف المؤقت لما تبعد عن الجهاز',
      idlePauseDesc: 'مدة الشغل بتبدأ من الأول لما ترجع.',
      openAtLogin: 'شغّل twenty مع تسجيل الدخول',
      saveNote: 'الحفظ بيبدأ مدة الشغل الحالية من الأول.',
      reset: 'استرجاع الافتراضي',
      save: 'حفظ',
      unitMin: 'د',
      unitSec: 'ث',
    },
    status: {
      saved: 'اتحفظ',
      defaultsRestored: 'رجعت الإعدادات الافتراضية',
    },
    overlay: {
      kicker: 'وقت راحة عينك',
      strict: 'الاستراحة دي مينفعش تتخطاها',
      skippable: 'دوس Esc لتخطي الاستراحة',
      holdEsc: (s) =>
        `اضغط مطوّل على Esc لمدة ${localizeDigits(String(s), 'ar')} ثواني لإنهاء الاستراحة في الطوارئ`,
    },
    hint: {
      title: 'الاستراحة قربت',
      dismiss: 'إخفاء',
    },
    tray: {
      nextBreakIn: (t) => `الاستراحة الجاية بعد ${t}`,
      breakLeft: (t) => `استراحة — فاضل ${t}`,
      idle: 'متوقف — إنت بعيد عن الجهاز',
      untilTomorrow: 'متوقف لحد بكرة',
      snoozedUntil: (t) => `متأجل لحد ${t}`,
      breakNow: 'خد استراحة دلوقتي',
      snooze: 'أجّل ساعة',
      pauseUntilTomorrow: 'وقّف لحد بكرة',
      resume: 'كمّل دلوقتي',
      settings: 'الإعدادات…',
      quit: 'اقفل twenty',
    },
    secondsSuffix: 'ث',
  },
}

/** Countdown text: "1:05" past a minute, otherwise "45" + optional seconds suffix. */
export function formatCountdown(totalSeconds: number, lang: Language, withSuffix: boolean): string {
  const total = Math.max(0, totalSeconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  const text =
    m > 0
      ? `${m}:${String(s).padStart(2, '0')}`
      : `${s}${withSuffix ? STRINGS[lang].secondsSuffix : ''}`
  return localizeDigits(text, lang)
}
