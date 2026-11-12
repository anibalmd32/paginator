export interface Shortcut {
  keys: readonly (readonly string[])[];
  action: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: [['→'], ['←']], action: 'Pasar la página derecha / izquierda' },
  { keys: [['AvPág'], ['Espacio']], action: 'Siguiente en orden de lectura' },
  { keys: [['RePág'], ['Mayús', 'Espacio']], action: 'Anterior en orden de lectura' },
  { keys: [['Inicio'], ['Fin']], action: 'Portada / contraportada' },
  { keys: [['+'], ['−'], ['0']], action: 'Acercar / alejar / restablecer vista' },
  { keys: [['C']], action: 'Alternar vista cenital' },
  { keys: [['D']], action: 'Alternar despiece' },
  { keys: [['R']], action: 'En despiece: girar a la otra cara' },
  { keys: [['G'], ['E']], action: 'Guías / etiquetas' },
  { keys: [['F']], action: 'Pantalla completa' },
  { keys: [['?']], action: 'Mostrar atajos' },
];

export const SHORTCUTS_DESCRIPTION =
  'Flechas izquierda y derecha: pasar la página de ese lado. Avance y retroceso de página o Espacio: siguiente y anterior en orden de lectura. ' +
  'Inicio y Fin: portada y contraportada. Más, menos y cero: acercar, alejar y restablecer la vista. C: vista cenital. D: despiece. ' +
  'R: girar el pliego a la otra cara. G: guías. E: etiquetas. F: pantalla completa. Interrogación: lista de atajos.';
