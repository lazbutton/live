export const AGENDA_TYPES = [
  { id: "evenement", label: "Événement" },
  { id: "emission", label: "Émission spéciale" },
  { id: "festival", label: "Festival" },
  { id: "benevolat", label: "Bénévolat" },
] as const;

export type AgendaTypeId = (typeof AGENDA_TYPES)[number]["id"];

const ALLOWED = new Set<string>(AGENDA_TYPES.map((item) => item.id));

export function parseAgendaTypes(value: unknown): AgendaTypeId[] {
  if (!Array.isArray(value)) return [];
  const unique: AgendaTypeId[] = [];
  for (const entry of value) {
    const id = String(entry ?? "").trim();
    if (!ALLOWED.has(id)) continue;
    const typed = id as AgendaTypeId;
    if (!unique.includes(typed)) unique.push(typed);
  }
  return unique;
}

export function agendaTypeBadges(types: AgendaTypeId[]) {
  return types.map((id) => {
    const match = AGENDA_TYPES.find((item) => item.id === id);
    return {
      type: id,
      label: match?.label ?? id,
    };
  });
}
