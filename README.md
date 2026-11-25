# BC Version Switcher

Extensión de VS Code para apps AL multiversión.

Convención en cada app:

```
.versions/BC18.app.json   manifest completo para BC18 (preprocessorSymbols: ["BC18"])
.versions/BC28.app.json   manifest completo para BC28 (preprocessorSymbols: ["BC28"])
app.json                  generado, ignorado por git
.versions/.current        versión activa, ignorado por git
.alpackages/<VERSION>/    símbolos de cada versión
```

- Barra de estado `BC <versión>` o comando **BC: Seleccionar versión de BC**: copia el manifest a `app.json`,
  apunta `al.packageCachePath` a `./.alpackages/<VERSION>` y ofrece descargar símbolos si esa caché está vacía.
- Al abrir una app recién clonada sin `app.json`, lo genera automáticamente.
- Con varias apps en el workspace permite cambiar una o todas a la vez.
- Los cambios del manifest (versión, dependencias...) se hacen en `.versions/*.app.json`, nunca en `app.json`;
  después, **BC: Regenerar app.json de la versión actual**.

`al.packageCachePath` se escribe en `.vscode/settings.json`. Si no queréis ese cambio en git,
desactivad `bcVersionSwitcher.packageCachePerVersion`.

## Instalar

```powershell
npx @vscode/vsce package --allow-missing-repository
code --install-extension bc-version-switcher-0.1.0.vsix
```
