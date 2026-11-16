/**
 * "Other Distress": road damage outside the four classes the detector was
 * trained on (backend/data.yaml). The reporter files it; the rule base never
 * grades it, so it is Unrated until an admin inspects it and records a
 * severity. Mirrors fuzzy_engine.OTHER_LABEL / UNRATED and the CHECK
 * constraints in migration.sql section L; keep the three in step.
 */
export const OTHER_DISTRESS = 'Other Distress';
export const UNRATED = 'Unrated';

export const OTHER_SUBTYPES = [
  'Rutting',
  'Raveling',
  'Depression',
  'Bleeding',
  'Edge break',
  'Patch failure',
  'Something else',
] as const;
export type OtherSubtype = (typeof OTHER_SUBTYPES)[number];

/** One line each, so a reporter can tell them apart without a manual. */
export const OTHER_SUBTYPE_HINT: Record<OtherSubtype, string> = {
  Rutting: 'Grooves pressed along the wheel paths',
  Raveling: 'Surface wearing away into loose stones',
  Depression: 'A sunken area, often holding water',
  Bleeding: 'Shiny, sticky asphalt on the surface',
  'Edge break': 'The pavement edge crumbling away',
  'Patch failure': 'An old repair that is breaking up',
  'Something else': 'Describe it in the note',
};

export const OTHER_NOTE_MAX = 300;

/** The error /check-distress returns when the road passed but no class matched. */
export const NO_DISTRESS_DETECTED = 'no_distress_detected';
