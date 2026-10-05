# Bibliotecas de arquitecturas

Una biblioteca es un repositorio Git (GitHub, GitHub Enterprise, GitLab o GitLab self-managed) con el catálogo de arquitecturas de una empresa o un equipo. Trazo la lee y escribe directamente desde el navegador con la API del proveedor: no hay servidor de Trazo en medio.

## Cómo organizar el repositorio

Cada carpeta que contiene un modelo `*.calm.yaml` es una arquitectura. Si una carpeta tiene varios, gana `architecture.calm.yaml`. Las vistas van en `views/` dentro de esa carpeta.

```
arquitecturas/
  pagos/
    architecture.calm.yaml
    views/
      contexto.view.yaml
      infra-aws.view.yaml
  crm/
    architecture.calm.yaml
    views/
      contenedores.view.yaml
README.md
```

Al conectar la biblioteca se puede indicar una rama y una carpeta (`arquitecturas` en el ejemplo) para que Trazo ignore el resto del repositorio. Pegar una URL como `https://github.com/empresa/repo/tree/main/arquitecturas` rellena las dos.

## Lo que muestra el catálogo

La ficha de cada arquitectura sale de `metadata.trazo` en la raíz del modelo. Es CALM válido: CALM permite metadatos libres.

```yaml
metadata:
  trazo:
    title: Plataforma de pagos
    description: Cobros con tarjeta en AWS, con scoring de fraude con IA.
    owner: Equipo Pagos
    domain: Pagos
    status: Producción   # Borrador, Propuesta, Producción, Obsoleta…
    tags: [aws, eks, ia]
```

Sin `title`, Trazo usa la primera línea de comentario del fichero (`# Título: descripción`) y, si no hay, el nombre de la carpeta. Dominio, estado y etiquetas aparecen como filtros del catálogo.

## Acceso

Los repositorios públicos se pueden ver sin token, en solo lectura. Para repositorios privados y para publicar cambios hace falta un token personal:

- GitHub: un token *fine-grained* limitado al repositorio, con lectura y escritura en **Contents** y **Pull requests**.
- GitLab: un token personal o de proyecto con el alcance **api** (o **read_repository** para solo leer).

El token se guarda solo en el navegador de quien lo usa (`localStorage`) y viaja únicamente a la API de su proveedor.

## Editar y publicar

Abrir una arquitectura del catálogo la copia a un workspace local, que se guarda solo mientras editas. Publicar la sube al repositorio de una de estas dos formas:

- **Pull request / merge request** (por defecto): Trazo crea una rama `trazo/<carpeta>-<fecha>` y abre la petición contra la rama de la biblioteca. Las siguientes publicaciones desde el mismo workspace se añaden a esa misma petición.
- **Commit directo** en la rama de la biblioteca, si el token tiene permiso y la rama no está protegida.

Si alguien cambió la arquitectura en el repositorio desde que la abriste, Trazo lo detecta antes de escribir, lista los ficheros afectados y solo sobrescribe si lo confirmas.
