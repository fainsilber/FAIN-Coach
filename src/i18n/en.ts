// English catalog — the SOURCE OF TRUTH for message keys. Every other
// language catalog is typed against these keys, so a missing translation is a
// compile error, not a runtime blank. `{name}`-style placeholders are
// interpolated by t().
export const en = {
  // Navigation & shell
  'nav.history': 'History',
  'nav.upload': 'Upload',
  'nav.coach': 'Coach',
  'nav.plan': 'Plan',
  'nav.settings': 'Settings',
  'app.switchProfile': '{name} · switch',
  'app.switchProfileTitle': 'Switch profile',

  // Profile gate
  'gate.whosRunning': "Who's running?",
  'gate.newProfile': '+ New profile',
  'gate.hi': 'Hi {name}',
  'gate.enterPin': 'Enter your PIN',
  'gate.wrongPin': 'Wrong PIN.',
  'gate.unlock': 'Unlock',
  'gate.back': 'Back',
  'gate.name': 'Name',
  'gate.pin': 'PIN',
  'gate.optional': '(optional)',
  'gate.pinHint':
    'A PIN deters casual access on a shared device. It does not encrypt your data.',
  'gate.create': 'Create profile',
  'gate.cancel': 'Cancel',
  'gate.deleteConfirm':
    'Delete profile "{name}" and ALL of its runs, plans, and chat history? This cannot be undone.',
  'gate.deleteAria': 'Delete profile {name}',

  // History
  'history.title': 'Run History',
  'history.empty': 'No runs yet.',
  'history.uploadCta': 'Upload a TCX file to get started.',
  'history.rpe': 'RPE {rpe}',

  // Upload
  'upload.title': 'Upload Run',
  'upload.dropHere': 'Drop a .tcx file here',
  'upload.tapToChoose': 'or tap to choose a file exported from your watch',
  'upload.privacyNote':
    'Parsing happens entirely in your browser — the file never leaves this device.',
  'upload.notTcx': '"{name}" is not a .tcx file.',
  'upload.parseFailed': 'Could not parse {name}: {message}',
  'upload.readFailed': 'Unexpected error reading {name}.',
  'upload.reviewTitle': 'How was this run?',
  'upload.saveFailed': 'Failed to save the run to local storage.',
  'upload.discard': 'Discard and choose another file',
  'upload.matchQuestion':
    'Looks like your planned {type} for {weekday}: “{description}” — was it?',
  'upload.matchYes': "Yes, that's it",
  'upload.matchNo': 'No, unplanned run',

  // Stat labels
  'stat.distance': 'Distance',
  'stat.time': 'Time',
  'stat.pace': 'Pace',
  'stat.laps': 'Laps',
  'stat.avgHr': 'Avg HR',
  'stat.maxHr': 'Max HR',
  'stat.cadence': 'Cadence',
  'stat.power': 'Power',
  'stat.rpe': 'RPE',

  // Post-run form
  'form.rpeLegend': 'Effort (RPE 1 = easy · 10 = all-out)',
  'form.feelLegend': 'How did it feel?',
  'form.notes': 'Notes',
  'form.notesPlaceholder':
    'Anything the coach should know — route, weather, niggles…',
  'form.saving': 'Saving…',
  'form.save': 'Save run',

  // Feel tags (stored values stay English slugs; these are display labels)
  'feel.fresh': 'fresh',
  'feel.strong': 'strong',
  'feel.tired': 'tired',
  'feel.legs-heavy': 'legs heavy',
  'feel.sore': 'sore',
  'feel.slept-poorly': 'slept poorly',

  // Run detail
  'run.notFound': 'Run not found.',
  'run.backToHistory': 'Back to history',
  'run.back': '← History',
  'run.plannedWorkout': 'Planned workout',
  'run.notLinked': '— not linked (unplanned run) —',
  'chart.pace': 'Pace',
  'chart.hr': 'Heart rate',
  'chart.cadence': 'Cadence',
  'chart.power': 'Power',
  'table.lap': 'Lap',
  'table.time': 'Time',
  'table.pace': 'Pace',
  'table.hr': 'HR',
  'table.cadence': 'Cad',
  'table.watts': 'W',

  // Chat
  'chat.offline':
    "You're offline — chat needs a network connection. Your run history still works.",
  'chat.addKeyBefore': 'Add your OpenRouter API key in',
  'chat.addKeyLink': 'Settings',
  'chat.addKeyAfter': 'to chat with the coach.',
  'chat.empty':
    'Upload a run or ask a training question to start the conversation.',
  'chat.thinking': 'Coach is thinking…',
  'chat.placeholder': 'Ask your coach…',
  'chat.send': 'Send',
  'chat.retry': 'Retry',
  'chat.errInvalidKey':
    'OpenRouter rejected the request — check your API key in Settings.',
  'chat.errRateLimit': 'Rate limited by OpenRouter. Wait a moment and retry.',
  'chat.errNetwork': 'Could not reach OpenRouter — check your connection.',
  'chat.errGeneric': 'Something went wrong talking to the coach.',
  'chat.errEmpty': 'The model returned an empty response. Try again.',

  // Plan
  'plan.createTitle': 'Create a Training Plan',
  'plan.createSubtitle':
    'The model builds a week-by-week plan from your goal and recent runs.',
  'plan.goal': 'Goal',
  'plan.goalPlaceholder': 'e.g. Sub-50 10k',
  'plan.raceDate': 'Race date',
  'plan.currentVolume': 'Current {unit}/week',
  'plan.runsPerWeek': 'Runs per week',
  'plan.needKey': 'Add your OpenRouter API key in Settings first.',
  'plan.errMalformed':
    'The model could not produce a valid plan (even after a retry). Try again, or pick a different plan model in Settings.',
  'plan.errGeneric': 'Plan generation failed unexpectedly.',
  'plan.generate': 'Generate plan',
  'plan.generating': 'Building your plan…',
  'plan.progressThinking': 'Model is thinking',
  'plan.progressWriting': 'Writing your plan',
  'plan.progressRetrying': 'Response was malformed — retrying',
  'plan.progressLine': '{label}… ({chars} characters)',
  'plan.contacting': 'Contacting the model…',
  'plan.patienceNote':
    'Reasoning models can take several minutes — keep this screen open, as phones pause background tabs. Pick an instruct model in Settings for a result in seconds.',
  'plan.header': '{weeks}-week plan · created {date}',
  'plan.weekOf': 'Week of {date}',
  'plan.archive': 'Archive plan & start a new one',
  'plan.archiveConfirm':
    'Archive this plan and start fresh? The plan and its history stay in your data but are no longer active.',

  // Workout types & statuses (stored values stay English; display labels here)
  'type.easy': 'easy',
  'type.tempo': 'tempo',
  'type.intervals': 'intervals',
  'type.long': 'long',
  'type.rest': 'rest',
  'type.race': 'race',
  'status.pending': 'pending',
  'status.completed': 'completed',
  'status.missed': 'missed',
  'status.skipped': 'skipped',

  // Settings
  'settings.title': 'Settings',
  'settings.preferences': 'Preferences',
  'settings.language': 'Language',
  'settings.units': 'Units',
  'settings.unitsMetric': 'Metric — kilometres, min/km',
  'settings.unitsImperial': 'Imperial — miles, min/mile',
  'settings.unitsHint':
    'Changes how values are shown. Your runs are always stored in metres, so switching never alters your data or your backups.',
  'settings.weekStart': 'Week starts on',
  'settings.sunday': 'Sunday',
  'settings.monday': 'Monday',
  'settings.weekStartHint': 'Used to group your training plan into weeks.',
  'settings.aiSection': 'AI Coach (OpenRouter)',
  'settings.apiKey': 'API key',
  'settings.show': 'Show',
  'settings.hide': 'Hide',
  'settings.apiKeyHint': 'Stored only in this browser. Sent only to openrouter.ai.',
  'settings.chatModel': 'Chat model',
  'settings.chatModelHint': 'Used for post-run coaching.',
  'settings.planModel': 'Plan model',
  'settings.planModelHint':
    'Used to generate training plans. Reasoning models produce the best plans but can take several minutes — instruct models finish in seconds and are more reliable on mobile.',
  'settings.save': 'Save settings',
  'settings.saved': 'Settings saved.',
  'settings.data': 'Data',
  'settings.dataDesc':
    "Backups contain the current profile's runs, plans, chat history, and settings (including your API key) as a JSON file.",
  'settings.export': 'Export backup',
  'settings.import': 'Import backup…',
  'settings.importCounts': '{runs} runs, {plans} plans, {messages} chat messages',
  'settings.importConfirm':
    'Import backup from {date} ({counts})?\n\nThis REPLACES all data currently on this device.',
  'settings.imported': 'Backup imported.',
  'settings.importFailed': 'Failed to import backup.',
  'settings.storage': 'Storage',
  'settings.storageLine': 'Using {usage} MB of {quota} MB available',
  'settings.protected': 'protected from browser eviction',
  'settings.notProtected': 'not yet protected from browser eviction',
  'settings.requestPersist': 'Request persistent storage',
  'settings.persistGranted': 'Persistent storage granted.',
  'settings.persistDeclined':
    'The browser declined for now — it usually grants this after the app is installed or used more.',
  'settings.danger': 'Danger zone',
  'settings.dangerDesc':
    "Wipe removes this profile's runs, plans, chat history, and settings permanently.",
  'settings.wipe': 'Wipe all data…',
  'settings.wipeExportPrompt':
    'Export a backup before wiping? (Recommended — this is your last chance.)',
  'settings.wipeConfirm':
    'Really delete ALL data for this profile — runs, plans, chat, and settings? This cannot be undone.',
  'settings.wiped': 'All data wiped.',

  // Model select
  'model.custom': 'Custom…',
  'model.customHint': 'Any model id from openrouter.ai/models works via Custom.',
  'model.customAria': '{label} — custom model id',
};

export type MessageKey = keyof typeof en;
