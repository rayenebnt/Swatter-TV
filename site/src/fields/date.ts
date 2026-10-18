import type { DateField } from 'payload'

type DatePickerOptions = NonNullable<NonNullable<DateField['admin']>['date']>

/**
 * Sélecteur de date et d'heure à la française : « 18/10/2026 20:30 », heures sur 24 h
 * (l'administration affiche sinon « Oct 18, 2026 8:30 PM »). Pas de jour de la semaine : la traduction du sélecteur
 * se charge après son premier affichage, qui montrerait « Sun » au lieu de « dim. ».
 */
export const dateTimePicker = (timeIntervals = 15): DatePickerOptions => ({
  pickerAppearance: 'dayAndTime',
  displayFormat: 'dd/MM/yyyy HH:mm',
  timeFormat: 'HH:mm',
  timeIntervals,
})

/** Sélecteur de jour seul : « 18/10/2026 » (enregistré à midi, comme le fait Payload pour ce type de sélecteur). */
export const dayPicker = (): DatePickerOptions => ({
  pickerAppearance: 'dayOnly',
  displayFormat: 'dd/MM/yyyy',
})
