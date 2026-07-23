import type { MessageKey } from './en';

// Hebrew catalog. Typed against the English keys — a missing entry here is a
// COMPILE error. Note on bidi: values that mix Hebrew with Latin/technical
// terms (API, TCX, OpenRouter) rely on the UI's <bdi>/dir handling; keep
// technical identifiers in Latin script.
export const he: Record<MessageKey, string> = {
  // Navigation & shell
  'nav.history': 'היסטוריה',
  'nav.upload': 'העלאה',
  'nav.coach': 'מאמן',
  'nav.plan': 'תוכנית',
  'nav.settings': 'הגדרות',
  'app.switchProfile': '{name} · החלפה',
  'app.switchProfileTitle': 'החלפת פרופיל',

  // Profile gate
  'gate.whosRunning': 'מי רץ היום?',
  'gate.newProfile': '+ פרופיל חדש',
  'gate.hi': 'שלום {name}',
  'gate.enterPin': 'הזינו את קוד ה-PIN',
  'gate.wrongPin': 'קוד שגוי.',
  'gate.unlock': 'כניסה',
  'gate.back': 'חזרה',
  'gate.name': 'שם',
  'gate.pin': 'קוד PIN',
  'gate.optional': '(לא חובה)',
  'gate.pinHint':
    'קוד PIN מקשה על גישה מזדמנת במכשיר משותף. הוא אינו מצפין את הנתונים.',
  'gate.create': 'יצירת פרופיל',
  'gate.cancel': 'ביטול',
  'gate.deleteConfirm':
    'למחוק את הפרופיל "{name}" ואת כל הריצות, התוכניות והצ׳אט שלו? פעולה זו אינה הפיכה.',
  'gate.deleteAria': 'מחיקת הפרופיל {name}',

  // History
  'history.title': 'היסטוריית ריצות',
  'history.empty': 'אין ריצות עדיין.',
  'history.uploadCta': 'העלו קובץ TCX כדי להתחיל.',
  'history.rpe': 'RPE {rpe}',

  // Upload
  'upload.title': 'העלאת ריצה',
  'upload.dropHere': 'גררו לכאן קובץ tcx.',
  'upload.tapToChoose': 'או הקישו לבחירת קובץ שיוצא מהשעון',
  'upload.privacyNote':
    'הניתוח מתבצע כולו בדפדפן — הקובץ לעולם לא עוזב את המכשיר.',
  'upload.notTcx': '"{name}" אינו קובץ tcx.',
  'upload.parseFailed': 'לא ניתן לנתח את {name}: {message}',
  'upload.readFailed': 'שגיאה בלתי צפויה בקריאת {name}.',
  'upload.reviewTitle': 'איך הייתה הריצה?',
  'upload.saveFailed': 'השמירה לאחסון המקומי נכשלה.',
  'upload.discard': 'ביטול ובחירת קובץ אחר',
  'upload.matchQuestion':
    'נראה כמו אימון ה{type} המתוכנן ליום {weekday}: "{description}" — נכון?',
  'upload.matchYes': 'כן, זה האימון',
  'upload.matchNo': 'לא, ריצה לא מתוכננת',

  // Stat labels
  'stat.distance': 'מרחק',
  'stat.time': 'זמן',
  'stat.pace': 'קצב',
  'stat.laps': 'הקפות',
  'stat.avgHr': 'דופק ממוצע',
  'stat.maxHr': 'דופק מרבי',
  'stat.cadence': 'קדנס',
  'stat.power': 'הספק',
  'stat.rpe': 'RPE',

  // Post-run form
  'form.rpeLegend': 'מאמץ (RPE:‏ 1 = קל · 10 = מרבי)',
  'form.feelLegend': 'איך הרגשתם?',
  'form.notes': 'הערות',
  'form.notesPlaceholder': 'כל מה שהמאמן צריך לדעת — מסלול, מזג אוויר, כאבים…',
  'form.saving': 'שומר…',
  'form.save': 'שמירת ריצה',

  // Feel tags
  'feel.fresh': 'רעננות',
  'feel.strong': 'תחושת כוח',
  'feel.tired': 'עייפות',
  'feel.legs-heavy': 'רגליים כבדות',
  'feel.sore': 'כאבי שרירים',
  'feel.slept-poorly': 'שינה גרועה',

  // Run detail
  'run.notFound': 'הריצה לא נמצאה.',
  'run.backToHistory': 'חזרה להיסטוריה',
  'run.back': '→ היסטוריה',
  'run.plannedWorkout': 'אימון מתוכנן',
  'run.notLinked': '— לא מקושר (ריצה לא מתוכננת) —',
  'chart.pace': 'קצב',
  'chart.hr': 'דופק',
  'chart.cadence': 'קדנס',
  'chart.power': 'הספק',
  'table.lap': 'הקפה',
  'table.time': 'זמן',
  'table.pace': 'קצב',
  'table.hr': 'דופק',
  'table.cadence': 'קדנס',
  'table.watts': 'ואט',

  // Chat
  'chat.offline':
    'אין חיבור לרשת — הצ׳אט דורש חיבור. היסטוריית הריצות זמינה גם ללא רשת.',
  'chat.addKeyBefore': 'הוסיפו מפתח API של OpenRouter במסך',
  'chat.addKeyLink': 'הגדרות',
  'chat.addKeyAfter': 'כדי לשוחח עם המאמן.',
  'chat.empty': 'העלו ריצה או שאלו שאלת אימון כדי להתחיל את השיחה.',
  'chat.thinking': 'המאמן חושב…',
  'chat.placeholder': 'שאלו את המאמן…',
  'chat.send': 'שליחה',
  'chat.retry': 'ניסיון חוזר',
  'chat.errInvalidKey':
    'OpenRouter דחה את הבקשה — בדקו את מפתח ה-API בהגדרות.',
  'chat.errRateLimit': 'OpenRouter הגביל את קצב הבקשות. המתינו רגע ונסו שוב.',
  'chat.errNetwork': 'אין חיבור ל-OpenRouter — בדקו את הרשת.',
  'chat.errGeneric': 'משהו השתבש בשיחה עם המאמן.',
  'chat.errEmpty': 'המודל החזיר תשובה ריקה. נסו שוב.',

  // Plan
  'plan.createTitle': 'יצירת תוכנית אימונים',
  'plan.createSubtitle': 'המודל בונה תוכנית שבועית מהיעד ומהריצות האחרונות.',
  'plan.goal': 'יעד',
  'plan.goalPlaceholder': 'למשל: 10 ק״מ מתחת ל-50 דקות',
  'plan.raceDate': 'תאריך המרוץ',
  'plan.currentVolume': '{unit} בשבוע כיום',
  'plan.runsPerWeek': 'ריצות בשבוע',
  'plan.needKey': 'הוסיפו קודם מפתח API של OpenRouter בהגדרות.',
  'plan.errMalformed':
    'המודל לא הצליח להפיק תוכנית תקינה (גם לאחר ניסיון חוזר). נסו שוב, או בחרו מודל תוכניות אחר בהגדרות.',
  'plan.errGeneric': 'יצירת התוכנית נכשלה באופן בלתי צפוי.',
  'plan.generate': 'יצירת תוכנית',
  'plan.generating': 'בונה את התוכנית…',
  'plan.progressThinking': 'המודל חושב',
  'plan.progressWriting': 'כותב את התוכנית',
  'plan.progressRetrying': 'התשובה לא הייתה תקינה — מנסה שוב',
  'plan.progressLine': '{label}… ({chars} תווים)',
  'plan.contacting': 'יוצר קשר עם המודל…',
  'plan.patienceNote':
    'מודלים מסיקים עשויים להימשך כמה דקות — השאירו את המסך פתוח, כי טלפונים משהים לשוניות ברקע. לתוצאה בתוך שניות בחרו מודל מהיר בהגדרות.',
  'plan.header': 'תוכנית של {weeks} שבועות · נוצרה {date}',
  'plan.weekOf': 'שבוע של {date}',
  'plan.archive': 'העברה לארכיון והתחלת תוכנית חדשה',
  'plan.archiveConfirm':
    'להעביר את התוכנית לארכיון ולהתחיל מחדש? התוכנית וההיסטוריה שלה נשמרות, אך היא לא תהיה פעילה יותר.',

  // Workout types & statuses
  'type.easy': 'קלה',
  'type.tempo': 'טמפו',
  'type.intervals': 'אינטרוולים',
  'type.long': 'ארוכה',
  'type.rest': 'מנוחה',
  'type.race': 'מרוץ',
  'status.pending': 'ממתין',
  'status.completed': 'הושלם',
  'status.missed': 'הוחמץ',
  'status.skipped': 'דולג',

  // Settings
  'settings.title': 'הגדרות',
  'settings.preferences': 'העדפות',
  'settings.language': 'שפה',
  'settings.units': 'יחידות מידה',
  'settings.unitsMetric': 'מטרי — קילומטרים, דק׳/ק״מ',
  'settings.unitsImperial': 'אימפריאלי — מיילים, דק׳/מייל',
  'settings.unitsHint':
    'משנה רק את התצוגה. הריצות נשמרות תמיד במטרים, כך שההחלפה לעולם לא משנה את הנתונים או הגיבויים.',
  'settings.weekStart': 'תחילת השבוע',
  'settings.sunday': 'יום ראשון',
  'settings.monday': 'יום שני',
  'settings.weekStartHint': 'משמש לקיבוץ תוכנית האימונים לשבועות.',
  'settings.aiSection': 'מאמן AI‏ (OpenRouter)',
  'settings.apiKey': 'מפתח API',
  'settings.show': 'הצגה',
  'settings.hide': 'הסתרה',
  'settings.apiKeyHint': 'נשמר רק בדפדפן זה. נשלח אך ורק אל openrouter.ai.',
  'settings.chatModel': 'מודל צ׳אט',
  'settings.chatModelHint': 'משמש למשוב האימון לאחר ריצה.',
  'settings.planModel': 'מודל תוכניות',
  'settings.planModelHint':
    'משמש ליצירת תוכניות אימונים. מודלים מסיקים מפיקים את התוכניות הטובות ביותר אך עשויים להימשך כמה דקות — מודלים מהירים מסיימים בשניות ואמינים יותר בנייד.',
  'settings.save': 'שמירת הגדרות',
  'settings.saved': 'ההגדרות נשמרו.',
  'settings.data': 'נתונים',
  'settings.dataDesc':
    'הגיבוי כולל את הריצות, התוכניות, הצ׳אט וההגדרות של הפרופיל הנוכחי (כולל מפתח ה-API) כקובץ JSON.',
  'settings.export': 'ייצוא גיבוי',
  'settings.import': 'ייבוא גיבוי…',
  'settings.importCounts': '{runs} ריצות, {plans} תוכניות, {messages} הודעות צ׳אט',
  'settings.importConfirm':
    'לייבא גיבוי מתאריך {date} ({counts})?\n\nפעולה זו מחליפה את כל הנתונים במכשיר זה.',
  'settings.imported': 'הגיבוי יובא.',
  'settings.importFailed': 'ייבוא הגיבוי נכשל.',
  'settings.storage': 'אחסון',
  'settings.storageLine': 'בשימוש {usage} MB מתוך {quota} MB',
  'settings.protected': 'מוגן מפני מחיקה על ידי הדפדפן',
  'settings.notProtected': 'עדיין לא מוגן מפני מחיקה על ידי הדפדפן',
  'settings.requestPersist': 'בקשת אחסון קבוע',
  'settings.persistGranted': 'אחסון קבוע אושר.',
  'settings.persistDeclined':
    'הדפדפן סירב בינתיים — בדרך כלל הבקשה מאושרת אחרי התקנת האפליקציה או שימוש נוסף.',
  'settings.danger': 'אזור מסוכן',
  'settings.dangerDesc':
    'מחיקה מסירה לצמיתות את הריצות, התוכניות, הצ׳אט וההגדרות של פרופיל זה.',
  'settings.wipe': 'מחיקת כל הנתונים…',
  'settings.wipeExportPrompt':
    'לייצא גיבוי לפני המחיקה? (מומלץ — זו ההזדמנות האחרונה.)',
  'settings.wipeConfirm':
    'למחוק את כל הנתונים של פרופיל זה — ריצות, תוכניות, צ׳אט והגדרות? פעולה זו אינה הפיכה.',
  'settings.wiped': 'כל הנתונים נמחקו.',

  // Model select
  'model.custom': 'מותאם אישית…',
  'model.customHint':
    'כל מזהה מודל מ-openrouter.ai/models עובד דרך ״מותאם אישית״.',
  'model.customAria': '{label} — מזהה מודל מותאם אישית',
};
