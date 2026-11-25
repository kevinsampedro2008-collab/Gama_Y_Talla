# Panel privado de Gama & Talla · etapas 15A, 15B, 16, 17, 18, 19, 20, 21, 22 y 23

Ingreso con correo y contraseña, tablero del catálogo, **gestión de la disponibilidad de las tallas**
(15B), **administración del catálogo** (16): zapatillas, colores, precios, tallas y fotografías WebP,
y (17) **público obligatorio con Unisex, historial de cambios, exportación a CSV y respaldo
restaurable**.

## Importar desde WhatsApp (18)

El botón **«Importar desde WhatsApp»**, junto a «Agregar zapatilla», prepara varias zapatillas a la
vez a partir de las publicaciones del proveedor. Cada publicación se presenta en este orden:
**«Pega aquí el mensaje de WhatsApp»** (visible y con el foco al abrir), **«Fotos de esta
publicación»**, **«Datos reconocidos»** (editables; lo dudoso lleva «Revisar») y **«Ajustes
adicionales»** (categoría, guía de tallas y cómo mostrar el color). Orden de la ventana (19):
**«Ajustes para varias fichas»** (bloque plegable y compacto), **«Fotos para varias fichas»** y después
las fichas. El bloque de ajustes conserva sus valores y si está abierto o cerrado al añadir publicaciones.

1. Pega el **mensaje** de la publicación. Se lee **en el navegador** (`texto-proveedor.js`): marca
   (lista de marcas conocidas y las del catálogo), modelo, público (Hombre, Dama, Unisex), precio en
   COP (`$115.000`, `115.000`, `115 mil`), tallas EU y, si hay una línea que solo nombra colores, el
   color. Una misma línea puede traerlo todo («Reebok Club C Bulc🔥tallas 40-41-42-43-44 euro $80.000»):
   se toman el precio, las tallas y el teléfono, y el resto de la línea se sigue leyendo (marca, modelo,
   público, color); los emojis pegados a las palabras no estorban. Un teléfono en una línea con datos se
   omite, con su frase de contacto («Escríbeme al…»), sin perder esos datos. **Listas y rangos:**
   «40-41-42-43-44» y «40-42-44» son listas (40-42-44 = 40, 42 y 44); «40 al 44», «40 hasta 44» y
   «40-44» (solo dos tallas) son rangos. Rangos como «40 al 44 Euro» se expanden a 40, 41, 42, 43, 44; las tallas explícitas siguen
   la gramática del editor (40 · 40,5 · 40.5 · 40 1/3). **Una sola talla** se reconoce cuando el texto
   la nombra («Talla 37», «Talla: 40,5») o cuando ocupa sola una línea («37», «40 1/3») y el texto no
   trae otras tallas; si ya trae un rango, esa línea suelta no se añade y la ficha queda «Revisar».
   Los modelos (603, 1080), los precios y los teléfonos nunca se leen como tallas. Teléfonos y texto
   promocional («RECARGA», «Te atiendo por aquí…», emojis, ✅) se omiten: son texto del proveedor. Lo
   que no se reconoce queda vacío y marcado **«Revisar»**.
2. Añade las **fotos originales**: arrástralas sobre la zona de fotos (escritorio) o elígelas desde la
   galería (celular). Se validan y convierten a WebP aquí, con los mismos límites del editor. La
   primera es la **principal** («Hacer principal» la cambia). Cada foto tiene **«Quitar foto»**
   (también mientras se optimiza: no reaparece al terminar). Si quitas la principal, la siguiente
   pasa a serlo y a ser la miniatura del selector; sin fotos se puede añadir otras. Una foto que ya
   se subió en un guardado fallido se borra de Storage al quitarla (o al descartar el lote) si
   ninguna galería la usa; con un guardado sin confirmar no se toca.
3. **«Añadir otra publicación»** crea otra ficha y lleva el foco a su cuadro del mensaje. Cada ficha permite editar marca, modelo, público,
   categoría, guía de tallas y, por color: nombre, tallas, fotos, **precio del proveedor** (solo para
   revisar, no se publica) y **precio de venta** (el que se guarda).
4. **Ajustes para varias fichas** (bloque plegable): se configuran **Público** (Hombre, Dama, Unisex),
   **Categoría**, **Tabla de la guía de tallas** (incluido «Sin indicar») y **Sumar al precio del
   proveedor**, y una sola acción, **«Aplicar ajustes a N fichas»**, los aplica a las fichas elegidas
   en **«Fichas que recibirán los ajustes»** (19): una casilla por ficha editable (número, marca, modelo
   y público), «Elegir todas» y «Quitar selección», con el recuento. Mientras no se elija nada son todas;
   una vez elegidas a mano, las fichas nuevas o separadas no se añaden solas y un aviso junto al bloque
   lo dice (igual al agrupar, quitar o guardar una ficha elegida). Es independiente de «Incluir en el
   guardado» y del reparto de fotos. «Sin cambiar» o un campo vacío conservan lo de cada ficha.
   El importe sumado queda en cada color que lo recibió: una ficha fuera de los destinos no lo hereda
   aunque después se relea su mensaje o cambie su precio del proveedor.
   Los valores se validan antes de tocar ninguna ficha (el error aparece junto a su control). El
   precio de venta = proveedor + importe se calcula siempre desde el del proveedor (aplicarlo dos veces
   no lo acumula); los escritos a mano se conservan; un color sin precio del proveedor queda con su
   precio de venta «Revisar» y lo demás se aplica. El público aplicado cuenta como elegido a mano: al
   releer el mensaje no se pisa. Un resumen dice qué se aplicó y cuántos precios se conservaron o
   quedan pendientes. Se guarda después, con «Guardar lote como oculto». Público y guía son
   independientes.
5. **Agrupar colores**: si dos fichas tienen la misma marca y modelo, la segunda propone «Agrupar como
   color de la ficha N» o «Son zapatillas distintas». «Agrupar con otra ficha» mueve los colores a
   cualquier ficha; «Separar en otra ficha» deshace. Cada color conserva su mensaje, sus fotos, su
   nombre, precio, tallas y forma de mostrarse; lo corregido a mano no se pisa al releer el mensaje.
6. **Coincidencias con el catálogo**: si la marca y el modelo ya existen, se muestran su código, su
   estado y sus colores, con **«Abrir en el editor»** (para añadir el color o revisar una reposición).
   Para crear otra ficha con el mismo modelo hay que marcar «Crear otra ficha con este mismo modelo de
   todas formas».
7. **«Guardar lote como oculto»** valida todo y guarda, una a una, las fichas válidas marcadas con
   códigos automáticos y `fn_admin_guardar_producto` (una transacción por ficha). Las fotos se suben
   al guardar, con la ruta de su ficha y color. El resultado se ve en cada ficha: las guardadas
   ofrecen «Abrir en el editor»; las fallidas conservan sus datos y se reintentan al volver a pulsar
   el botón (las guardadas no se reenvían). Si se pierde una respuesta, se comprueba con el
   identificador de la operación antes de reintentar: nada se duplica.
8. Las tallas nuevas quedan **por revisar**. Publicar y confirmar tallas se hace con las acciones de
   siempre del panel.

**Ventana:** la cabecera y el pie quedan fijos y solo se desplaza el contenido (el editor igual); al
llegar a un extremo, la rueda o el dedo no mueven nada más, y el panel de fondo queda quieto mientras
la ventana está abierta. Al cerrarla vuelven su desplazamiento, su posición y el foco en el botón que
la abrió.

Cerrar con fichas sin guardar ofrece «Cerrar y conservar el lote» (etapa 20: queda guardado como
borrador en este navegador, también si recargas, cierras el navegador o cierras sesión) o «Descartar el
lote» (borra el borrador local; ver «Borradores guardados en este navegador (20)»).

### Lectura del mensaje: público combinado y «todas las tallas» (19)

- Cada dato sale de la línea **completo, con sus conectores**: «DAMA 👸 Y CABALLERO 🤴», «para hombre o
  mujer», «y todas las tallas». Lo que queda es el modelo **tal como lo escribió el proveedor**
  («REEBOK PRINCENSA 💰$105.000 DAMA 👸 Y CABALLERO 🤴 TODAS LAS TALLAS🔥» → modelo PRINCENSA).
- **Público:** se suma lo que dice toda la publicación, también en líneas distintas o separado por
  emojis. Caballero y Dama (u Hombre y Mujer, en cualquier orden) o «Unisex» → **Unisex**.
- **Números de modelo:** sin «talla» ni «euro» delante, una talla empieza entre 30 y 50, así que
  «Air Max 90» o «Club C 85» se quedan en el modelo.
- **«Todas las tallas»** usa la regla del proveedor, centralizada en `REGLAS_PROVEEDOR`
  (`texto-proveedor.js`): Dama → 36 a 39; Hombre/Caballero → 36 a 44; Unisex (o Caballero y Dama) →
  36 a 44. Una nota breve lo indica («Tallas propuestas por «todas las tallas» (Unisex: 36 a 44)»).
  Sin público, no se propone nada y se pide elegirlo; al elegirlo (en la ficha o con «Aplicar todos los
  ajustes») se proponen las tallas de ese público. Si el mensaje trae también tallas numéricas, se usan
  esas y se explica la diferencia. Unas tallas escritas a mano no se tocan. Las tallas siguen naciendo
  **por revisar** al guardar. La regla no cambia la guía de tallas ni el público.
- Una frase de contacto en su propia línea («Dinos y te ayudamos sin falta», «Estamos atentos…») se
  omite como el teléfono; también «Aparta la tuya», «Aprovecha y pídela →» junto al teléfono.
- **Marcas:** además de la lista base (que ahora incluye **On**), se reconocen las del catálogo (también
  las creadas a mano en el panel) y las escritas a mano en otras fichas del lote. Siempre por palabras
  completas y la más larga primero («New Balance» antes que «Balance»). Una marca de una o dos letras
  como ON solo cuenta como primera palabra de la línea («Vans Slip On» es Vans). Si la marca está sola
  en su línea, el modelo es la línea siguiente. «EUR 36 AL 44» se lee como tallas.
- **«Numeración dama»** (o mujer) fija el público Dama y propone 36 a 39; **«Numeración hombre»** (o
  caballero) fija Hombre y propone 36 a 44; las dos en la misma publicación, Unisex y 36 a 44. Admite
  tildes, mayúsculas, emojis y que «Numeración» y el público estén en líneas seguidas. Las palabras están
  en `REGLAS_PROVEEDOR.numeracion` y los rangos son los mismos de «todas las tallas». Unas tallas escritas
  («Numeración dama: 37; 38») mandan: se usan solo esas.
- **Varios precios** («💥$125.000 … DISPONIBLE $115.000»): no se elige ninguno solo. Debajo del precio del
  proveedor aparecen **«Precios del mensaje»** para elegir el del proveedor; hasta entonces queda
  «Revisar». La elección cuenta como corrección a mano (se conserva al volver a leer el mensaje) y el
  precio de venta escrito a mano no cambia. Marca, modelo, público y tallas se leen igual.

### Versiones por público (19)

Dos publicaciones del mismo modelo para públicos distintos (NIKE 7 CAMARAS Dama y Hombre) son **dos
zapatillas independientes**. El modelo se escribe igual en su campo; el título de la ficha añade el
público («Ficha 2 · NIKE 7 CAMARAS · Hombre»), y así también los destinos del reparto de fotos.
- Mismo modelo y **mismo público**: se propone «Agrupar como color de la ficha N» o «Son zapatillas
  distintas». «Agrupar con otra ficha» solo ofrece fichas del mismo público.
- Mismo modelo y **público distinto**: un aviso informativo («Versión para Hombre de …; la ficha 1 es la
  versión para Dama») y se guardan por separado, sin pedir ninguna decisión.
- **Falta el público** en una de las dos: se pide elegirlo antes de decidir.
- **Catálogo:** si el modelo ya existe para el mismo público (o sin público), se pide decidir como
  antes; si solo existe para otro público, se informa («Se creará una zapatilla independiente para
  Dama») y se puede guardar sin marcar nada. La lista muestra el público de cada zapatilla existente.

### Asignar fotos por lote (19)

Arriba del importador, **«Fotos para varias fichas» → «Asignar fotos por lote»** permite elegir
varias imágenes a la vez y repartirlas como **fotos principales** de los colores que aún no tienen
fotos, en este orden: fichas en pantalla y, dentro de cada una, sus colores. Solo cuentan las fichas
editables marcadas con «Incluir en el guardado»; un color con fotos (también una que se está
optimizando) se salta. Si no queda ningún color sin foto, se dice y no se abre el selector.

Antes de aplicar se muestra **«Revisa el reparto»**: miniatura, nombre del archivo y destino (ficha,
modelo y color) de cada imagen. El orden de la lista es el que se usa: «Subir»/«Bajar» (teclado y
celular) u «Ordenar por nombre de archivo». «Cambiar destino» fija a mano el destino de una imagen
(«Volver al orden» lo deshace). Se avisa de los colores que quedarán sin foto y de las imágenes sin
destino. Las imágenes se optimizan de una en una con la validación y la conversión a WebP de siempre
(límites por archivo; una foto por color); una que falla **conserva su destino** y se puede
**reemplazar** o quitar, y las siguientes no se corren. Los destinos usan el identificador de cada
color: agrupar o separar fichas durante la revisión no los cambia. **«Asignar fotos»** aplica todo de
una vez (lo asignado sale de la revisión: pulsar dos veces no duplica nada); lo que falló o sobra se
queda para revisarlo. Las fotos van al borrador: se suben con «Guardar lote como oculto», y «Quitar
foto» y «Hacer principal» siguen funcionando. La revisión admite hasta 60 imágenes a la vez.

#### Elegir el orden con las fotos (22)

El selector de archivos del dispositivo puede entregar las imágenes en un orden distinto al de los clics y
no se puede recuperar ese historial. Por eso, en **«Revisa el reparto»**, **«Elegir orden con las
fotos»** deja elegirlo dentro del panel («El selector del dispositivo puede cambiar el orden. Aquí puedes
elegirlo antes de asignar»):

- **Galería:** miniaturas grandes (cuadrícula que baja a 2 columnas en celular; sin desplazamiento
  horizontal). Pulsar una foto la añade al final de la selección y muestra su número (1, 2, 3…). Pulsar
  otra vez la quita y renumera las siguientes. Cada miniatura es un botón de dos estados (`aria-pressed`),
  con su nombre, su «Recibida n.º k» y su posición si está elegida: funciona con clic, toque y teclado
  (Espacio e Intro), y el repintado conserva el foco y el clic.
- **Controles:** «Deshacer última selección», «Reiniciar orden», «Confirmar este orden (N)», «Usar el
  orden recibido» y «Cancelar». Las imágenes que no se eligen no se asignan.
- **Secuencia elegida:** antes de confirmar se ve cada foto con su destino (ficha, modelo y color) y los
  avisos de siempre: colores que quedarán sin foto, imágenes que sobran y cuántas quedaron sin elegir.
- **Confirmar** pone las elegidas al principio de la lista, en ese orden, y deja las demás al final
  como **«Sin elegir: no se asigna»**; «Incluir al final» las suma después.
- **Orden recibido y orden actual:** el *orden recibido* es el de llegada de los archivos (el número
  «Recibida n.º k», estable); el *orden actual* es el de la lista, que cambia al elegir, con «Subir»/«Bajar»
  o con «Ordenar por nombre». **«Usar el orden recibido»** recupera el de llegada de las imágenes que
  siguen en el reparto, las incluye todas (quita «sin elegir») y las asigna sin pulsar una por una. No
  cambia las claves, los archivos, las fotos optimizadas ni los destinos manuales, y no reincorpora las
  imágenes quitadas o ya asignadas. En borradores anteriores, sin número de recepción, cada imagen recibe
  el suyo en el orden en que está. «Subir», «Bajar», «Cambiar
  destino» y «Ordenar por nombre de archivo» siguen siendo acciones expresas (las «sin elegir» no se
  mezclan con las demás).
- **Identificadores estables:** cada imagen se identifica por su clave (`r1`, `r2`…), nunca por el nombre
  del archivo: dos imágenes con el mismo nombre se distinguen por su «Recibida n.º». Terminar de
  optimizar una imagen (o reemplazarla) no cambia el orden ni la selección.
- **Reglas que no cambian:** los destinos fijados a mano se conservan (también dentro de la secuencia
  elegida), se saltan los colores que ya tienen fotos (incluidas las que se están optimizando) y se
  avisa de lo que sobra o falta.
- **Guardado:** la selección en curso (`reparto.orden.elegidas`, con las claves en orden), las
  imágenes «sin elegir» y el número de recepción van en el borrador local y en su respaldo. Los
  borradores anteriores se leen igual (sin selección; las imágenes reciben su número en el orden en que
  están).

### Pegar varias publicaciones (20)

Arriba del importador, en **«Publicaciones del proveedor»**, el botón **«Pegar varias publicaciones»**
abre un cuadro donde se pegan muchos mensajes juntos (copiados del chat, con o sin la fecha y el nombre).
La entrada de siempre, un mensaje por ficha, sigue igual.

1. **«Revisar la separación»** propone dónde empieza cada publicación (`separar-publicaciones.js`):
   - el **encabezado** de un mensaje de WhatsApp («[22/11/26, 10:15] Nombre: …», «22/11/26, 10:15 -
     Nombre: …», «[10:15 a. m., 22/11/2026] Nombre: …»): el encabezado no pasa al texto;
   - una **línea separadora** de signos («-----», «=====», «*****»);
   - una línea que **empieza por una marca** cuando la publicación en curso ya trae un precio. Las líneas
     sin datos justo encima («🔥NUEVO INGRESO🔥», «RECARGA») van con la nueva; el teléfono o la frase de
     contacto del final se quedan con la anterior.
   **Una línea en blanco sola nunca separa**: los saltos internos se conservan. «<Multimedia omitido>»,
   «imagen omitida», «Se eliminó este mensaje» y «<Se editó este mensaje.>» no pasan al texto.
2. La vista previa muestra cada publicación con su texto tal cual, lo que se lee (marca, modelo,
   precio, tallas, público) y la casilla **«Crear esta publicación»**. Las **divisiones dudosas** se
   señalan con su motivo (una marca justo debajo de otros datos; un fragmento sin precio ni marca, que
   puede ser la continuación del anterior) y no se crean solas si no traen datos. Se corrige con
   **«Unir con la anterior»**, **«Separar…»** (eligiendo la línea con la que empieza la siguiente) o
   «La división está bien». Un fragmento vacío (solo una foto o un aviso de WhatsApp) no se crea.
3. **«Crear N publicaciones»** añade una ficha por publicación marcada **al final del lote**, sin tocar
   las que ya había (la ficha inicial se aprovecha solo si está completamente vacía). Cada una se lee con
   el perfil del lote y conserva su **texto original** («Ver el texto original pegado», con encabezados).
   Nada se agrupa solo ni se escribe en Supabase: después se usan como siempre el lector, «Agrupar», los
   ajustes y el reparto de fotos, y se guarda con «Guardar lote como oculto». Pulsar dos veces no crea
   nada más. Hasta 120 publicaciones de una vez.

### Varios colores en una publicación: «(N colores)» (20)

Si el mensaje dice cuántos colores tendrá la zapatilla —**«(2 colores)»** en cualquier parte de una línea
o **«3 colores»** sola en su línea, con mayúsculas o espacios—, el lector lo toma como **dato de
preparación**: no pasa al modelo, ni a las tallas, ni al precio. Sin cantidad, todo sigue igual (un
color). La expresión se reconoce aunque su valor no sirva («(-2 colores)», «(2.5 colores)», «(2,5
colores)», «(1000 colores)»): sale siempre del texto que se lee y el mensaje original no cambia. Un
valor negativo, cero, con decimales, por encima del límite real del catálogo (20 colores por zapatilla,
el mismo `LIM.colores` del editor) o dos cantidades distintas en el mismo mensaje quedan **«Revisar»**
con el valor tal como llegó: nunca se redondea ni se cambia por otro, y no se ofrece preparar colores
hasta corregirlo.

- **Pegar varias publicaciones:** la revisión muestra **«Colores a preparar»** en cada publicación (se
  puede corregir antes de crear) y el resumen distingue publicaciones, fichas y colores («5 publicaciones
  detectadas · se crearán 5 fichas con 9 colores»). «Crear N publicaciones» crea una ficha por
  publicación con sus colores. Una cantidad no válida se señala y se crea con 1 color.
- **Una sola ficha:** **«Cantidad de colores»** (junto al público) muestra cuántos tiene la ficha y
  cuántos se piden; **«Añadir N colores»** prepara solo los que faltan (pulsar dos veces o volver a leer
  el mensaje no añade más). Pedir menos **no quita nada**: para retirar un color, «Separar en otra ficha»
  y quitar esa ficha, como siempre. La cantidad escrita a mano manda sobre la del mensaje.
- **Colores preparados:** marca, modelo, público y categoría son de la ficha. Cada color nuevo propone
  las tallas y el precio del proveedor de la publicación (y los sigue al releerla mientras no se corrijan
  a mano); su nombre queda vacío y «Revisar». «Color 1», «Color 2»… son solo encabezados: el nombre real
  se escribe y es el que se guarda. Cada color tiene sus fotos (no se copia ninguna), principal, círculo o
  foto, tono y tallas. «Asignar fotos por lote» los recorre en su orden y salta los que ya tienen foto.
- Si el mensaje no trae modelo (p. ej. solo «HUGO BOSS»), queda «Revisar»: no se inventa. Los enlaces
  (wa.link, wa.me, URL) se omiten como el teléfono.
- La preparación se guarda en el borrador y en sus respaldos.

### Categorías: selector común (20)

Todas las categorías del panel usan el mismo selector desplegable (`categorias.js`): editor de zapatillas,
fichas del importador, «Ajustes para varias fichas» y categoría habitual del perfil. Ofrece **URBANAS,
RUNNING y CASUALES** y las categorías que ya existen en el catálogo, sin duplicados por mayúsculas o
espacios (la tienda no fija categorías propias: sus filtros salen del catálogo). **«Otra categoría…»**
abre un campo para escribir una nueva (se guarda en mayúsculas). La opción inicial depende del uso:
**«Selecciona una categoría»** (zapatilla o ficha: sigue siendo obligatoria), **«Sin cambiar»** (ajustes
en bloque: cada ficha conserva la suya) y **«Sin categoría predeterminada»** (perfil). Esas etiquetas y
«Otra categoría…» nunca se guardan. Abrir una zapatilla antigua no cambia su categoría: su valor aparece
entre las opciones tal cual. Elegirla a mano sigue mandando sobre el perfil y la relectura del mensaje.
Teclado: Intro abre, las flechas eligen, Escape cierra el menú (no la ventana); con ratón o tacto,
elegir lo cierra. Sin `<select>` (la CSP del panel lo impide en WebKit).

### Perfiles de proveedor (20)

**«Perfil del proveedor»** (plegable, bajo «Pegar varias publicaciones») elige el perfil con el que se
leen las publicaciones nuevas del lote y permite **crear, editar y eliminar** perfiles. El **Perfil
general** es el comportamiento de siempre (`REGLAS_PROVEEDOR`) y no se puede modificar.

Cada perfil guarda reglas **declarativas**, una por línea (nada de fórmulas ni código: cada expresión se
compara como palabras completas, sin tildes ni mayúsculas; los signos se toman literalmente):
- **Alias de marcas** `alias = marca` («NB = NEW BALANCE»). Gana la coincidencia más larga y un alias de
  una o dos letras solo cuenta al principio de la línea (las protecciones de ON, Vans Slip On, Air Max 90
  y Club C 85 se mantienen).
- **Expresiones de público** `expresión = dama | hombre | unisex` («chicas = dama»), además de las generales.
- **Palabras de «numeración»** `palabra = público` («niña = dama» → «numeración niña»).
- **Tallas por público** para «todas las tallas» y «numeración» (desde–hasta, tallas EU enteras, como mucho
  16 tallas). Vacío = el del Perfil general (Dama 36–39, Hombre 36–44, Unisex 36–44). Son convenciones
  del proveedor, no límites del catálogo.
- **Categoría habitual** (opcional): se propone en las fichas nuevas y nunca sustituye una escrita a mano
  (ni la de «Aplicar ajustes»).
- **Frases promocionales** que se omiten (no pasan a la ficha).

**Prioridad:** corrección a mano > dato explícito del mensaje (tallas numéricas, público escrito) > regla
del perfil > valor del Perfil general. Sin información suficiente, el dato queda «Revisar».

**Lo ya leído no cambia en silencio.** Cada ficha guarda una copia del perfil (y de su versión) con la
que se leyó; cambiar el perfil del lote o editarlo solo afecta a las publicaciones nuevas. Si hay fichas
leídas con otro perfil o con una versión anterior, aparece **«Volver a leer N fichas con «…»»**: es la
única forma de releerlas y conserva lo corregido a mano. Eliminar un perfil no cambia los borradores ni
las fichas que lo usaron (el lote lo muestra como «(eliminado)» y conserva sus reglas). Las fichas que
aún no tienen mensaje toman el perfil del lote.

**«Recordar para este proveedor»** aparece en «Datos reconocidos» cuando una corrección a mano puede ser
una regla: el alias de una marca que el lector no reconoció («Se guardará: «ZX» = ADIDAS»), una categoría
habitual, el rango de tallas corregido en un color con «todas las tallas»/«numeración», o la expresión de
público (se escribe tal como aparece en el mensaje y se ve la regla antes de guardarla). **Solo se guarda
al pulsar «Recordar»**; «No recordar» la oculta para esa ficha. Se añade al perfil de la ficha (o al del
lote si la ficha se leyó con el general) y sirve para las publicaciones nuevas. Nunca se corrige la
ortografía de un modelo ni se convierte cada edición en regla. Los precios no forman parte del perfil: se
conservan el ajuste actual y la elección entre varios precios del mensaje.

### Borradores guardados en este navegador (20)

El importador se **guarda solo, como borrador, en este navegador** (IndexedDB, `borradores.js`): textos
pegados y su separación, mensajes originales, fichas, colores, agrupaciones y orden, datos reconocidos y
correcciones a mano (con la marca de lo escrito a mano), precios, público, categoría, guía y tallas,
**fotografías** (pendientes de subir, su orden y la principal), el reparto de fotos sin confirmar, cómo
se muestra cada color, los ajustes y selecciones, el perfil y sus reglas, el estado de revisión y los
identificadores y resultados de los guardados en Supabase. La cabecera dice **«Guardando…»**, **«Guardado
en este navegador · hora»** o el error.

- **Cuándo se escribe:** tras una pausa al editar (y como mucho cada pocos segundos mientras se escribe),
  al añadir fotos (el original, para recuperarlo aunque se recargue mientras se optimiza), antes de cada
  escritura en Supabase y al ocultar o cerrar la pestaña. Las fotos se guardan **una sola vez** (como
  bytes); teclear no las vuelve a escribir. Las fichas ya guardadas en Supabase no guardan sus fotos aquí.
- **Qué no se guarda:** contraseñas, tokens de sesión ni claves. Nada de esto se envía a Supabase:
  allí solo llega lo que guarda «Guardar lote como oculto».
- **Separación:** por proyecto de Supabase (URL) y UUID del administrador. Al cerrar sesión el lote se
  guarda y deja de mostrarse; solo vuelve al entrar con el mismo usuario en el mismo proyecto.
- **Al abrir el importador:** si hay borradores con trabajo pendiente, se elige **«Continuar»**,
  **«Empezar un lote nuevo»** (el anterior se conserva) o **«Eliminar»** (con confirmación). Cada uno se
  identifica por proveedor, número de publicaciones, guardadas en Supabase, trabajo pendiente y fecha.
  El botón **«Borradores»** de la cabecera abre la misma lista en cualquier momento.
- **Nada se borra solo**: ni por antigüedad, ni al cerrar el importador, recargar, cerrar el navegador o
  cerrar sesión. Un lote cuyas fichas ya están todas en Supabase se conserva en la lista hasta eliminarlo.
  Eliminar un borrador **no borra nada de Supabase ni de Storage** (los archivos sobrantes siguen el flujo
  de «Archivos sin usar»). «Descartar el lote», con el lote abierto, borra su borrador y, como antes,
  solo limpia de Storage los archivos que subió este lote y ninguna galería usa (limpieza verificada).
- **Espacio:** no hay una cuota fija. La lista muestra la estimación del propio navegador. Si falta
  espacio, el trabajo abierto sigue en pantalla, la cabecera lo dice y ofrece **«Exportar respaldo»**
  (desde lo abierto) y la lista de borradores para liberar espacio; nada se borra para hacer sitio y el
  borrador anterior queda intacto (cada guardado es una transacción completa o no ocurre).
- **Guardados interrumpidos:** antes de subir fotos se guardan sus nombres de archivo, y antes de
  `fn_admin_guardar_producto` su operación. Al recuperar, una ficha que estaba «Guardando…» vuelve
  **«sin confirmar»** (o «fallida» si no llegó a enviarse); al volver a guardar se **comprueba primero**
  (solo lectura) con su operación: si ya se guardó no se reenvía, y si no, se reintenta con la misma
  operación. Las fotos que estaban subiendo se vuelven a subir con el mismo nombre y, si ya estaban, se
  comprueba y no se duplican. Las fichas ya guardadas no se reenvían.
- **Dos pestañas:** cada borrador lo edita una sola pestaña. Si otra lo continúa, la primera intenta
  guardar lo suyo, se detiene y lo dice («Este borrador continúa en otra pestaña») con **«Continuar
  aquí»** (trae la última versión guardada). Solo afirma que sus últimos cambios se guardaron si de
  verdad se guardaron; si no, dice que no están en el borrador y ofrece **«Exportar lo de esta
  pestaña»**, y la pestaña que lo toma avisa de que la otra no lo confirmó. Nada se mezcla: un guardado de
  una pestaña que ya no lo tiene se rechaza.
- **Cambiar de lote sin perder nada:** «Empezar otro lote» y «Continuar» otro borrador solo sueltan el
  lote abierto si su guardado local se confirmó; si falla (p. ej. sin espacio), el lote sigue abierto y se
  explica. Al cerrar sesión con el guardado fallido, el lote queda retenido en memoria y vuelve al entrar
  con el mismo usuario y proyecto.
- **Qué cuenta como trabajo:** cualquier dato escrito o elegido a mano, aunque aún no haya mensaje ni
  modelo (marca, categoría, público, guía, cantidad de colores, nombre, precios, tallas, tono, forma o
  fotos de un color), los colores preparados y los ajustes del lote. La lista lo desglosa («Pendiente: 2
  fichas sin guardar, ajustes del lote»).
- **Respaldo:** «Exportar respaldo» descarga un `.json` (formato `gama-talla/borrador-importador`,
  versión 1) con los datos y las fotos. **«Importar un respaldo»** valida el formato, la versión y la
  firma de cada foto: si algo falla no se escribe nada. Con el mismo identificador que un borrador
  existente pregunta antes de sustituirlo. De otro proyecto o usuario solo se importa como borrador
  nuevo, sin sus guardados (lo guardado allí se trata como pendiente aquí).
- **Ojo:** los borradores viven solo en este navegador y con este usuario. Borrar los datos del
  navegador (o usar una ventana privada) los elimina: exporta un respaldo para conservarlos o
  llevarlos a otro equipo.

### Importar catálogo PDF (21)

**«Importar catálogo PDF»**, junto a «Pegar varias publicaciones», convierte los catálogos PDF del
proveedor en fichas del lote. Todo se lee **en este navegador** (`admin/catalogo-pdf.js` con PDF.js):
revisar documentos no escribe en Supabase ni cambia productos del catálogo. Solo **«Añadir al lote»**
crea fichas, que se guardan como siempre con «Guardar lote como oculto».

**Documentos y papel.** Se eligen uno o varios PDF y cada uno recibe un papel, corregible:
- **Descripciones, fotografías y precios de venta sugeridos** («Novedades»): descripción y foto de cada
  tarjeta, y el precio del recuadro bajo la descripción como **venta sugerida**.
- **Precios del proveedor** («Precios»): el **coste**, con su condición.
- **Descripciones y fotografías** (el catálogo sin precios): complementario.

El papel se propone por el **contenido** (tarjetas con importe destacado → venta; solo importes →
proveedor; sin importes → descripciones). El nombre del archivo solo desempata y el orden de selección no
cuenta. Cada papel corresponde a un solo documento. Si falta alguno se trabaja con lo que hay y se dice
qué queda pendiente (coste, venta sugerida o descripciones). El documento principal de la revisión es
el de venta; sin él, el de descripciones; sin ninguno, el de precios.

**Tarjetas.** Una tarjeta es un recuadro dibujado con **una** foto dentro.
- **Texto:** el que cae dentro del recuadro; nunca se mezcla con columnas, filas ni productos vecinos.
  Lo que va sobre la foto («NUEVO») es un adorno.
- **Fuera de las tarjetas:** la portada (un recuadro con varias fotos), las cabeceras, los números de
  página y la despedida. Cada documento dice qué páginas no tienen tarjetas y por qué.
- **Se conserva** la página, la posición, el texto original y el documento de procedencia de cada una.
- **La foto** es la imagen **original embebida** (sus píxeles, sin la etiqueta de precio ni la página).
  Se guarda en WebP (o JPEG) de alta calidad y, al añadirla, `fotos.js` la optimiza como cualquier otra.
- **Sin recuadros:** si la página no los trae, se reconstruye la tarjeta con la foto y el texto de
  debajo, y se marca para revisar.
- **PDF escaneado:** si las páginas son imágenes completas sin texto, se explica que no se pueden
  reconstruir las tarjetas con seguridad.

**Relación entre documentos: por la foto.**
- **Huellas:** cada foto tiene una huella exacta (SHA-256 de sus píxeles) y otra gris de 16×16. Los
  identificadores internos del PDF y el orden no cuentan: el cruce funciona aunque cambie el orden de
  páginas o productos.
- **Solo la exacta se usa sola:** los mismos píxeles en una única tarjeta del otro documento, y en ninguna
  otra tarjeta principal. Es lo único que aporta coste, descripción u otros datos sin preguntar. La tarjeta
  que se usa es la que el resultado señala como `elegida` (la de la huella exacta), nunca «la primera de
  la lista»: una foto distinta con la misma huella gris puede ir antes, y cambiar el orden de las
  candidatas no cambia el resultado. Dos tarjetas con la misma foto exacta siguen siendo ambiguas.
- **La aproximada es una propuesta:** la huella gris también reconoce una foto recodificada, pero dos fotos
  distintas pueden dar la misma (rojo puro y un verde medio tienen el mismo gris). Una candidata solo por
  la huella gris queda **«Revisar»**, con las dos fotos lado a lado para compararlas, **«Sí, es la misma»** y
  **«No corresponde»**. Hasta decidir, de esa tarjeta no se usa nada: ni el coste ni la descripción, tampoco
  al añadir al lote. La decisión se guarda con la tarjeta (repintar, recargar, borrador y respaldo) y se
  puede cambiar. Es independiente de la confirmación de fechas distintas.
- **Varias tarjetas posibles** (la misma foto repetida): queda **«Revisar»** con sus fotos y textos para
  elegir una o ninguna. Nunca se asigna un precio sin una correspondencia segura.
- **Sin correspondencia:** se dice, y sus datos quedan pendientes. Las tarjetas de otros documentos sin
  pareja se listan aparte.
- **Fechas distintas:** si los documentos son de fechas distintas (leídas de la portada), sus precios no
  se usan hasta confirmar que son la misma edición.

**Calzado, otros artículos y dudosos.** Se clasifica la **descripción**; los precios se enlazan después.
Una tarjeta de precios que solo trae un importe nunca se descarta por no decir tallas.
- **Señales de calzado:** EU, EUR o Euro con numeración, «Tallas» con números, «Numeración», «TODAS LAS
  TALLAS» y palabras de calzado.
- **Señales de otros artículos:** camiseta, conjunto, talla única, tallas S/M/L/XL, gafas, reloj, consola…
- **La marca nunca decide:** una camiseta Nike es ropa y un reloj Boss es un reloj. Tampoco «Euro» sin
  tallas.
- **Vistas:** **Calzado**, **Excluidos** (otros artículos, que no se añaden por omisión), **Dudosos**
  (señales contradictorias o ninguna, varias correspondencias, sin correspondencia, otra fecha, varios
  importes o incompatibles) y **Todas**. La clasificación se corrige a mano por tarjeta.

En los catálogos reales del 23-11-2026 se leen 78 tarjetas y 78 fotos en cada versión, que se cruzan
78 a 78 por huella exacta. 57 son de calzado (41 con EU/Euro y 16 con «TODAS LAS TALLAS») y 21 son otros
artículos.

**Precios: tres datos separados.**
- **Precio del proveedor** (coste): solo para revisar, nunca se publica ni pasa a descripciones o
  imágenes. Cada importe conserva su condición. En «PRECIO $95.000 / DISPONIBLE POR CAJA $85.000» se ven
  los dos, el segundo como condicionado. Ninguno se elige solo (ni el menor): queda «Revisar» y se elige
  en la ficha, donde cada opción muestra su condición.
- **Venta sugerida** del PDF, con las notas del documento («Precios sujetos a disponibilidad de tallas»).
- **Precio de venta elegido**: el único que se guarda en el catálogo. En la revisión se elige:
  - **Adoptar el sugerido tal cual.** Cuenta como escrito a mano: no se le suma ningún ajuste, y volver
    a leer el texto, cambiar el perfil, «Aplicar ajustes» o recuperar el borrador no lo cambian.
  - **Calcularlo después** con «Ajustes para varias fichas» (proveedor + importe). La ficha ofrece
    «Usar el precio sugerido».

Ejemplos comprobados: Nike Winflo 12 tiene un coste de 95.000 y una venta sugerida de 134.900; Hugo Boss
de la página 12, de 125.000 y 174.900. Nunca se inventa un importe que el PDF no trae.

**Datos de la ficha.** Se reutilizan el lector y los perfiles de la etapa 20.
- **Equivalencias explícitas y acotadas en el título:**
  - Como primera palabra: «AD» = ADIDAS, «NB» = NEW BALANCE, «BOSS» = HUGO BOSS.
  - En cualquier posición: «HOM», «HOMBRE», «CABALLERO» = Hombre, «DAMA», «MUJER» = Dama y
    «NIÑ@», «NIÑO», «NIÑA», «INFANTIL», «KIDS» = infantil.
- **Se retiran del modelo** el prefijo «NUEVO» y el público. El color también, cuando la estructura es
  clara (MODELO PÚBLICO COLOR, solo con nombres de color). Ante la duda, el texto queda en el modelo.
- **«HUGO BOSS» sola** deja el modelo **pendiente**: varios modelos distintos se titulan así y nunca se
  agrupan solos.
- **Tallas:** las explícitas mandan sobre la regla del perfil («Dama EU 36 AL 40» da 36 a 40, no 36 a 39).
  «TODAS LAS TALLAS» usa la regla del perfil según el público.
- **«NUEVO», «DISPONIBLE» y la fecha** no confirman tallas ni renuevan vigencias: las tallas nacen «por
  revisar», como siempre.
- **Calzado infantil** (EU 28 a 35): se conserva con toda su información y no se añade por omisión. Se
  explica que el catálogo actual solo tiene públicos Hombre, Dama y Unisex y tallas EU 30–50. Si se
  añade, sus tallas 28–35 quedan tal cual y la ficha no se guarda hasta decidir; nunca se convierte en
  calzado de adulto en silencio.
- **El lector común** ya no toma la condición de un precio («POR CAJA», «X MAYOR») como modelo. Vale
  también para WhatsApp.

**Asociaciones** (por tarjeta): **«Otra zapatilla»** (por omisión), **«Otro color de la misma
zapatilla que la tarjeta N»** (otro color con su foto, tallas y precios) y **«Otra fotografía del mismo
color que la tarjeta N»** (la foto va a la galería de ese color). Se propone la tarjeta anterior
incluida. Un destino inexistente, no marcado o circular se explica antes de añadir. Los contadores
separan tarjetas, fichas, colores y fotografías.

**Añadir al lote.** Solo crea lo marcado y no añadido aún: un segundo clic o un reintento no duplica
nada. Cada color guarda su procedencia (documentos, página y tarjeta), el texto original y el texto
preparado para el lector. Después siguen disponibles los ajustes para varias fichas, categorías, fotos,
círculo o miniatura, correcciones y «Guardar lote como oculto», con sus comprobaciones de guardados
parciales y respuestas perdidas.

**Borrador y respaldo.** Se guarda todo lo de la importación: los documentos (sin el PDF), las tarjetas,
las fotos (una sola vez por huella aunque esté en los tres documentos), las elecciones, los precios y las
asociaciones.
- **Imágenes de trabajo:** las fotos extraídas del PDF se guardan con una clase propia, «pdf», distinta de
  las fotos finales. Son WebP o, si el navegador no genera WebP, JPEG, y pueden pesar hasta 15 MB
  (`BYTES_PDF_MAX` en `borradores.js`).
- **Al importar un respaldo** se comprueba la firma real de cada imagen y su tamaño. Las fotos finales
  siguen exigiendo WebP de hasta 1 MiB, y los originales, JPEG, PNG o WebP de hasta 15 MB.
- **Compatibilidad:** los respaldos anteriores, sin la clase «pdf», se siguen importando igual. Un panel
  anterior a esta corrección no lee un respaldo que contenga imágenes de clase «pdf». Se recupera tras recargar desde «Continuar» y viaja en «Exportar respaldo». Un PDF ya leído
se reconoce por su contenido (SHA-256) y no se vuelve a leer. **«Cerrar la importación»** descarta la
revisión pendiente y conserva las fichas añadidas.

**Avance y cancelación.** Se lee página a página, cediendo el hilo entre páginas, con el avance de la
tanda a la vista («documento 2 de 3: página 5 de 22»). Ninguna página queda renderizada: se usan su texto,
sus trazados y la foto embebida, y cada página se libera al terminar. **«Cancelar la lectura»** detiene la
tanda: lo ya leído se conserva y el documento en curso no se añade.

**Límites:** hasta 3 PDF por importación (uno por papel), de 40 MB y 120 páginas cada uno, 60 imágenes por
página, 400 tarjetas por documento (y 400 fichas por lote) y fotos de hasta 25 megapíxeles. Esta entrega
se basa en el formato de los catálogos del proveedor: recuadros, foto JPEG y texto con fuentes estándar.

**Dependencia:** `admin/vendor/pdfjs-dist-6.4.299/` contiene PDF.js 6.4.299 (Apache-2.0) fijado y sin
modificar: `pdf.min.mjs`, su worker, la licencia y un LEEME con la integridad npm y el SHA-256 de cada
archivo.
- **Carga:** se pide con `import()` solo al leer el primer PDF.
- **Opciones:** sin evaluar código, sin fuentes del sistema, sin descargas extra, e imágenes decodificadas
  por PDF.js (los mismos píxeles en cualquier navegador).
- **CSP:** se añadió `worker-src 'self'`.
- **Build:** el paquete la copia y comprueba que esté.
- **Sin servicios externos:** ninguna IA ni clave de API.

### Novedades y diferencias: reconocer el inventario (23)

Al leer un catálogo PDF (o con **«Comparar con mi inventario»**, también para publicaciones de WhatsApp con
fotos) aparece **«Novedades y diferencias»**: compara cada entrada con tu catálogo **antes de escribir**.
Archivos: `inventario.js` (lógica, sin pantalla ni red), `novedades.js` (pantalla y guardado) y los almacenes
nuevos de `borradores.js`. Sin tablas ni migraciones en Supabase.

**Cada entrada se resuelve** como: *Crear otra zapatilla* · *Añadir un color a una zapatilla existente* ·
*Actualizar un color existente* · *Añadir otra fotografía a un color existente* · *Omitir esta entrada*. Se ven
juntos la foto y los datos de la entrega y, del destino, la foto, el modelo, el color, el código y su estado.

- **Proveedor de la entrega:** con un perfil es el del **perfil** (su identificador, aunque cambien sus reglas o
  su nombre). El **Perfil general no tiene proveedor**: se elige uno o se crea; sin proveedor no se usa la
  memoria. Lo recordado de un proveedor no se usa con otro.
- **Qué se reconoce solo:** únicamente una fotografía **idéntica** a una relación que confirmaste, del mismo
  proveedor, con un solo destino vigente. El destino se busca por los **UUID** del producto y del color y se
  muestran sus datos **actuales** (nombres y colores corregidos después).
- **Identidad de la foto:** se toma **antes** de optimizarla. En un PDF, el SHA-256 de sus píxeles; en una
  publicación de WhatsApp, el SHA-256 del archivo recibido. Nunca se compara con el WebP de Storage.
- **Qué queda para revisión** (nada se elige solo): foto parecida; varias relaciones posibles; datos
  contradictorios (otro modelo o público que al confirmarla: Hombre, Dama y Unisex no se mezclan solos); una zapatilla
  cuyo **público cambió** desde que se confirmó la relación, diga lo que diga la entrega; color
  desactivado; zapatilla retirada (además, no se puede elegir) o que ya no existe; el mismo modelo sin foto
  reconocida (la marca, el modelo y la referencia del proveedor no identifican un color). Lo reconocido o dudoso
  **no se añade al lote como ficha nueva** salvo que lo decidas.
- **Catálogo anterior a esta etapa:** se elige qué es la entrada y se **busca** la zapatilla y el color (código,
  referencia, marca, modelo o color); no se crea otra vez.
- **«Confirmar y recordar esta relación»** la guarda en la memoria; **«Usar solo esta vez»** no. Un color o una
  zapatilla que todavía no existe queda como **relación pendiente** hasta que su creación se confirma (en el lote:
  **«Recordar las fotos de las zapatillas nuevas del lote»** o el enlace de cada publicación).

- **Una confirmación vale en su contexto:** proveedor, destino, público de la zapatilla y de la entrega, y fotos de
  origen. Si algo de eso cambia, lo confirmado y los cambios elegidos **dejan de estar aprobados**. Con otro proveedor
  manda su propia memoria. Si no dice nada, el destino anterior queda propuesto y se confirma otra vez. Lo escrito se
  conserva como **«Cambios por revisar»**, con «Usar estos cambios aquí» o «Descartarlos». Al volver al contexto original,
  lo aprobado allí vuelve a valer. Las relaciones de ningún proveedor se borran. También son de su proveedor las fechas
  aceptadas y las relaciones pendientes de fichas nuevas.
- **Lo ya enviado no cambia de proveedor:** una operación en curso, sin confirmar o aplicada conserva el suyo; se
  comprueba y se reintenta con su identificador y se anota en su memoria.
- **Nombres y colores corregidos:** la relación sigue por los UUID; no son una contradicción.

**Diferencias y filtros:** Nuevas zapatillas, Nuevos colores, Cambios de precio, Cambios de tallas, Nuevas
fotografías, Sin cambios, Por reconocer o revisar y Omitidas (una entrada puede estar en varios). Los contadores
distinguen tarjetas o publicaciones, zapatillas y colores. Cada diferencia dice el valor actual o último conocido,
el propuesto, su documento y fecha, qué se modificaría y qué se conserva. **Nada viene seleccionado** salvo la
foto o el color que se pidió añadir.

- **Precios:** coste del proveedor, venta sugerida y precio del catálogo van separados. Un cambio de coste **no**
  cambia el precio; se conserva salvo elección expresa (venta sugerida, coste + ajuste del lote u otro). Varios
  importes o uno condicionado piden elegir el coste; nunca se toma el menor. Sin dato previo: «Sin historial».
- **Tallas**, tres cosas distintas:
  - **Anunciadas** frente a la última entrega revisada que traía tallas: lo que se deja de mencionar o se vuelve a mencionar
    cuenta como cambio de tallas («Esta entrega ya no menciona 42 y 43. Se conservan en el catálogo; no se desactivó
    nada»). **«Marcar como revisada»** lo anota solo en la memoria local, y la misma información no vuelve a salir.
    Tampoco la de un mensaje sin fecha, o anterior a la referencia, igual a lo último que se revisó.
  - **Nuevas** que se podrían añadir al catálogo (nacen «por revisar»; hay que elegirlas).
  - **No mencionadas** y desactivadas: se conservan. Una zapatilla que no aparece no se da por agotada.
  - Una entrega **sin tallas** no es una lista vacía: no se compara y no reemplaza a las últimas anunciadas.
- **Fechas:** un documento **anterior** al último revisado del proveedor se avisa y no pasa a ser lo más reciente;
  una fecha desconocida también. Para aplicar cambios de ellos hay que marcar la casilla. La fecha de un mensaje de
  WhatsApp sale de su encabezado, si lo trae.
- **«Dar por revisadas sin cambios»** anota lo visto en el historial local, sin escribir en el catálogo.

**«Aplicar cambios seleccionados»** actualiza zapatillas existentes; lo nuevo se sigue guardando, oculto, con
«Guardar lote como oculto» (la sección dice cuántas se crean y cuántas se actualizan).

- **Una operación por zapatilla:** lee el registro completo y su versión (lo mismo que el editor) y aplica solo lo
  elegido de **todas** sus entradas; códigos, referencias, propiedades, colores, galerías y tallas no elegidos se
  reenvían igual (con `activa_original`). No cambia si está publicada u oculta. Un **color nuevo** de una zapatilla
  publicada se crea **desactivado** salvo que elijas que se vea.
- **Nada idéntico se envía:** sin cambios reales no hay RPC ni subida de fotos.
- **Conflictos:** si la versión ya no es la que se revisó (o el servidor lo rechaza) no se escribe; se carga lo
  actual y se vuelve a revisar.
- **Guardado previo obligatorio:** antes de subir una foto quedan en el borrador local su archivo y su nombre, y antes de
  enviar, la operación completa con su identificador. Si ese guardado falla (o el navegador no permite guardar), **no se
  sube ni se envía nada**. Lo preparado sigue abierto, se avisa de que se perdería al recargar y se ofrecen
  «Reintentar» (los mismos nombres y la misma operación) y «Exportar respaldo». Sin almacenamiento se puede comparar y
  preparar; «Reintentar» comprueba si ya se puede guardar.
- **Lo mismo al crear zapatillas nuevas («Guardar lote como oculto»):** antes de subir una fotografía se comprueba que
  el borrador (con sus archivos y los nombres de destino) quedó guardado, y antes de llamar a `fn_admin_guardar_producto`,
  que quedaron guardados el cuerpo completo y el identificador de la operación. Esperar el guardado no basta: se mira
  su resultado. Si falla, ese paso no se hace, la ficha queda con el aviso «No se creó nada…» o «No se envió la ficha…»
  (lo que no se guardó se perdería al recargar) y se ofrecen **«Reintentar»** (solo esa ficha) y **«Exportar
  respaldo»** (también en la cabecera si el navegador no permite guardar). El lote sigue abierto y editable, pero no se
  sube ni se crea nada hasta que el borrador se guarde. Si falla con varias fichas, se detiene en la primera: la
  anterior queda creada y las siguientes, sin intentar.
  - El reintento usa el mismo producto, colores, tallas, nombres de archivo y operación: las fotos que ya llegaron a
    Storage se reutilizan sin subirlas otra vez.
  - Si el envío anterior había quedado sin confirmar, sigue «sin confirmar» (se comprueba con su operación antes de repetirlo).
  - Un fallo local **posterior** a una creación confirmada no la convierte en otra alta: el lote avisa de que el borrador
    no se pudo actualizar y, si se recarga, la ficha se comprueba con su operación y no se duplica. Si falla la memoria de
    asociaciones, solo se reintenta la memoria.
- **Respuesta perdida, recarga o fallo parcial:** la operación queda en el borrador antes de enviarse. Se comprueba
  por `ultima_operacion` y, si hubo otra edición después, por el historial del servidor (`historial.lote`). Si no
  llegó, «Reintentar» envía la **misma** operación y el mismo cuerpo. Las fotos conservan su nombre de archivo. Solo
  se anuncia lo confirmado.
- **Memoria local que falla tras guardar:** se dice qué queda pendiente (va en el borrador) y **«Reintentar guardar
  en la memoria»** no repite la escritura del catálogo.

**Memoria de reconocimiento** (al final de la sección): consultar, buscar, **Corregir** (otro color), **Olvidar**
(no cambia el catálogo), **Exportar** e **Importar** (archivo `gama-talla/memoria-inventario`, versión 1: relaciones
e historial, sin fotos; aparte del respaldo de borradores, que no cambia de formato).

- **Dónde está:** IndexedDB de este navegador (base `gama-talla-panel`, versión 2: se **añaden** `proveedores`,
  `asociaciones` e `historial`; lo anterior no se toca). Separada por proyecto, usuario y proveedor. Se conservan
  los últimos 20 registros de historial por color.
- **Límites:** no viaja sola entre navegadores ni equipos (se exporta) y se pierde si se borran los datos del
  navegador. Las huellas de un PDF son de los píxeles que descodifica ese navegador: en otro podrían no ser
  idénticas y la foto quedaría como parecida, por confirmar. Una pestaña con una versión anterior del panel debe
  recargarse para volver a guardar.
- **De otro proyecto o usuario:** las relaciones entran **«por vincular»** (sin UUID) y el historial no se importa.
  Un borrador de otro proyecto o usuario llega sin destinos, operaciones ni relaciones pendientes.

### Publicar u ocultar desde la tarjeta del modelo (22)

En la fila de cada modelo del tablero, entre **«Editar»** y **«Seleccionar tallas»**, hay un botón que
publica u oculta **el modelo completo** (no un color) sin abrir el editor y sin confirmaciones
adicionales:

- **Qué muestra:** **«Publicar»** si el modelo está oculto y **«Ocultar»** si está publicado. Sale del
  estado de publicación del producto (`activo`), no del de sus tallas. Un modelo **retirado** no lleva el
  botón: ni se publica ni se restaura por accidente (se restaura desde «Editar»).
- **Cómo escribe:** solo con `fn_admin_estado_producto`, la misma vía del editor: permiso de
  administrador, control de versión (la que cargó el tablero), identificador de operación y las
  validaciones de publicar (público, y un mismo color visible con foto y talla activa). No hay otra
  escritura, no completa datos ni activa tallas o colores para poder publicar.
- **Publicar y ocultar no tocan la disponibilidad:** conservan colores, fotos, tallas, precios e
  historial; no marcan tallas como agotadas ni renuevan o confirman vigencias.
- **Mientras se procesa** el botón dice «Publicando…» u «Ocultando…» y el resto del tablero queda
  ocupado: un segundo clic (o doble clic) no envía nada más.
- **El resultado está junto al modelo** (un aviso dentro de su tarjeta, con «Cerrar aviso») y se anuncia
  también en una región accesible (`role="status"`), sin avisos fijos arriba ni cambios de foco que
  provoquen saltos. El estado y el texto del botón cambian solo cuando el servidor confirmó. Se conservan
  la posición, la búsqueda, el filtro y la selección de tallas; el foco sigue en el botón.
- **Si falta algo para publicar**, la tarjeta dice qué («Para publicarla falta: …»), el modelo sigue
  oculto y no cambia nada.
- **Si el modelo deja de verse por el filtro activo**, se queda en un lugar cercano y el aviso aparece
  junto al modelo vecino («… ya no aparece con el filtro «…»; te dejamos junto a «…»»).
- **Conflicto de versión:** si otra edición se guardó antes, no se cambia nada, se carga el estado actual
  y se puede volver a pulsar.
- **Respuesta perdida:** antes de permitir un reintento se lee el producto y se compara su
  `ultima_operacion` con la de ESTA operación. Que el estado actual coincida con el deseado no basta
  para anunciar el éxito. Si no se puede confirmar, el aviso ofrece **«Comprobar otra vez»** y
  **«Reintentar»** (la misma operación: si ya se aplicó, el servidor no la repite) y el botón principal
  queda deshabilitado hasta resolverlo. Si el producto cambió por otra operación, se carga su estado real y
  no se anuncia éxito.
- **Sesión vencida o permiso perdido:** se comprueban antes de escribir y al recibir el error, con el
  mismo tratamiento que el resto del tablero.
- **Celular:** hasta 479 px, «Editar» y «Publicar» comparten fila y «Seleccionar tallas» ocupa la
  siguiente, a todo el ancho (áreas táctiles de al menos 44 px); sin desbordes.

## Cómo mostrar cada color (18)

En el editor y en el importador, cada color tiene **«Cómo mostrar este color»**, con vista previa:

- **Círculo de color**: muestra el **tono del círculo**: un recuadro que abre el selector de color
  del navegador, el hexadecimal (#E8DCC8) y la vista previa. Elegir con el recuadro escribe el
  hexadecimal; escribir uno válido actualiza el recuadro. Mientras escribes no se marca error; al
  salir del campo se avisa si está incompleto y «e8dcc8» se normaliza a «#E8DCC8». **«Usar color
  automático»** deja el tono vacío (la tienda usa su paleta para nombres simples o un círculo
  neutro). Un color en automático se abre y se guarda en automático: el gris inicial del recuadro
  nunca se guarda por sí solo.
- **Foto de la zapatilla**: la miniatura es la foto principal del color; si cambias la principal,
  cambia la miniatura. No se sube nada nuevo. El tono se conserva (plegado) por si vuelves al círculo.

En «Ver detalles» se pueden mezclar círculos y miniaturas. Un color en «foto» que se queda sin fotos
se muestra con su círculo; el editor y el tablero lo avisan. Se guarda **por color** en Supabase
(`variantes.forma_muestra`, migración `20261117010000_forma_muestra_color.sql`); los registros
antiguos quedan en «círculo». Un servidor sin esa migración bloquea la opción y lo dice.

### Probarlo a mano contra el Supabase LOCAL (18)

`admin/config.js` y `config.js` pueden apuntar al proyecto remoto `gama-talla-dev`. Para probar el
importador sin tocarlo, `scripts/entorno-local.mjs` sirve el repositorio en **otro puerto (8770)** y
entrega a la tienda y al panel la configuración del Supabase **local**, generada al vuelo: tus
`config.js` no se leen, no se sirven y no cambian. Antes de servir o escribir comprueba que la API sea
`127.0.0.1`, que responda, que tenga la migración `20261117010000` y que la CSP del panel la permita.

```powershell
npx --yes supabase@3.0.0 start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npx --yes supabase@3.0.0 migration up            # solo si falta 20261117010000 en el local
$env:GT_CLAVE_LOCAL = "<contraseña inventada, 12+ caracteres>"
node scripts/entorno-local.mjs --crear-admin prueba@gamaytalla.test
node scripts/entorno-local.mjs --fotos "C:\Users\kevin\Documents\Revisiones_Gama_Talla\fotos_prueba_18"
node scripts/entorno-local.mjs                    # deja el servidor en marcha; Ctrl+C para detenerlo
```

- Panel: **http://127.0.0.1:8770/admin/** · Tienda: **http://127.0.0.1:8770/?intro=no**
- Cómo saber que es el entorno local: el título de la pestaña empieza por **«[LOCAL]»** y abajo a la
  izquierda aparece la etiqueta **«LOCAL · 127.0.0.1:54321»** (dentro de una ventana modal, como el
  importador o «Ver detalles», la tapa la ventana; el título sigue a la vista). En las herramientas
  del navegador (Red), las peticiones van a `127.0.0.1:54321` y nunca a `*.supabase.co`.
- `http://127.0.0.1:8765` (el de `abrir-panel.ps1`) **sigue usando tus `config.js` reales**: no lo uses
  para esta prueba.
- Al terminar: `node scripts/entorno-local.mjs --limpiar` borra del Supabase local las zapatillas
  creadas por los administradores ficticios de este script (con sus fotos de Storage) y esos usuarios.

### Quitar fotos en el editor (18)

Cada foto tiene **«Quitar foto»** (teclado y celular), en cualquier estado. En una galería guardada,
la retirada se confirma **al guardar** («Quitaste 1 foto guardada: se retira de la galería al
guardar») y «Cancelar» conserva la galería guardada. Si quitas la principal, la siguiente pasa a ser
la principal y la miniatura del selector. Sin fotos, el color no se puede publicar y la tienda usa
su círculo. Storage: tras un guardado confirmado (o al descartar el formulario) se borran solo los
archivos **subidos en esa edición que nunca estuvieron en una galería guardada**, después de
comprobar que ninguna galería los usa. Los que estuvieron en una galería guardada quedan en
«Archivos sin usar», que pide confirmación. Una subida que termina después de quitar su foto no la
devuelve al formulario.

## Público en la tienda (17)

- El editor tiene el grupo **«Público en la tienda (obligatorio)»**: Hombre, Dama o Unisex. Al crear
  no hay ninguna opción marcada y ya no existe «Dejar sin asignar». Sin elegirlo no se guarda (tampoco
  con «Guardar oculta») ni se publica: el error aparece junto al grupo y el foco va a «Hombre».
- En la tienda se ve como «Caballero», «Dama» o «Unisex» en la tarjeta y en «Ver detalles», y el
  filtro «Público» ofrece Todos, Caballero, Dama y Unisex (cada opción filtra por su valor exacto).
  Es independiente de la tabla de la guía de tallas.
- Los productos **anteriores** sin clasificar siguen visibles en «Todos», sin etiqueta. Al editarlos,
  el editor avisa «todavía no tiene público» y pide elegirlo para guardarlos o publicarlos (el
  servidor también lo exige: `fn_admin_guardar_producto` y la acción «publicar» de
  `fn_admin_estado_producto`). Ocultarlos, retirarlos o restaurarlos no lo exige.
- Lo aplica la migración `20261109010000_publico_unisex.sql`. Un servidor sin ella rechaza Unisex:
  el panel conserva el formulario y dice que falta aplicar esa migración.

## Historial de cambios (17)

El botón **«Historial»** abre los cambios de **zapatillas, colores y tallas** que registra
`public.historial` (por disparador, en cada alta, cambio o baja), del más reciente al más antiguo.

- Filtros **Todos, Zapatillas, Colores y Tallas**. Cambiar de filtro empieza la lista desde el
  principio; «Ver cambios anteriores» pide la página siguiente (25 por página, por `id`
  descendente, sin repetir).
- Cada cambio muestra: tipo, **fecha y hora de Colombia**, **quién** («Tú», el nombre de otra cuenta
  administradora o «Sistema o mantenimiento» si no hubo sesión), **qué** zapatilla, color o talla y,
  cuando corresponde, el valor **anterior → nuevo** (precio, código, público, categoría, visibilidad,
  estado y vigencia de una talla…). Si el registro ya no está en el tablero, se describe con los
  datos guardados en el propio evento.
- Los cambios de una misma operación (mismo `lote`, por ejemplo un guardado del editor) se marcan
  como «misma operación» y quedan unidos visualmente.
- Solo lectura y solo para administradores (RLS); el acceso se comprueba antes de cada página. Las
  respuestas que llegan tarde —de un filtro anterior, de un historial ya cerrado o de una sesión
  cerrada— se descartan sin pintarse.

## Exportar el catálogo a CSV (17)

**«Exportar catálogo»** descarga `gama-talla-catalogo-AAAA-MM-DD.csv` (fecha de Colombia) con el
inventario **completo**, también lo oculto y lo retirado:

- Una fila por **color y talla**; un modelo sin colores o un color sin tallas tienen su fila con
  esas columnas vacías.
- Columnas: códigos actuales (zapatilla y color), modelo, marca, categoría, público («Hombre»,
  «Dama», «Unisex» o «Sin clasificar»), referencias del proveedor, estado en la tienda (Publicada,
  Oculta o Retirada), color visible, precio y precio anterior en COP (números enteros), talla, talla
  activa, disponibilidad guardada y en la tienda, procedencia y vigencia (desde, vence y horas, en
  hora de Colombia).
- UTF-8 con BOM y separador **punto y coma**, como lo espera Excel en español. Se escapan comillas,
  saltos de línea y punto y coma, y un texto que empiece por `=`, `+`, `-`, `@`, tabulador o retorno
  se antepone con `'` para que la hoja de cálculo no lo ejecute como fórmula.
- Antes de exportar se comprueba el permiso. Usa las mismas lecturas paginadas del tablero: si una
  página falla, se avisa y **no se descarga nada** (nunca un archivo incompleto).
- Limitación conocida: Excel puede interpretar por su cuenta tallas como `41 1/3` o `40,5` como
  números o fracciones al abrir el archivo; el texto del CSV es el exacto.

## Respaldo y recuperación (17)

Comandos en `scripts/respaldo/`. El paquete se guarda **fuera del repositorio** y nunca contiene
claves, sesiones, cuentas de Auth, `public.administradores` ni datos de envío de clientes (esos solo
existen en el navegador de cada cliente). Los autores del historial quedan como UUID.

```bash
# 1. Respaldar (el stack local de este proyecto; o el proyecto enlazado, solo lectura)
node scripts/respaldo/respaldar.mjs --origen local  --salida "C:\Users\kevin\Documents\Revisiones_Gama_Talla\respaldos"
node scripts/respaldo/respaldar.mjs --origen remoto --confirmar-remoto --salida "C:\Users\kevin\Documents\Revisiones_Gama_Talla\respaldos"

# 2. Verificar (no escribe nada; código 0 = válido)
node scripts/respaldo/verificar.mjs "<carpeta del paquete>"

# 3. Preparar y arrancar OTRO stack local, vacío y desechable (otros puertos: API 127.0.0.1:56321)
node scripts/respaldo/preparar-destino.mjs --carpeta "C:\Users\kevin\Documents\Revisiones_Gama_Talla\destino_restauracion" --id gt_restauracion
npx --yes supabase@3.0.0 start --workdir "C:\Users\kevin\Documents\Revisiones_Gama_Talla\destino_restauracion" -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

# 4. Restaurar en él
node scripts/respaldo/restaurar.mjs "<carpeta del paquete>" --destino-workdir "C:\Users\kevin\Documents\Revisiones_Gama_Talla\destino_restauracion" --informe informe.json

# Desechar el destino
npx --yes supabase@3.0.0 stop --no-backup --workdir "C:\Users\kevin\Documents\Revisiones_Gama_Talla\destino_restauracion"
```

Etapa 18: el paquete guarda cada fila completa, así que `variantes.forma_muestra` (círculo o foto)
viaja y se restaura tal cual, junto con las fotos y las claves públicas. El destino debe tener las
**16 migraciones** del repositorio (incluida `20261117010000`). Un paquete **anterior** a la etapa 18
(sin esa columna) también se restaura: todos sus colores quedan en «círculo», y la verificación lo
comprueba aparte y lo dice al final. El CSV de «Exportar catálogo» es un inventario para leer, no
para restaurar: no incluye la presentación del color (ni el tono del círculo ni círculo/foto).

**Qué guarda el paquete** (`gama-talla-respaldo-<fecha>-<origen>/`):

| Archivo | Contenido |
|---|---|
| `manifiesto.json` | Versión del formato (1), fecha, origen, commit (y si había cambios sin commit), migraciones, recuentos, secuencias y **SHA-256 y tamaño** de cada archivo |
| `datos/catalogo.json` | `productos`, `variantes`, `tallas`, `fotos`, `historial` y `configuracion`, leídos en **una sola sentencia** (una instantánea coherente), más migraciones y secuencias |
| `fotos/productos/…webp` | Cada archivo de `fotos-catalogo` referenciado por `fotos`, descargado con la API de Storage, en su misma ruta de objeto |

Las fotos que son archivos del repositorio (`assets/…`) no se copian: se registran con su ruta, el
commit que las contiene y su SHA-256 (se exige que estén versionadas y sin cambios). El paquete se
escribe como `….incompleto`, se verifica y solo entonces se renombra.

**Restaurar** se niega si el paquete no pasa la verificación, si el destino no es local, si es el
mismo proyecto de origen, si ya tiene catálogo, historial u objetos en `fotos-catalogo`, o si su
esquema no es el de esta entrega (todas las migraciones del repositorio, incluida la de Unisex).
Después:

1. **Storage:** sube cada foto con la API de Storage del destino (misma ruta, sin sobrescribir) y
   comprueba los bytes servidos.
2. **Base, en una transacción:** suspende los disparadores de usuario de `productos`, `variantes`,
   `tallas` y `fotos` **solo dentro de ella** —si no, al insertar recalcularían `clave_catalogo` (el
   UUID en lugar de la clave original, por ejemplo un código GT anterior a un renombrado), los
   códigos, `actualizado_en` y las vigencias, y duplicarían el historial—, inserta las filas tal
   cual (UUID, códigos, claves, relaciones, estados, vigencias, fechas e historial con sus `id`),
   la configuración y las secuencias, y los reactiva. Si algo falla, se deshace todo. De las rutas
   de las fotos de Storage solo cambia el origen (al Storage local del destino).
3. **Verificación:** filas idénticas al paquete, `clave_catalogo` byte a byte, disparadores
   activos, secuencias, ids de `catalogo_publico`, bytes de cada foto servida, generación de
   **códigos nuevos** (en una transacción que se deshace) y auditoría de funciones con **0 filas**.
   `catalogo_publico` se lee **por páginas ordenadas por `id`** (`scripts/respaldo/vista.mjs`): la API
   local limita cada respuesta a 1.000 filas, así que una sola petición dejaría fuera lo que pase de
   ahí. Cada página valida su estado HTTP y su contenido (JSON, arreglo, `id` de texto, `variantes`,
   sin ids repetidos entre páginas); un 503 con cuerpo de texto, un 200 que no es JSON o un servidor
   caído son un fallo de verificación con la página y lo recibido, nunca una lectura parcial.

Si una comprobación falla **después de confirmar la base**, el informe (`--informe`) queda en
`verificacion-fallida` y el mensaje dice qué quedó restaurado y que **no se deshizo**: las filas de
la base (zapatillas, colores, tallas, fotos, historial, ajustes, con los disparadores reactivados) y
las fotos subidas a Storage; el informe lo guarda en `restaurado`. Los resultados posibles del informe
son `paquete-no-valido`, `rechazado`, `parcial-storage`, `parcial-base`, `verificacion-fallida` y `ok`.

Si una fase falla, el mensaje dice qué quedó parcial (por ejemplo, «las 2 fotos ya están en el
Storage del destino; la base sigue vacía») y cómo repetir en un destino limpio:
`npx --yes supabase@3.0.0 db reset --workdir "<destino>"` (borra el destino) o `stop --no-backup` y
`start`.

El ciclo completo con datos ficticios (respaldo, paquetes alterados, fallo simulado, restauración y
comparación origen ↔ destino, incluida una línea de carrito V3 en la tienda real) se reproduce con:

```bash
node supabase/pruebas/reproducir/ciclo_respaldo_17.mjs --destino-workdir "<destino vacío>" --salida "<carpeta fuera del repo>"
```

## Administrar el catálogo (16)

- **«Agregar zapatilla»** está siempre arriba del tablero (y en el aviso del catálogo vacío).
  **«Editar»** abre cada zapatilla. El editor ocupa toda la pantalla en el celular y es un panel
  centrado en el escritorio; Escape o «Cancelar» piden confirmación si hay cambios sin guardar, y el
  navegador avisa antes de abandonar la página. Cerrar el selector de fotos sin elegir ninguna no es
  salir (etapa 19): su evento «cancel» burbujea hasta el diálogo y se ignora; el editor conserva
  campos, fotos, posición y foco.
- **Modelo:** nombre, marca, categoría, referencia del proveedor (puede repetirse: no es el
  identificador), tabla de la guía de tallas (hombre o mujer), orden, descripción, «Destacada» y
  «Nuevo ingreso».
- **Colores:** nombre, referencia del color, precio actual y anterior y «Color visible en la
  tienda». Precio `0` = «Precio por confirmar»; el precio anterior debe ser mayor que el actual (y no
  se admite con precio 0). Un color se desactiva, no se borra.
- **Tallas:** se añaden una a una o separadas por punto y coma (`38; 39; 40`), con la gramática de
  la base (`40`, `40,5`, `40.5`, `40 1/3`). Se rechazan los equivalentes en el mismo color (`40.5`
  si ya existe `40,5`): se reactiva la existente. Las etiquetas existentes no se renombran ni se
  normalizan. Una talla nueva queda **por revisar**; las existentes solo se desactivan o reactivan.
- **Cambios hechos en otro lugar mientras editas.** El formulario envía, por cada talla, cómo
  estaba al abrirlo. El servidor solo aplica lo que cambiaste tú: si una talla que no tocaste se
  reactivó o desactivó entretanto (por ejemplo, «Confirmó el proveedor» desde otra pestaña), ese
  cambio se conserva y el aviso de guardado lo dice. La comprobación y la escritura van juntas en el
  servidor, con la fila bloqueada; el estado, la confirmación y la vigencia de la talla no se tocan.
- **Guardar nunca confirma disponibilidad ni renueva vigencias.** Para confirmar, las acciones de
  15B del tablero («Confirmó el proveedor», «Nueva publicación»).
- **Guardar oculta / Guardar y publicar.** Una zapatilla nueva se guarda oculta. Publicar es una
  acción aparte que exige **un mismo color visible** con al menos una foto y una talla activa (una
  foto en un color y una talla en otro no bastan, y un color oculto no cuenta); si falta algo, queda
  guardada y oculta y se dice qué falta. «Ocultar de la tienda», «Retirar del catálogo» (oculta y
  conserva todo; aparece en el filtro «Retiradas») y «Restaurar» (vuelve oculta).
- Se conservan UUID, código interno (`GT-…`), códigos de color (`GT-…-A`) y las claves del carrito:
  cambiar nombres, referencias o fotos no regenera nada.

### Fotografías

| Límite | Valor | Por qué |
|---|---|---|
| Archivo original | JPEG, PNG o WebP, hasta 15 MB | Se comprueba la **firma del contenido**, no la extensión, y que el navegador pueda decodificarla |
| Dimensiones | Lado mayor de 400 px como mínimo; hasta 50 megapíxeles | No se amplían fotos pequeñas (aviso por debajo de 900 px) |
| Foto publicada | WebP, lado mayor hasta 1600 px, proporciones intactas, sin recortes | Objetivo orientativo 150–250 KB; nunca más de 600 KB |
| Por color / por vez | 12 / 12 | |
| Bucket `fotos-catalogo` | Solo `image/webp`, 1 MiB por archivo | Lo impone Storage, además del panel |

- Un WebP que ya es adecuado (hasta 1600 px y 300 KB) se sube **tal cual**. Lo demás se redimensiona
  sin ampliar y se codifica a WebP probando calidades de 0,86 a 0,68 hasta llegar al objetivo; si
  recomprimir no mejora un WebP, se conserva el original. La salida se comprueba: si el navegador
  no genera WebP de verdad, se dice y no se sube otra cosa.
- Cada foto muestra vista previa, dimensiones, peso original → final y el progreso de subida.
- Nombres únicos y versionados: `productos/<producto>/<color>/<milisegundos>-<10 aleatorios>.webp`.
  Nada se sobrescribe (no hay política UPDATE). Reemplazar sube un archivo nuevo.
- **Quitar de la galería** quita la fila de `fotos`, no el archivo. **Archivos sin usar** (en el
  editor) lista lo que está en Storage y en ninguna galería guardada; «Borrar definitivamente» pide
  confirmación, vuelve a comprobar que nadie lo usa y borra con la API de Storage (nunca por SQL).
  Storage también lo impide en el servidor si alguna galería lo referencia.
- **Costo de almacenamiento y transferencia (estimación, sin miniaturas):** con ~2.000 fotos de
  ~200 KB, unos **400 MB**. Una visita típica (12 tarjetas y 2 fichas de 4 fotos) transfiere unos
  4 MB, es decir ~4 GB al mes por cada 1.000 visitas; los archivos llevan caché de un año y sus
  nombres no cambian, así que las visitas repetidas descargan mucho menos. Compara estas cifras con
  los límites vigentes de tu plan de Supabase.
- **Miniaturas: no se generan.** Duplicarían el trabajo de cada foto. Si se añadieran (unos 400 px y
  ~30 KB cada una), costarían ~60 MB más para 2.000 fotos y reducirían el peso de las tarjetas del
  catálogo de ~2,4 MB a ~0,4 MB por visita. Queda como mejora opcional.

### Fallos entre Storage y la base de datos

- Las fotos se suben **antes** de guardar; el guardado solo acepta archivos que ya están en Storage
  (la función lo comprueba). Una subida fallida nunca deja una referencia publicada.
- Si se pierde la respuesta de una subida, el panel mira en Storage si el archivo llegó; si no
  aparece, ofrece reintentar **con el mismo nombre** (no se duplica). No afirma que falló.
- Un guardado es **una** llamada a `fn_admin_guardar_producto`, en una transacción: o se aplica todo
  (producto, colores, tallas, galería) o nada.
- Cada guardado lleva un identificador de operación. Si se pierde la respuesta, el panel relee la
  zapatilla (solo lectura): si su `ultima_operacion` es la de ese guardado, se aplicó (nadie más
  conoce ese valor). Si no, dice «Resultado no confirmado» con lo que sabe (sigue sin cambios y
  podría aplicarse, o cambió por otra edición) y permite **reintentar con la misma operación**: el
  servidor no la aplica dos veces. Una creación nunca se repite con identificadores nuevos.
- Formularios desactualizados: el servidor compara la `version` y la actualiza en la misma
  transacción. Si otra edición se guardó antes, no se sobrescribe nada; el formulario conserva tus
  datos y ofrece cargar la versión actual.
- Los archivos antiguos no se borran al reemplazar una foto, y no se ofrece borrar archivos mientras
  haya una operación sin confirmar.
- Si la sesión vence con cambios sin guardar, el formulario se conserva en memoria y, al volver a
  entrar, el tablero ofrece «Volver al formulario».

## Gestionar la disponibilidad (15B)

1. Busca la zapatilla (código interno, referencia, marca o modelo) y, si quieres, filtra por
   «Con tallas disponibles», «por revisar», «agotadas» o «Con elementos ocultos». Un producto aparece
   en todos los filtros que le correspondan: puede tener tallas en varios estados a la vez.
2. Pulsa las tallas que quieras, **de uno o varios modelos y colores** (etapa 18): cada pulsación
   selecciona o quita esa talla y conserva las demás, sin teclas modificadoras. La selección se guarda
   por el UUID real de cada talla (la 40 de un color no es la 40 de otro). Abajo aparece la barra de
   acciones con el total («4 tallas seleccionadas · 2 modelos · 3 colores»). **«Seleccionar tallas
   visibles»** (encima de la lista) añade todas las que se ven; **«Quitar selección»** la vacía. Buscar
   o filtrar **conserva** la selección y dice cuántas tallas quedan fuera de la vista. Al perder el
   acceso se limpia.
   - **«Seleccionar tallas» en cada modelo** (etapa 19): un menú con *Todas las tallas*, *Tallas
     activas*, *Tallas desactivadas*, *Tallas agotadas* y *Tallas por revisar*, cada una con su
     cantidad («Ninguna» si no hay; elegirla lo dice y no cambia nada). Cada opción **define** la
     selección dentro de ese modelo y conserva la de los demás; después se puede seguir marcando y
     desmarcando talla a talla. Activa/desactivada es el indicador `activa`; agotada y por revisar son
     el mismo estado que muestra el panel (el que calcula Supabase, con la vigencia vencida incluida;
     para lo que la tienda no muestra se aplica la misma regla que `fn_estado_publico` a lo guardado).
     Funciona con ratón, teclado (flechas, Inicio, Fin, Intro, Escape, que devuelve el foco al botón)
     y pantalla táctil; un clic fuera lo cierra.
   - **Barra compacta** (etapa 19): total, «Ver selección», «Cambiar estado» y «Quitar selección». En
     celular las seis acciones aparecen al pulsar «Cambiar estado»; en escritorio están siempre a la
     vista. **«Ver selección»** lista lo elegido por modelo, color y código; cada talla muestra su estado
     y, al desplegarla, el estado guardado, la vigencia y la procedencia; «Ir al color» lleva a ella.
     Seleccionar ya no añade bloques entre las tarjetas: la lista no cambia de altura al pulsar. Los dos
     plegables viven dentro de la barra (nunca una ventana encima de otra) y Escape los cierra. El
     tablero deja libre abajo el alto **medido** de la barra (y del aviso de resultado), así la última
     talla siempre se alcanza; respeta el área segura inferior.
   - **Foto de cada color** (etapa 19): cada fila de color muestra la primera foto de SU galería (en su
     orden), en una miniatura de tamaño fijo con la foto completa (`object-fit: contain`) y carga
     diferida; «Sin foto» si no tiene. Al cambiar la foto principal se ve tras «Actualizar» o al volver
     del editor. En celular los colores y sus tallas usan todo el ancho de la tarjeta.
   - **Cada modelo, una tarjeta** (etapa 19): borde exterior `--linea-fuerte` con el radio de las
     superficies y una sombra mínima, que contiene cabecera, botones, colores y tallas; más espacio
     entre modelos. Los separadores entre colores (`--linea`) son más suaves que ese borde.
   - **Búsqueda y pulsaciones** (etapa 19): la búsqueda se aplica 120 ms después de escribir. Si en ese
     momento hay una talla pulsada (puntero abajo, o Espacio, que actúa al soltar), el repintado espera a
     que termine la pulsación: antes, la talla se sustituía a mitad del clic y el navegador lo
     descartaba. Tras repintar, el foco vuelve a la misma talla (o botón) si lo tenía.
3. Elige la acción. Un diálogo detalla qué se modificará, **agrupado por modelo y color**, con sus
   códigos y tallas, explica el efecto y pide confirmación:

| Acción | Qué hace | Cuándo usarla |
|---|---|---|
| **Confirmó el proveedor** | `fn_confirmar_por_proveedor`: el servidor pone la fecha de confirmación; la vigencia empieza ahí y dura las horas indicadas (por omisión, la de la tienda: 48 h; máximo 60). La publicación original se conserva | El proveedor te confirmó directamente que hay |
| **Nueva publicación** | `fn_confirmar_por_publicacion`: pide la **fecha y hora originales** de la publicación, en hora de Colombia (UTC−5, sin horario de verano); no se rellena con «ahora». La vigencia empieza en esa fecha. Si ya pasó, la talla queda por revisar | El proveedor volvió a publicar el modelo |
| **Marcar agotada** | `fn_marcar_agotada`, con nota interna opcional. No borra nada | El proveedor confirmó que no hay |
| **Dejar por revisar** | Pone el estado en `REVISAR` (una sola escritura, permitida por el RLS de administrador). No inventa fechas ni confirma nada | No sabes si hay; distinto de «agotada» |
| **Desactivar tallas** | `activa = false` en una sola escritura (todas o ninguna). Deja de ofrecerse; conserva registro, estado, fechas e historial. Informa de las que ya estaban desactivadas | Ya no la vendes, pero quieres conservarla |
| **Activar tallas** | `activa = true` en una sola escritura. Conserva estado y fechas: la tienda calcula la disponibilidad con la vigencia actual. No confirma nada. Informa de las que ya estaban activadas | Vuelves a ofrecerla |

- **Varias tallas, varios colores:** antes de escribir se relee en una sola consulta el estado de
  todas las variantes implicadas; si alguna talla cambió en otro lugar, no se aplica nada. Las
  confirmaciones y «agotada» se guardan talla por talla: un fallo parcial dice cuáles se aplicaron,
  identificadas por modelo, color, código y talla, y deja seleccionadas solo las que no se aplicaron
  (reintentar no repite las aplicadas). Con una respuesta perdida se consulta el estado actual y no
  queda nada preparado para repetir. Mientras se procesa, todo queda bloqueado.

- **Volver al lugar de trabajo** (etapa 19): al abrir una acción se guarda la última talla con la que
  trabajaste (modelo, color y talla, por UUID) y dónde estaba en la pantalla. Tras guardar y releer, la
  misma talla vuelve a quedar a la misma altura y recibe el foco, sin subir al inicio (mientras se
  relee, la lista conserva su alto). Búsqueda y filtro se conservan. Si el cambio la saca del filtro
  activo, queda el modelo más cercano en su lugar y el resultado lo explica («… ya no aparece con el
  filtro …; te dejamos junto a …»). El resultado se muestra **fijo abajo**, encima de la barra, como
  región de estado anunciada; si todo salió bien el detalle por talla queda plegado. Cancelar el
  diálogo no mueve la página y devuelve el foco al botón de la acción (en celular, a «Cambiar estado»).
  Lo mismo tras un fallo parcial o un cambio concurrente.
- Las confirmaciones **reactivan** una talla desactivada (`activa = true`); el diálogo lo avisa antes.
  Ninguna acción publica un producto o un color ocultos.
- El estado que ve el cliente lo sigue calculando Supabase; el panel no usa el reloj del navegador
  para él. Solo el menú «Seleccionar tallas» lo usa para agrupar las tallas que la tienda no muestra
  (ocultas o desactivadas), con la misma regla que `fn_estado_publico`.
- **Historial:** desde la etapa 17 cubre zapatillas, colores y tallas, con filtros (ver «Historial
  de cambios» arriba). Es solo lectura.

### Cómo se protege cada operación

- Antes de escribir se comprueban la sesión, el permiso (`fn_es_administrador()`) y que la selección
  siga vigente: si alguna talla cambió desde que se cargó (`actualizado_en`), no se aplica nada.
  Esta consulta previa **detecta los cambios hechos antes de ella, pero no es un bloqueo atómico**:
  entre la consulta y la escritura, otra pestaña u otra cuenta todavía puede cambiar la misma talla,
  y la escritura se aplicará igualmente.
- Mientras se aplica, todo lo demás queda bloqueado: no hay envíos dobles ni acciones cruzadas.
- Las tres funciones trabajan **talla a talla**: con varias tallas son varias solicitudes, no una
  operación única, y el resultado dice cuáles se aplicaron y cuáles no. «Dejar por revisar» es una
  sola escritura para toda la selección.
- Sin reintentos automáticos. Solo una **respuesta válida de la escritura** confirma qué hizo esa
  petición. Si la respuesta se pierde (o no confirma el cambio), la talla queda como **«Resultado no
  confirmado»**:
  - El panel no repite la petición ni escribe nada para comprobarla, y no renueva vigencias.
  - Relee la talla con `fn_admin_tallas()` (solo lectura) y muestra su **estado actual**: estado
    guardado, procedencia, publicación original, vigencia y si está desactivada. Ese estado **no se
    atribuye a la petición**: una fecha de actualización distinta puede venir de otra acción, otra
    cuenta u otros parámetros, y una talla sin cambios tampoco prueba que la petición fallara, porque
    puede seguir en camino y aplicarse después. El aviso lo dice así («cambió…, pero no sabemos por
    qué operación» o «sin cambios por ahora; la petición todavía podría aplicarse»). Nunca anuncia,
    por ejemplo, que una talla quedó por revisar si la relectura la muestra en otro estado.
  - Si la relectura funciona, los datos se recargan y la selección se vacía: cualquier acción
    posterior exige elegir las tallas y confirmar de nuevo.
  - Si tampoco puede leerla, vacía la lista y bloquea las acciones hasta que «Actualizar» traiga el
    estado real.
  - En un lote, las tallas con respuesta válida conservan su resultado («confirmada…», «no se
    aplicó» con el motivo) y las que quedaron después de la pérdida aparecen como «no se intentó».
- Después de cada acción los datos se recargan desde el servidor, conservando búsqueda, filtro y
  posición. Las lecturas se piden por páginas ordenadas, sin truncarse en el límite de la API.
- Las columnas internas de las tallas se leen con `fn_admin_tallas()`; las escrituras solo devuelven
  columnas públicas.

## Abrirlo en local

En la raíz del proyecto, en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\abrir-panel.ps1
```

El guion arranca el servidor estático en `127.0.0.1:8765` si no está en marcha y abre
**http://127.0.0.1:8765/admin/**. A mano es lo mismo:

```bash
python -m http.server 8765 --bind 127.0.0.1
# y abrir http://127.0.0.1:8765/admin/
```

El panel habla directamente con el proyecto de Supabase configurado: con `admin/config.js` apuntando
a `gama-talla-dev`, lo que se ve son los datos reales. **Guardar en el panel escribe en ese proyecto.**
Las fotos (etapa 16) necesitan que las migraciones `20261108010000` y `20261108020000` estén aplicadas
en él (bucket y funciones).

## Configuración

`admin/config.js` **no se versiona** (está en `.gitignore`). Se crea copiando `config.ejemplo.js`:

| Valor | Dónde se obtiene |
|---|---|
| `supabaseUrl` | Dashboard → Project Settings → Data API → Project URL |
| `clavePublicable` | Dashboard → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |

Solo la clave **publicable**. El panel rechaza una clave secreta (`sb_secret_…`) o un JWT y muestra
«Falta configurar el panel». La protección real la hacen el RLS y las funciones de Supabase.

## Cómo protege el acceso

- **Sesión:** la gestiona el SDK oficial (`vendor/supabase-js-2.118.0`, versión fijada y servida desde
  el propio sitio; ver su `LEEME.txt`). Se guarda solo bajo la clave `gama-talla-panel-sesion` de
  `localStorage`: el carrito y la caché de la tienda no se tocan, y la tienda sigue consultando como
  visitante con su clave publicable, sin la sesión del panel.
- **Permiso:** antes de mostrar o recargar datos se verifica la sesión con Auth en el servidor
  (`getUser`) y el permiso con `fn_es_administrador()`. Se repite en cada «Actualizar» y al volver a la
  pestaña (como mucho cada 30 s). Si el permiso se retira o la sesión vence, los datos desaparecen.
- **Errores de red:** no se muestran datos anteriores; el SDK reintenta las lecturas hasta 3 veces y
  después aparece un aviso con «Reintentar».
- **Cerrar sesión:** cierra la sesión de este dispositivo con el SDK (`signOut({ scope: "local" })`),
  lo que revoca su token de refresco, y borra solo la clave del panel.
- **Página:** política de seguridad de contenido estricta (solo scripts propios; conexiones solo a
  Supabase), `noindex` y sin `Referer`. Todo el contenido se pinta con `textContent`.

## Qué lee

| Dato | De dónde |
|---|---|
| Productos, colores, precios y fotos (también ocultos) | Tablas `productos`, `variantes` y `fotos` (RLS de administrador) |
| Tallas y sus columnas internas | `fn_admin_tallas()` |
| Estado de cada talla en la tienda | `catalogo_publico`: lo calcula Supabase, no el reloj del navegador |

Lo que no está publicado (producto, color o talla inactivos) se presenta como «no visible en la tienda».

## Pruebas (solo local)

Con el stack local de Supabase y la tienda servida:

```bash
# Storage activo (la etapa 16 lo necesita): no se excluye storage-api
npx --yes supabase@3.0.0 start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
python -m http.server 8765 --bind 127.0.0.1      # en otra terminal
npx playwright test tests/etapa15 tests/etapa16 tests/etapa17 --workers=1
node supabase/pruebas/80_catalogo_http_local.mjs  # PostgREST y Storage por HTTP real
npx --yes supabase@3.0.0 stop --no-backup
```

Etapa 17: `tests/etapa17/panel.spec.js` (Unisex, público obligatorio, heredados, servidor sin la
migración, historial, CSV y acceso; marca «MARCA DIECISIETE») y `tests/etapa17/tienda.spec.js`
(tarjeta, Unisex y filtros con Supabase simulado). La migración se prueba desde las 14 anteriores
con `supabase/pruebas/reproducir/datos_previos_17.sql` y `verificar_migracion_17.sql` (ver su
README), y sus reglas con `supabase/pruebas/92_publico_obligatorio.sql`.

Etapa 19: `tests/etapa19/lector.spec.js` (lector sin servidor: mensaje Reebok y variantes, público
combinado, «todas las tallas», números de modelo y ejemplos anteriores) y `tests/etapa19/reparto.spec.js`
(importador con el Supabase local: lectura en las fichas, regla según el público, reparto entre fichas
y colores saltando una foto manual, agrupar durante la revisión, reordenar, destino a mano, sobrantes,
faltantes, archivo inválido y reemplazo, doble clic, guardar y recargar, celular). Ajustes:
`lector.spec.js` también cubre los mensajes Nike 7 CAMARAS, «numeración» con variantes y tallas
explícitas, y varios precios; `tests/etapa19/versiones.spec.js` (orden de la ventana y estado del bloque
de ajustes, elección y conservación del precio, versiones Dama/Hombre independientes, agrupar del mismo
público, separar y volver a agrupar durante el reparto, ajustes en bloque, guardar y coincidencias con el
catálogo por público). Marca ON y destinos: `lector.spec.js` (mensaje ON y variantes, ON solo como
palabra completa al principio, marcas compuestas y marcas del catálogo) y `tests/etapa19/destinos.spec.js`
(ON y una marca ficticia del catálogo en el importador; ajustes solo a las fichas 1 y 3, la 2 intacta al
releer y al cambiar su proveedor, aplicación repetida, precios a mano, selección al repintar,
independencia del guardado y del reparto, avisos al añadir, agrupar, separar y guardar, guardar y recargar).
Tablero: `tests/etapa19/tablero.spec.js` (marca ficticia «MARCA TABLERO T19», nueve modelos): las seis
acciones desde un modelo de abajo en escritorio y en celular (misma altura, foco, sin saltar arriba,
resultado a la vista), selección entre modelos, cancelar, fallo parcial, salir del filtro activo, el
menú por modelo con ratón, teclado y pantalla táctil, la foto de cada color (orden de la galería, «Sin
foto», cambio de la principal), la barra en 360 × 560, 390 × 844 y escritorio, la separación entre
modelos a 360, 390 y 1440 px, y una pulsación con la búsqueda por repintar (ratón y Espacio; sin la
corrección el clic se pierde en los tres navegadores). Capturas en la carpeta temporal
(`gama-talla-19-tablero`). `tests/etapa19/editor-cancelar.spec.js`: cerrar el selector de archivos del
editor sin elegir conserva el editor; Escape sigue avisando de los cambios sin guardar.

Etapa 20: se ejecutan contra el **entorno aislado** (`node scripts/entorno-local.mjs`, puerto 8770, con
la configuración del Supabase LOCAL; nunca con los `config.js` reales del 8765):

```bash
node scripts/entorno-local.mjs        # en otra terminal (puerto 8770)
SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa20 --workers=1
```

`tests/etapa20/separador.spec.js` y `perfiles-lector.spec.js` no necesitan servidor (separación con
saltos internos, emojis, encabezados y multimedia; los mensajes Reebok, Nike 7 CAMARAS, ON y New Balance
nunca se dividen; 30 publicaciones; Perfil general idéntico al lector anterior; dos proveedores;
prioridad de las tallas explícitas; alias y protecciones de ON, Slip On, Air Max 90 y Club C 85;
reglas literales y validación). `pegado.spec.js` (pegado en el importador: crear en la ficha inicial
vacía, doble clic, encabezados, dudosas, unir y separar, lote con trabajo previo y celular),
`perfiles.spec.js` (crear, validar, editar y eliminar perfiles sin alterar lo leído; volver a leer con
correcciones a mano; recuperación del borrador con el perfil eliminado; «Recordar para este proveedor») y
`borradores.spec.js` (recuperación tras recargar con fotos, orden, principal, agrupaciones y ajustes; foto
a medio optimizar; falta de espacio simulada; cerrar sesión y otro usuario o proyecto; dos pestañas;
respaldo con fotos, mismo identificador, otro usuario y archivos no válidos; guardado parcial con
respuesta perdida; recarga en mitad del guardado; reintento rechazado por un alta que sí llegó; lote de
30 publicaciones y 20 imágenes; guardado local fallido al cambiar de lote; traspaso sin confirmar;
trabajo sin mensaje ni modelo). `colores.spec.js` («(N colores)» en el lector, el pegado masivo y la
ficha; cantidades no válidas; relectura y doble clic; cambiar la cantidad sin perder fotos; reparto,
borrador, respaldo y guardado) y `categorias.spec.js` (selector en el editor, la ficha, los ajustes y el
perfil; categoría antigua y personalizada; «Sin cambiar»; prioridad de lo elegido a mano; teclado y
celular; el menú sigue abierto aunque la ficha se repinte mientras se elige). Las pruebas antiguas que escribían la categoría usan `elegirCategoria`/`campoCategoria`
(`tests/etapa15/ayudas-panel.js`). Modelos ficticios « P20», borrados al terminar; fotos ficticias en
`gama-talla-20-fotos` y capturas en `gama-talla-20-capturas` (carpeta temporal).

Etapa 18: `tests/etapa18/importador.spec.js` (los dos mensajes de ejemplo, lote con agrupación de
colores y precio de venta, coincidencia con el catálogo, fallo parcial con reintento, selector con un
círculo y dos miniaturas en celular y escritorio, ficha antigua y build). Usa fotos ficticias y la
marca «NEW BALANCE» solo con modelos de prueba («9060 P18», «LOTE A P18»…, además de 603 y 1080), que
borra al terminar. Requiere la migración `20261117010000`; sus reglas se prueban con
`supabase/pruebas/93_forma_muestra.sql`. `tests/etapa18/ventana.spec.js` cubre la ventana (una sola zona de desplazamiento, extremos con la rueda, 360 × 560, confirmación, cerrar restaura el panel, editor) y «Aplicar todos los ajustes». `tests/etapa18/revision.spec.js` cubre el mensaje Reebok en una línea, el orden del
importador, el foco al añadir, la agrupación, el celular, el tono (recuadro, hexadecimal, validación
al salir, automático) y «Quitar foto» en el importador y el editor (principal, última, subida en
curso, cancelar, limpieza de Storage, recarga y tienda). `tests/etapa18/lector-tallas.spec.js` es la regresión del
lector (una sola talla, modelos, precios y teléfonos que no son tallas, casos «Revisar» y los dos
mensajes del proveedor); no necesita Supabase. El ciclo de respaldo
(`supabase/pruebas/reproducir/ciclo_respaldo_17.mjs`) incluye un color en círculo y otro en foto.

Las pruebas de la etapa 16 generan fotos ficticias con Chromium en la carpeta temporal
(`gama-talla-16-fotos`), usan la marca «Marca Dieciséis» y borran al terminar sus productos y sus
archivos de Storage (también los huérfanos de una ejecución interrumpida). Capturas en
`gama-talla-16-capturas`.

Las pruebas crean usuarios y productos **ficticios** en el stack local con su clave de servicio
local, los borran al terminar y se niegan a correr si la API no está en `127.0.0.1`. Necesitan el
catálogo local vacío al empezar. Si una ejecución anterior se interrumpió antes de limpiar (por
ejemplo, si cae el navegador), retiran primero esos restos —solo los nombres, marcas y correos
`@gamaytalla.test` que ellas mismas crean— y lo anuncian en la salida.

Para ver el panel con muchos productos se pueden cargar en local los 28 **ejemplos** de la tienda
(`supabase/local/semilla-28-productos.sql`). Son datos de demostración: nunca se cargan en el
proyecto remoto. Usan un solo
proceso (`--workers=1`): el servidor de Python no aguanta conexiones en paralelo. Las capturas se
guardan en la carpeta temporal del sistema (`gama-talla-15a-capturas`), fuera del repositorio.

Etapa 21: también contra el **entorno aislado** (8770):

```bash
SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa21 --workers=1
# Con los PDF reales (no están en el repositorio): carpeta donde están, y capturas fuera del repositorio.
GT_PDF_REALES=<carpeta> GT_CAPTURAS_REALES=<carpeta de capturas> SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa21/reales.spec.js --workers=1
```

- **`tests/etapa21/catalogo-pdf.spec.js`** usa catálogos PDF **sintéticos**, generados en
  `ayudas21.js` con la misma estructura y contenido ficticio:
  - **Lector:** tarjetas, portada y despedida fuera, papel por contenido, cruce por foto con orden
    cambiado, foto recodificada (propuesta), ambigua y sin pareja, importes general y por caja, equivalencias del
    título, clasificación por señales, la condición de un precio en el lector común y PDF escaneado o no
    válido.
  - **Importador:** vistas, contadores, infantil, asociaciones, añadir sin duplicar, coste y venta
    separados, ajuste sin doble margen, releer y guardar como oculto. También el borrador con documentos,
    fotos y decisiones tras recargar, el PDF repetido, fechas distintas, celular, y avance y cancelación.
- **`tests/etapa21/correspondencias-respaldo.spec.js`** cubre las correcciones de la revisión:
  - Dos fotos distintas con la misma huella gris dan una propuesta y nunca una «exacta». Al añadirlas al
    lote no entra su coste.
  - La exacta es la elegida en cualquier orden de las candidatas (las seis permutaciones), y en el
    importador, con el documento de precios en los dos órdenes, el coste, el texto preparado y la
    procedencia son los de la tarjeta exacta.
  - Exportar e importar un respaldo con imágenes del PDF en JPEG (forzado sin depender del navegador) y una
    de más de 1 MiB: vuelven las fotos, los destinos, las decisiones y los precios, y se añaden al lote.
  - Una foto final en JPEG sigue rechazándose.
- **`tests/etapa21/reales.spec.js`** solo corre con `GT_PDF_REALES` y no guarda nada. Comprueba 78/78/78
  tarjetas y fotos, los papeles, el cruce 78 a 78, el calzado (57: 41 + 16), los ejemplos de precios, la
  caja, el calzado infantil y la Dama 36–40. Con `GT_CAPTURAS_REALES`, además, captura la revisión en el
  importador.

Etapa 22: también contra el **entorno aislado** (8770):

```bash
SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa22 --workers=1
```

`tests/etapa22/estado-producto.spec.js` (catálogo FICTICIO «MARCA ESTADO T22» en el Supabase local):
- **Publicar y ocultar:** desde la tarjeta, sin abrir el editor. Se comprueba el resultado guardado
  (versión y operación), el catálogo público, que ninguna columna de tallas, colores o fotos cambia, y que
  los demás modelos no cambian.
- **Rechazos y retirados:** la publicación incompleta con su motivo y el modelo que sigue oculto; el
  retirado sin botón.
- **Fallos y concurrencia:** doble clic (una sola operación), conflicto de versión, respuesta perdida
  aplicada, respuesta perdida sin llegar al servidor (Comprobar y Reintentar con la misma operación) y el
  caso en que otra edición dejó el estado igual al deseado.
- **Vista:** posición, búsqueda, filtro y selección, el modelo que desaparece por el filtro, teclado
  (Tab, Intro y Espacio), disposición en escritorio y en celular táctil.

`tests/etapa22/orden-fotos.spec.js` recibe las imágenes en un orden y las elige en otro, y comprueba:
- **Galería y selección:** numeración, quitar y renumerar, «Deshacer última selección», «Reiniciar
  orden», teclado y la secuencia con el destino de cada foto.
- **Confirmación y reparto:** las «sin elegir», la opción rápida «Usar el orden recibido», «Incluir al
  final», «Subir» y «Bajar», «Ordenar por nombre» y el reparto final.
- **Orden recibido:** tras elegir 3 y 1 vuelve a 1, 2, 3; también tras «Ordenar por nombre», «Bajar» y
  recargar el borrador, con destinos manuales, sin reincorporar lo quitado ni lo asignado y con
  borradores anteriores.
- **Persistencia:** recargar con la galería abierta y con el orden confirmado, el destino manual y el
  respaldo con la selección en curso.
- **Identificadores:** nombres de archivo repetidos con la optimización retrasada de forma controlada
  (se elige mientras se optimiza y el orden no se mueve) y los colores que ya tienen fotos, también las
  que se están optimizando, con los avisos de sobrantes y faltantes.
- **Celular táctil:** 390 px, con toques, miniaturas de al menos 120 px y sin desplazamiento horizontal.

No se guarda nada en el catálogo.

Etapa 23: contra el **entorno aislado** (8770), con PDF sintéticos y modelos ficticios « P23»:

```bash
SITIO=http://127.0.0.1:8770 npx playwright test tests/etapa23 --workers=1
```

- **`inventario.spec.js`**: lógica sin red. Reconocer (exacta, proveedor, ambigua, contradictoria, parecida,
  desactivada, retirada, inexistente), costes, tallas, fechas, último conocido, consolidar y memoria exportada.
- **`entregas.spec.js`**: dos entregas de días distintos (documentos y fotos en otro orden; dos colores del mismo
  producto en una sola escritura; un color nuevo; registros sin cambios; repetir la entrega), catálogo anterior
  vinculado a mano con conservación completa, WhatsApp, fechas anteriores y desconocidas, celular y borrador.
- **`guardado.spec.js`**: conflicto antes de enviar y en el servidor, doble clic, respuesta perdida (también con otra
  edición después), petición que no llegó, recarga a mitad, fallo parcial, fotos y fallos del almacenamiento local.
- **`creacion.spec.js`**: alta normal; fallo del borrador antes de subir (cero subidas y cero escrituras) y antes del alta tras
  subir las fotos (el reintento reutiliza fotos, identificadores y operación); almacenamiento no disponible (se prepara y
  exporta, no se crea) y su recuperación; respuesta perdida y recarga sin duplicar; fallo local o de la memoria posterior a una
  creación confirmada; varias fichas con fallo a mitad.
- **`revision.spec.js`**: cambio de proveedor tras confirmar y elegir cambios, operaciones sin confirmar de otro proveedor,
  cambio de público del destino y nombres corregidos; fallo del guardado previo (fotos y actualización) con reintento y
  recarga; tallas que se dejan de anunciar, entregas ya revisadas y mensajes sin tallas.
- **`memoria.spec.js`**: destinos renombrados, desactivados, retirados e inexistentes; parecidas, contradictorias y
  con varios destinos; separación por proveedor, usuario y proyecto; corregir, olvidar, exportar e importar; relación
  pendiente; base en versión 1 y respaldos anteriores.
