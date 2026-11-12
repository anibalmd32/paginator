export const MAGAZINE_NAME = 'Canto';
export const ISSUE_NUMBER = 12;
export const ISSUE_DATE = 'Otoño · Invierno';
export const ISSUE_TAGLINE = 'Revista de oficios gráficos';
export const SAMPLE_MARK = 'EJEMPLO';

export type ArtKind = 'fold' | 'stack' | 'staple' | 'bleed' | 'dots' | 'fibre' | 'blade' | 'street';

export interface Article {
  id: string;
  kicker: string;
  titles: readonly [string, string];
  standfirsts: readonly [string, string];
  author: string;
  quote: string;
  caption: string;
  art: ArtKind;
  paragraphs: readonly string[];
}

export const ARTICLES: readonly Article[] = [
  {
    id: 'imposicion',
    kicker: 'Imposición',
    titles: ['El pliego sabe contar', 'Doblar antes de imprimir'],
    standfirsts: [
      'Antes de que una página se lea, alguien decidió en qué cara de qué hoja iba a caer. Ese cálculo, tan viejo como la imprenta, sigue siendo el que evita repetir una tirada.',
      'Una maqueta de papel doblada a mano enseña en dos minutos lo que ningún programa explica igual de bien: dónde cae cada página.',
    ],
    author: 'Irene Valcárcel',
    quote: 'Una maqueta doblada a mano no se equivoca nunca; el que se equivoca es quien no la hizo.',
    caption: 'Un pliego abierto: la cara lleva la primera y la última página; el retiro, las dos siguientes.',
    art: 'fold',
    paragraphs: [
      'Quien abre una revista grapada por el centro tiene delante dos páginas consecutivas. Quien abre el pliego que salió de máquina, en cambio, encuentra la primera página pegada a la última. No es un capricho: una hoja doblada por la mitad lleva cuatro páginas, dos por cada cara, y solo las del pliego central son vecinas también en el orden de lectura.',
      'Imponer es repartir. Se toma el total de páginas, se divide entre cuatro y se sabe cuántos pliegos entran en máquina. El primero lleva por fuera la contraportada y la portada, y por dentro la segunda página y la penúltima. El siguiente avanza dos números por un extremo y retrocede dos por el otro, y así hasta llegar al centro.',
      'La regla que usan los montadores cabe en una línea: las dos páginas que comparten una cara suman siempre el total más uno. En una revista de veinticuatro, la seis viaja con la diecinueve y la doce con la trece. Si la suma no cuadra, hay una página fuera de sitio y conviene encontrarla antes de filmar las planchas.',
      'Por eso en el taller todavía se hace la maqueta: unas hojas en blanco, dobladas y numeradas a lápiz. Se desmonta, se extiende sobre la mesa y cada hoja dice lo que debe llevar. Es un método sin misterio y sin electricidad, y ha salvado más tiradas que cualquier otro control.',
    ],
  },
  {
    id: 'lomo',
    kicker: 'Papel',
    titles: ['Cuánto mide un lomo', 'El grosor que no se ve'],
    standfirsts: [
      'El calibre de una hoja se mide en centésimas de milímetro, pero multiplicado por todas las hojas de un ejemplar decide si la cubierta ajusta o baila.',
      'Dos papeles del mismo gramaje pueden abultar distinto. La diferencia, hoja a hoja, acaba en el lomo.',
    ],
    author: 'Tomás Ferreiro',
    quote: 'El gramaje dice cuánto pesa un papel; el calibre, cuánto sitio ocupa. Al lomo solo le importa lo segundo.',
    caption: 'La misma tripa en tres papeles: estucado, offset y ahuesado con volumen.',
    art: 'stack',
    paragraphs: [
      'El gramaje es lo primero que se pregunta de un papel y lo que menos ayuda a calcular un lomo. Dice cuánto pesa un metro cuadrado, no cuánto abulta. Un estucado brillante y un offset ahuesado pueden pesar lo mismo y diferenciarse en un tercio de grosor, porque el segundo guarda más aire entre las fibras.',
      'La cuenta, en cambio, es sencilla. Se cuentan las hojas de la tripa, que son la mitad de las páginas, se multiplican por el calibre de una hoja y se suma el de la cubierta, que entra dos veces. Con ese número se dibuja el lomo. Si se dibuja de memoria, el título acaba montado sobre la portada.',
      'En las revistas grapadas no hay lomo que rotular, pero el grosor se nota de otra manera. Los pliegos interiores, empujados por los de fuera, asoman un poco más por el canto delantero. La guillotina los iguala y se lleva consigo unos milímetros de margen: es el desplazamiento, y obliga a meter hacia dentro los folios de las páginas centrales.',
      'La prudencia del oficio manda pedir al almacén una muestra del papel real, medir veinte hojas juntas con el micrómetro y dividir. Los catálogos redondean y las partidas cambian. Una décima de error por hoja son dos milímetros en un ejemplar de cuarenta páginas, lo bastante para que una cubierta bien impresa parezca mal hecha.',
    ],
  },
  {
    id: 'grapa',
    kicker: 'Encuadernación',
    titles: ['Dos grapas y un caballete', 'A caballo'],
    standfirsts: [
      'La encuadernación más humilde es también la más honesta: los pliegos se montan unos sobre otros, como una silla sobre el lomo de un caballo, y dos puntos de alambre hacen el resto.',
      'Se llama a caballo porque los pliegos cabalgan sobre el caballete de la máquina. Entender ese gesto explica casi todos sus límites.',
    ],
    author: 'Marta Oliván',
    quote: 'Una revista grapada se abre plana y enseña el pliego central entero. Ninguna otra encuadernación regala eso.',
    caption: 'Los pliegos se encartan de fuera hacia dentro; la cubierta es el último en montarse.',
    art: 'staple',
    paragraphs: [
      'En la alzadora de grapa los pliegos ya doblados caen abiertos, uno tras otro, sobre una cadena con forma de tejado. Primero el central, después los que lo envuelven y al final la cubierta. Cuando el juego está completo, dos cabezales clavan el alambre por el doblez y lo cierran por dentro. El ejemplar sale montado en menos de un segundo.',
      'El procedimiento impone su aritmética. Cada pliego suma cuatro páginas, de modo que el total debe ser múltiplo de cuatro. Si el contenido se queda en veintidós, sobran dos páginas que alguien tendrá que llenar o dejar en blanco: son las de cortesía, y es mejor decidir dónde van que descubrirlas en el ejemplar terminado.',
      'También tiene un techo. A partir de cierto grosor, que depende del papel pero ronda las sesenta y cuatro páginas, el lomo se redondea, la revista no cierra y las hojas centrales sobresalen demasiado. Entonces conviene pasar al lomo cuadrado, con sus cuadernillos apilados y encolados, que es otra manera de pensar el montaje.',
      'A cambio, la grapa ofrece algo que nadie más da: el pliego central se abre plano y de una sola pieza. Una fotografía a doble página no pierde nada en el lomo. Por eso los diseñadores que conocen el oficio reservan ese sitio para la imagen que más lo merece.',
    ],
  },
  {
    id: 'sangrado',
    kicker: 'Preimpresión',
    titles: ['Tres milímetros de más', 'Lo que se lleva la cuchilla'],
    standfirsts: [
      'Ninguna guillotina corta dos veces por el mismo sitio. El sangrado es la forma educada de admitirlo: se imprime un poco más de la cuenta para que el corte nunca deje un filo blanco.',
      'El sangrado no se ve en el ejemplar terminado, y precisamente por eso es lo primero que se olvida.',
    ],
    author: 'Lucas Barrientos',
    quote: 'El sangrado es un seguro barato: tres milímetros de imagen que nadie verá, a cambio de un borde limpio.',
    caption: 'Línea de corte, sangrado y zona segura: tres cajas concéntricas con tres milímetros entre ellas.',
    art: 'bleed',
    paragraphs: [
      'Una pila de quinientos pliegos no es un bloque rígido. Bajo el pisón de la guillotina las hojas se desplazan unas décimas, y la cuchilla, que baja en diagonal, no entra igual en la primera que en la última. El resultado es una tolerancia de medio milímetro largo que ningún taller serio promete reducir.',
      'Para que esa tolerancia no se vea, todo lo que debe llegar hasta el borde se prolonga tres milímetros más allá de la línea de corte. Un fondo de color, una fotografía, un filete: si tocan el canto, tienen que rebasarlo. Lo que sobra se va al contenedor con el recorte y nadie lo echa de menos.',
      'La misma lógica funciona hacia dentro. Un folio o un pie de foto colocados a dos milímetros del borde quedan a merced del corte. Por eso se dibuja una zona segura, otros tres o cinco milímetros por dentro, de la que el texto no debe salir. Entre una caja y otra queda una franja donde solo puede haber imagen.',
      'Las marcas de corte cierran el sistema. Son ocho trazos finos, dos por esquina, que quedan fuera del sangrado y le dicen al guillotinero dónde termina la página. Sin ellas el archivo es una imagen sin medida; con ellas, y con el sangrado en su sitio, es un documento que se puede imprimir.',
    ],
  },
  {
    id: 'color',
    kicker: 'Color',
    titles: ['Lo que la pantalla no dice', 'Firmar una prueba'],
    standfirsts: [
      'Una pantalla emite luz y un papel la devuelve. Entre una cosa y otra cabe toda la distancia que una buena prueba de color está obligada a recorrer.',
      'La prueba de color es un contrato: lo que se firma en ella es lo que el taller se compromete a igualar en máquina.',
    ],
    author: 'Noelia Santibáñez',
    quote: 'No se firma un color bonito, se firma un color posible: el que esa máquina dará sobre ese papel.',
    caption: 'Cuatro tintas y sus sobreimpresiones: de ahí sale todo lo demás.',
    art: 'dots',
    paragraphs: [
      'El monitor fabrica el color sumando luces roja, verde y azul sobre un fondo negro. La imprenta lo fabrica al revés: resta luz al blanco del papel con cuatro tintas transparentes. Los dos sistemas se parecen lo justo, y hay verdes y naranjas de pantalla que ninguna combinación de cian, magenta y amarillo alcanzará jamás.',
      'La prueba de color existe para adelantar esa mala noticia. Se imprime con un equipo calibrado que simula la máquina y el papel de la tirada, y lleva al pie una tira de control cuyos parches se miden con un espectrofotómetro. Si los valores entran en tolerancia, la prueba es fiable; si no, es solo una impresión agradable.',
      'El papel cuenta tanto como la tinta. Sobre un estucado el punto se queda en la superficie y el color sale limpio y contrastado. Sobre un offset sin estucar la tinta penetra, el punto engorda y las sombras se cierran. Pedir a un papel poroso el negro profundo de un brillante es pedirle lo que no tiene.',
      'Con la prueba firmada, el maquinista tiene una referencia y el cliente, una garantía. En el arranque se comparan los primeros pliegos buenos con ella bajo una luz normalizada, no bajo el fluorescente de la oficina. Es un rito breve y algo solemne, y marca el momento en que el diseño deja de ser un archivo.',
    ],
  },
  {
    id: 'fibra',
    kicker: 'Papel',
    titles: ['La fibra manda', 'A favor del papel'],
    standfirsts: [
      'El papel tiene una dirección, como la madera de la que viene. Doblarlo a favor o en contra es la diferencia entre un lomo limpio y otro que se cuartea.',
      'Rasgar una hoja en los dos sentidos basta para saber hacia dónde corre la fibra. El resto del trabajo es no llevarle la contraria.',
    ],
    author: 'Andrés Miravalles',
    quote: 'El papel siempre dobla mejor por donde quiere. Lo sensato es querer lo mismo que él.',
    caption: 'En la máquina de papel las fibras se alinean con el avance de la banda.',
    art: 'fibre',
    paragraphs: [
      'En la máquina que lo fabrica, el papel es al principio una suspensión de fibras en agua que corre sobre una tela a gran velocidad. Al escurrirse, la mayoría de las fibras queda tendida en el sentido de la marcha. Esa orientación ya no se pierde: la hoja será más rígida en una dirección y más dócil en la otra.',
      'La prueba es inmediata. Una hoja rasgada a favor de fibra se abre en línea casi recta; rasgada en contra, el corte se desvía y deja un borde irregular. Humedecida por una cara, se curva formando un canal paralelo a las fibras. Cualquiera de los dos gestos sirve para marcar la dirección con una flecha a lápiz.',
      'En un impreso que se dobla, la fibra debe correr paralela al lomo. Así las hojas caen con naturalidad, el ejemplar se queda abierto y el doblez no levanta la tinta. Con la fibra atravesada el pliegue se resiste, las páginas se abarquillan con la humedad y en los gramajes altos el estucado se agrieta a lo largo del canto.',
      'Por eso al pedir el papel se indica el formato con la fibra señalada, y dos pliegos de la misma medida pueden no ser intercambiables. Aprovechar un resto cortado en el otro sentido ahorra unas resmas y estropea la tirada entera. En los cartoncillos de cubierta, además, se hiende antes de doblar.',
    ],
  },
  {
    id: 'corte',
    kicker: 'Acabados',
    titles: ['El último corte', 'Tres cortes y a la caja'],
    standfirsts: [
      'Todo lo que se ha impreso, doblado y cosido pasa al final por una cuchilla. Es la operación más rápida del taller y la única que no admite arrepentimiento.',
      'Cabeza, pie y delantera: tres cortes convierten un taco de pliegos en una revista con los cantos a escuadra.',
    ],
    author: 'Begoña Ruipérez',
    quote: 'Se puede repetir una plancha y hasta una tirada corta. Lo que no se puede es devolver al papel lo que ya se cortó.',
    caption: 'La cuchilla baja en diagonal para cortar como una tijera y no como un hacha.',
    art: 'blade',
    paragraphs: [
      'La revista grapada sale de la alzadora con los cantos desiguales: cada pliego asoma un poco más que el que lo envuelve y los dobleces de cabeza siguen cerrados. La trilateral lo resuelve en un solo paso con tres cuchillas, que refilan la delantera, la cabeza y el pie mientras un pisón sujeta el ejemplar contra la mesa.',
      'El orden importa. Primero se corta la delantera, que es la que acumula el desplazamiento de los pliegos interiores, y después la cabeza y el pie a la vez. Lo que se retira por cada lado es justamente el sangrado más un pequeño margen de máquina, de manera que el formato final coincide con la línea de corte del archivo.',
      'Una cuchilla sin filo no corta, aplasta. El canto queda con rebaba, las hojas de abajo salen más largas que las de arriba y el estucado se desportilla en los fondos oscuros. Los talleres cuidadosos llevan la cuenta de los cortes de cada cuchilla y la mandan afilar antes de que el papel avise.',
      'Después del corte ya no queda nada que corregir, solo contar, empaquetar y cargar. Por eso la última comprobación se hace antes: un ejemplar de la primera postura, refilado a mano, medido con la regla y hojeado página por página. Si ese ejemplar está bien, los demás saldrán iguales.',
    ],
  },
  {
    id: 'imprenta',
    kicker: 'Talleres',
    titles: ['La imprenta de la calle Almagre', 'Un taller con escaparate'],
    standfirsts: [
      'Tres generaciones, una minerva que todavía trabaja y un escaparate donde el barrio lee sus propias noticias. Crónica inventada de un taller que podría existir en cualquier ciudad.',
      'Hay imprentas que no salen en ninguna guía y sin las cuales un barrio no sabría anunciar sus fiestas ni despedir a sus muertos.',
    ],
    author: 'Clara Echegoyen',
    quote: 'Aquí se ha impreso el barrio entero: sus bodas, sus rebajas, sus fiestas y sus esquelas.',
    caption: 'La fachada del taller, con el toldo a rayas que da nombre a la esquina.',
    art: 'street',
    paragraphs: [
      'El taller ocupa el bajo de una casa de tres pisos, entre una mercería y un bar que abre a las seis. En el escaparate, sujetos con pinzas a una cuerda, cuelgan los trabajos de la semana: el cartel de las fiestas, el menú de una boda, las papeletas de una rifa. Los vecinos se paran a leerlos como quien lee el periódico.',
      'Dentro huele a tinta y a disolvente. Al fondo, bajo una ventana alta, sigue en marcha la minerva con la que empezó el abuelo, reservada ahora a los relieves y a las tarjetas que piden mimo. Delante, una offset de dos colores y una digital resuelven el día a día: tiradas cortas, plazos de ayer y clientes que entran a preguntar sin cita.',
      'La nieta, que estudió diseño fuera y volvió, ha ordenado los chibaletes y ha puesto nombre a lo que su padre hacía de oído. Hay hojas de ruta, pruebas firmadas y una maqueta de papel para cada encargo con más de ocho páginas. Dice que no ha cambiado nada importante: solo ha dejado por escrito lo que el taller ya sabía.',
    ],
  },
];

export const COVER_LINES: readonly { title: string; note: string }[] = [
  { title: 'El pliego sabe contar', note: 'Imposición sin misterio, con una hoja doblada a mano' },
  { title: 'La imprenta de la calle Almagre', note: 'Tres generaciones y una minerva' },
  { title: 'Tres milímetros de más', note: 'Elogio del sangrado' },
];

export const AD_MILL = {
  name: 'Papelera del Arlanza',
  claim: 'El papel también se lee',
  body: 'Offset, estucados y ahuesados con volumen para libros y revistas. Fibra certificada, calibres constantes y muestras a vuelta de correo.',
  ranges: ['Ribera Offset', 'Almena Estucado', 'Lino Ahuesado'],
  footer: 'Anuncio ficticio · La Papelera del Arlanza no existe',
} as const;

export const AD_WORKSHOP = {
  name: 'Escuela de Oficios del Libro',
  claim: 'Aprende a doblar antes de aprender a maquetar',
  body: 'Talleres de fin de semana de imposición, encuadernación a caballo y preparación de originales. Grupos de ocho personas, plegadera incluida.',
  courses: [
    ['01', 'El pliego y la maqueta', 'Doce horas'],
    ['02', 'Grapa, hendido y corte', 'Ocho horas'],
    ['03', 'Originales para imprenta', 'Doce horas'],
  ],
  footer: 'Anuncio ficticio · Escuela imaginaria',
} as const;

export const GLOSSARY: readonly (readonly [string, string])[] = [
  ['Pliego', 'Hoja que entra en máquina y que, doblada, da varias páginas. En una revista grapada, cada pliego lleva cuatro.'],
  ['Cara y retiro', 'Los dos lados del pliego. La cara queda por fuera al doblar; el retiro, por dentro.'],
  ['Lomo', 'Canto por el que se unen las hojas. En la grapa es un doblez; en la rústica, una superficie que puede rotularse.'],
  ['Sangrado', 'Prolongación de la imagen más allá de la línea de corte, normalmente tres milímetros.'],
  ['Folio', 'Número de página impreso. Va en el margen exterior para encontrarlo al hojear.'],
  ['Cortesía', 'Página en blanco que se deja al principio o al final para completar el pliego.'],
  ['Tripa', 'Conjunto de las hojas interiores, sin la cubierta.'],
  ['Cuadernillo', 'Grupo de pliegos encartados que se cose o encola como una unidad.'],
];

export const CREDITS: readonly (readonly [string, string])[] = [
  ['Dirección', 'Irene Valcárcel'],
  ['Dirección de arte', 'Tomás Ferreiro'],
  ['Redacción', 'Marta Oliván, Lucas Barrientos, Clara Echegoyen'],
  ['Ilustración', 'Estudio Canto'],
  ['Corrección', 'Begoña Ruipérez'],
  ['Producción', 'Andrés Miravalles'],
];

export const COLOPHON_TEXT =
  'Este número de Canto se compuso con tipos de palo seco para los titulares y una romana de lectura para el texto. Se imagina impreso en offset a cuatro tintas sobre papel ahuesado de 115 gramos, con cubierta de 250, y encuadernado con dos grapas a caballo.';

export const COLOPHON_NOTICE =
  'Canto es una revista de ejemplo generada por Paginator. Sus artículos, firmas, anunciantes y direcciones son ficticios y sirven solo para demostrar la verificación de pliegos y el visor.';
