import type { MessageKey } from './en';

// Spanish (Mexico) catalog. Typed against the English keys — a missing entry
// here is a COMPILE error. Informal "tú" register throughout, matching the
// coach's own language rule (see prompts.ts SECTION_HEADINGS/LANGUAGE_RULE).
// Unit abbreviations (bpm, spm, W) stay in Latin form, same convention as he.ts.
export const esMX: Record<MessageKey, string> = {
  // Navigation & shell
  'nav.history': 'Historial',
  'nav.upload': 'Subir',
  'nav.coach': 'Entrenador',
  'nav.plan': 'Plan',
  'nav.settings': 'Ajustes',
  'app.switchProfile': '{name} · cambiar',
  'app.switchProfileTitle': 'Cambiar de perfil',

  // Profile gate
  'gate.whosRunning': '¿Quién va a correr?',
  'gate.newProfile': '+ Nuevo perfil',
  'gate.hi': 'Hola {name}',
  'gate.enterPin': 'Ingresa tu PIN',
  'gate.wrongPin': 'PIN incorrecto.',
  'gate.unlock': 'Entrar',
  'gate.back': 'Atrás',
  'gate.name': 'Nombre',
  'gate.pin': 'PIN',
  'gate.optional': '(opcional)',
  'gate.pinHint':
    'Un PIN evita el acceso casual en un dispositivo compartido. No cifra tus datos.',
  'gate.create': 'Crear perfil',
  'gate.cancel': 'Cancelar',
  'gate.deleteConfirm':
    '¿Eliminar el perfil "{name}" y TODAS sus carreras, planes e historial de chat? Esta acción no se puede deshacer.',
  'gate.deleteAria': 'Eliminar el perfil {name}',

  // History
  'history.title': 'Historial de Carreras',
  'history.empty': 'Aún no hay carreras.',
  'history.uploadCta': 'Sube un archivo TCX para empezar.',
  'history.rpe': 'RPE {rpe}',

  // Upload
  'upload.title': 'Subir Carrera',
  'upload.dropHere': 'Suelta aquí un archivo .tcx',
  'upload.tapToChoose': 'o toca para elegir un archivo exportado de tu reloj',
  'upload.privacyNote':
    'El análisis ocurre completamente en tu navegador — el archivo nunca sale de este dispositivo.',
  'upload.notTcx': '"{name}" no es un archivo .tcx.',
  'upload.parseFailed': 'No se pudo analizar {name}: {message}',
  'upload.readFailed': 'Error inesperado al leer {name}.',
  'upload.reviewTitle': '¿Cómo estuvo esta carrera?',
  'upload.saveFailed': 'No se pudo guardar la carrera en el almacenamiento local.',
  'upload.discard': 'Descartar y elegir otro archivo',
  'upload.matchQuestion':
    'Parece tu {type} planeado para el {weekday}: "{description}" — ¿fue este?',
  'upload.matchYes': 'Sí, así fue',
  'upload.matchNo': 'No, carrera no planeada',

  // Stat labels
  'stat.distance': 'Distancia',
  'stat.time': 'Tiempo',
  'stat.pace': 'Ritmo',
  'stat.laps': 'Vueltas',
  'stat.avgHr': 'FC promedio',
  'stat.maxHr': 'FC máxima',
  'stat.cadence': 'Cadencia',
  'stat.power': 'Potencia',
  'stat.ascent': 'Desnivel positivo',
  'stat.rpe': 'RPE',

  // Post-run form
  'form.rpeLegend': 'Esfuerzo (RPE 1 = fácil · 10 = al máximo)',
  'form.feelLegend': '¿Cómo te sentiste?',
  'form.notes': 'Notas',
  'form.notesPlaceholder':
    'Todo lo que el entrenador deba saber — ruta, clima, molestias…',
  'form.saving': 'Guardando…',
  'form.save': 'Guardar carrera',

  // Feel tags (stored values stay English slugs; these are display labels)
  'feel.fresh': 'fresco',
  'feel.strong': 'fuerte',
  'feel.tired': 'cansado',
  'feel.legs-heavy': 'piernas pesadas',
  'feel.sore': 'adolorido',
  'feel.slept-poorly': 'dormí mal',

  // Run detail
  'run.notFound': 'Carrera no encontrada.',
  'run.backToHistory': 'Volver al historial',
  'run.back': '← Historial',
  'run.plannedWorkout': 'Entrenamiento planeado',
  'run.notLinked': '— sin vincular (carrera no planeada) —',
  'chart.pace': 'Ritmo',
  'chart.hr': 'Frecuencia cardíaca',
  'chart.cadence': 'Cadencia',
  'chart.power': 'Potencia',
  'table.lap': 'Vuelta',
  'table.time': 'Tiempo',
  'table.pace': 'Ritmo',
  'table.hr': 'FC',
  'table.cadence': 'Cad',
  'table.watts': 'W',

  // Coach message injected after a run is saved
  'coach.runIntro': 'Acabo de terminar una carrera.',
  'coach.runQuestion': '¿Qué opinas de ella y qué debería hacer después?',
  'coach.plannedNote': 'Este era mi entrenamiento planeado: "{description}"',

  // Manual run entry
  'manual.link': 'o ingresa una carrera manualmente',
  'manual.title': 'Ingresar una Carrera',
  'manual.subtitle':
    'Para una carrera sin archivo — un reloj que no sincronizó, una sesión en caminadora, o una registrada de memoria. Solo se requieren fecha, distancia y tiempo.',
  'manual.date': 'Fecha',
  'manual.distance': 'Distancia ({unit})',
  'manual.duration': 'Tiempo',
  'manual.hours': 'h',
  'manual.minutes': 'm',
  'manual.seconds': 's',
  'manual.pacePreview': 'Ritmo: {pace}',
  'manual.optional': 'Opcional — déjalo en blanco si no lo mediste',
  'manual.avgHr': 'Frecuencia cardíaca promedio (bpm)',
  'manual.maxHr': 'Frecuencia cardíaca máxima (bpm)',
  'manual.cadence': 'Cadencia promedio (spm)',
  'manual.power': 'Potencia promedio (W)',
  'manual.errDistance': 'Ingresa una distancia mayor a cero.',
  'manual.errDuration': 'Ingresa un tiempo mayor a cero.',
  'manual.errDate': 'Elige una fecha que no sea futura.',
  'manual.errHrRange': 'La frecuencia cardíaca debe estar entre 30 y 250 bpm.',
  'manual.errHrOrder':
    'La frecuencia cardíaca máxima no puede ser menor que el promedio.',
  'manual.errCadence': 'La cadencia debe estar entre 0 y 300 spm.',
  'manual.errPower': 'La potencia debe estar entre 0 y 2000 W.',
  'manual.cancel': 'Cancelar',

  // Chat
  'chat.offline':
    'Estás sin conexión — el chat necesita internet. Tu historial de carreras sigue funcionando.',
  'chat.addKeyBefore': 'Agrega tu clave de API de OpenRouter en',
  'chat.addKeyLink': 'Ajustes',
  'chat.addKeyAfter': 'para chatear con el entrenador.',
  'chat.empty':
    'Sube una carrera o haz una pregunta de entrenamiento para iniciar la conversación.',
  'chat.thinking': 'El entrenador está pensando…',
  'chat.placeholder': 'Pregúntale a tu entrenador…',
  'chat.send': 'Enviar',
  'chat.retry': 'Reintentar',
  'chat.errInvalidKey':
    'OpenRouter rechazó la solicitud — revisa tu clave de API en Ajustes.',
  'chat.errRateLimit':
    'OpenRouter limitó la velocidad de solicitudes. Espera un momento e inténtalo de nuevo.',
  'chat.errNetwork': 'No se pudo conectar con OpenRouter — revisa tu conexión.',
  'chat.errGeneric': 'Algo salió mal al hablar con el entrenador.',
  'chat.errEmpty': 'El modelo devolvió una respuesta vacía. Inténtalo de nuevo.',

  // Plan
  'plan.createTitle': 'Crear un Plan de Entrenamiento',
  'plan.createSubtitle':
    'El modelo arma un plan semana a semana según tu objetivo y tus carreras recientes.',
  'plan.goal': 'Objetivo',
  'plan.goalPlaceholder': 'p. ej., 10K en menos de 50 minutos',
  'plan.raceDate': 'Fecha de la carrera',
  'plan.currentVolume': '{unit}/semana actuales',
  'plan.runsPerWeek': 'Carreras por semana',
  'plan.needKey': 'Primero agrega tu clave de API de OpenRouter en Ajustes.',
  'plan.addKeyBefore': 'Agrega tu clave de API de OpenRouter en',
  'plan.addKeyLink': 'Ajustes',
  'plan.addKeyAfter': 'para generar un plan.',
  'plan.errMalformed':
    'El modelo no pudo generar un plan válido (incluso después de reintentar). Inténtalo de nuevo, o elige otro modelo de planes en Ajustes.',
  'plan.errGeneric': 'La generación del plan falló inesperadamente.',
  'plan.generate': 'Generar plan',
  'plan.generating': 'Construyendo tu plan…',
  'plan.progressThinking': 'El modelo está pensando',
  'plan.progressWriting': 'Escribiendo tu plan',
  'plan.progressRetrying': 'La respuesta no tenía el formato correcto — reintentando',
  'plan.progressLine': '{label}… ({chars} caracteres)',
  'plan.contacting': 'Contactando al modelo…',
  'plan.patienceNote':
    'Los modelos de razonamiento pueden tardar varios minutos — mantén esta pantalla abierta, ya que los teléfonos pausan las pestañas en segundo plano. Elige un modelo instructivo en Ajustes para un resultado en segundos.',
  'plan.header': 'Plan de {weeks} semanas · creado el {date}',
  'plan.weekOf': 'Semana del {date}',
  'plan.archive': 'Archivar plan y empezar uno nuevo',
  'plan.archiveConfirm':
    '¿Archivar este plan y empezar de cero? El plan y su historial se conservan en tus datos, pero ya no estará activo.',

  // Workout types & statuses (stored values stay English; display labels here)
  'type.easy': 'fácil',
  'type.tempo': 'tempo',
  'type.intervals': 'intervalos',
  'type.long': 'larga',
  'type.rest': 'descanso',
  'type.race': 'carrera',
  'status.pending': 'pendiente',
  'status.completed': 'completado',
  'status.missed': 'perdido',
  'status.skipped': 'omitido',

  // Settings
  'settings.title': 'Ajustes',
  'settings.preferences': 'Preferencias',
  'settings.language': 'Idioma',
  'settings.units': 'Unidades',
  'settings.unitsMetric': 'Métrico — kilómetros, min/km',
  'settings.unitsImperial': 'Imperial — millas, min/milla',
  'settings.unitsHint':
    'Solo cambia cómo se muestran los valores. Tus carreras siempre se guardan en metros, así que cambiar esto nunca altera tus datos ni tus respaldos.',
  'settings.weekStart': 'La semana comienza el',
  'settings.sunday': 'Domingo',
  'settings.monday': 'Lunes',
  'settings.weekStartHint': 'Se usa para agrupar tu plan de entrenamiento por semanas.',
  'settings.aiSection': 'Entrenador IA (OpenRouter)',
  'settings.apiKey': 'Clave de API',
  'settings.show': 'Mostrar',
  'settings.hide': 'Ocultar',
  'settings.apiKeyHint':
    'Se guarda solo en este navegador. Se envía únicamente a openrouter.ai.',
  'settings.chatModel': 'Modelo de chat',
  'settings.chatModelHint': 'Se usa para el feedback después de cada carrera.',
  'settings.planModel': 'Modelo de planes',
  'settings.planModelHint':
    'Se usa para generar planes de entrenamiento. Los modelos de razonamiento producen los mejores planes pero pueden tardar varios minutos — los modelos instructivos terminan en segundos y son más confiables en el celular.',
  'settings.save': 'Guardar ajustes',
  'settings.saved': 'Ajustes guardados.',
  'settings.data': 'Datos',
  'settings.dataDesc':
    'Los respaldos incluyen las carreras, planes, historial de chat, tenis y ajustes del perfil actual (incluida tu clave de API) como un archivo JSON.',
  'settings.export': 'Exportar respaldo',
  'settings.import': 'Importar respaldo…',
  'settings.importCounts':
    '{runs} carreras, {plans} planes, {messages} mensajes de chat',
  'settings.importConfirm':
    '¿Importar el respaldo del {date} ({counts})?\n\nEsto REEMPLAZA todos los datos actuales en este dispositivo.',
  'settings.imported': 'Respaldo importado.',
  'settings.importFailed': 'No se pudo importar el respaldo.',
  'settings.storage': 'Almacenamiento',
  'settings.storageLine': 'Usando {usage} MB de {quota} MB disponibles',
  'settings.protected': 'protegido contra eliminación por el navegador',
  'settings.notProtected': 'aún no protegido contra eliminación por el navegador',
  'settings.requestPersist': 'Solicitar almacenamiento persistente',
  'settings.persistGranted': 'Almacenamiento persistente concedido.',
  'settings.persistDeclined':
    'El navegador lo rechazó por ahora — normalmente lo concede después de instalar la app o usarla más.',
  'settings.danger': 'Zona de peligro',
  'settings.dangerDesc':
    'Borrar elimina permanentemente las carreras, planes, historial de chat y ajustes de este perfil.',
  'settings.wipe': 'Borrar todos los datos…',
  'settings.wipeExportPrompt':
    '¿Exportar un respaldo antes de borrar? (Recomendado — es tu última oportunidad.)',
  'settings.wipeConfirm':
    '¿Eliminar de verdad TODOS los datos de este perfil — carreras, planes, chat y ajustes? Esta acción no se puede deshacer.',
  'settings.wiped': 'Todos los datos fueron borrados.',

  // About & diagnostics (Sprint 14)
  'settings.about': 'Acerca de',
  'settings.aboutLine': 'v{version} · {sha} · compilado {built}',
  'settings.checkUpdate': 'Buscar actualizaciones',
  'settings.checkingUpdate': 'Buscando…',
  'settings.updateFound': 'Se encontró una nueva versión — mira el aviso de arriba.',
  'settings.upToDate': 'Ya tienes la versión más reciente.',
  'settings.updateCheckFailed': 'No se pudieron buscar actualizaciones.',
  'settings.diagnostics': 'Diagnóstico',
  'settings.diagnosticsDesc':
    'Un registro local de errores y eventos importantes, guardado en este dispositivo para ayudar a resolver problemas. Nunca contiene tu clave de API, mensajes de chat ni notas.',
  'settings.logEntries': '{count} registros guardados',
  'settings.exportLog': 'Exportar registro',
  'settings.clearLog': 'Borrar registro',
  'settings.clearLogConfirm':
    '¿Eliminar todas las entradas de diagnóstico registradas? Esta acción no se puede deshacer.',
  'settings.logCleared': 'Registro borrado.',
  'update.available': 'Hay una nueva versión lista.',
  'update.reload': 'Recargar',

  // Shoe tracking (Sprint 13)
  'shoes.title': 'Tenis',
  'shoes.subtitle':
    'Lleva el control del kilometraje de tus tenis de correr y recibe una alerta antes de que se desgasten.',
  'shoes.empty': 'Aún no hay tenis registrados.',
  'shoes.addNew': '+ Agregar un par',
  'shoes.add': 'Agregar tenis',
  'shoes.name': 'Nombre',
  'shoes.brand': 'Marca',
  'shoes.initialDistance': 'Distancia inicial ({unit})',
  'shoes.retirementDistance': 'Reemplazar después de ({unit})',
  'shoes.progressLine': '{used} de {total} ({percent}%)',
  'shoes.retire': 'Retirar',
  'shoes.unretire': 'Reactivar',
  'shoes.retireConfirm':
    '¿Retirar "{name}"? Ya no se ofrecerán para carreras nuevas, pero su historial se conserva.',
  'shoes.retiredBadge': 'retirados',
  'shoes.warnBadge': 'cerca del límite',
  'shoes.overBadge': 'sobre el límite',
  'shoes.errName': 'Ingresa un nombre para los tenis.',
  'shoes.errThreshold': 'Ingresa una distancia de reemplazo mayor a cero.',
  'shoes.errInitial': 'La distancia inicial no puede ser negativa.',
  'shoes.settingsDesc': 'Lleva el control del kilometraje de tus tenis de correr.',
  'shoes.manage': 'Administrar tenis',
  'form.shoe': 'Tenis usados',
  'form.noShoe': '— sin registrar —',
  'run.shoe': 'Tenis',
  'run.noShoe': '— sin vincular —',

  // Model select
  'model.custom': 'Personalizado…',
  'model.customHint':
    'Cualquier id de modelo de openrouter.ai/models funciona mediante "Personalizado".',
  'model.customAria': '{label} — id de modelo personalizado',
};
