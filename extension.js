// BC Version Switcher: app.json = copia de .versions/<VERSION>.app.json
// La versión activa se guarda en .versions/.current (ignorado por git).
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const VERSIONS_DIR = '.versions';
const SUFFIX = '.app.json';
const CURRENT_FILE = '.current';
let statusItem;

function appFolders() {
  return (vscode.workspace.workspaceFolders || []).filter(f =>
    fs.existsSync(path.join(f.uri.fsPath, VERSIONS_DIR)));
}

function listVersions(folder) {
  const dir = path.join(folder.uri.fsPath, VERSIONS_DIR);
  return fs.readdirSync(dir).filter(n => n.endsWith(SUFFIX)).map(n => n.slice(0, -SUFFIX.length)).sort();
}

function readCurrent(folder) {
  const file = path.join(folder.uri.fsPath, VERSIONS_DIR, CURRENT_FILE);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : undefined;
}

async function applyVersion(folder, version, { quiet = false } = {}) {
  const root = folder.uri.fsPath;
  const src = path.join(root, VERSIONS_DIR, version + SUFFIX);
  if (!fs.existsSync(src)) throw new Error(`No existe ${VERSIONS_DIR}/${version}${SUFFIX}`);
  JSON.parse(fs.readFileSync(src, 'utf8')); // valida el JSON antes de tocar nada

  fs.copyFileSync(src, path.join(root, 'app.json'));
  fs.writeFileSync(path.join(root, VERSIONS_DIR, CURRENT_FILE), version + '\n');

  const cfg = vscode.workspace.getConfiguration('bcVersionSwitcher', folder.uri);
  let emptyCache = false;
  if (cfg.get('packageCachePerVersion')) {
    const dir = path.join(root, '.alpackages', version);
    fs.mkdirSync(dir, { recursive: true });
    emptyCache = !fs.readdirSync(dir).some(n => n.endsWith('.app'));
    const rel = './.alpackages/' + version;
    const al = vscode.workspace.getConfiguration('al', folder.uri);
    const cur = al.get('packageCachePath');
    if (JSON.stringify(cur) !== JSON.stringify([rel]) && cur !== rel) {
      await al.update('packageCachePath', [rel], vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }

  updateStatus();
  if (!quiet) vscode.window.setStatusBarMessage(`BC: ${folder.name} → ${version}`, 4000);

  if (emptyCache && cfg.get('downloadSymbolsIfEmpty')) {
    const pick = await vscode.window.showInformationMessage(
      `No hay símbolos de ${version} en .alpackages/${version}. ¿Descargarlos ahora?`, 'Descargar', 'Más tarde');
    if (pick === 'Descargar') {
      try { await vscode.commands.executeCommand('al.downloadSymbols'); }
      catch (e) { vscode.window.showWarningMessage('No se pudo lanzar AL: Download symbols: ' + e.message); }
    }
  }
}

async function selectVersion() {
  const folders = appFolders();
  if (!folders.length) { vscode.window.showWarningMessage('No hay carpeta .versions en el workspace.'); return; }

  let targets = folders;
  if (folders.length > 1) {
    const items = [
      { label: '$(layers) Todas las apps', folders },
      ...folders.map(f => ({ label: f.name, description: readCurrent(f) || 'sin versión', folders: [f] }))
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'App a cambiar' });
    if (!pick) return;
    targets = pick.folders;
  }

  const versions = [...new Set(targets.flatMap(listVersions))];
  const current = targets.length === 1 ? readCurrent(targets[0]) : undefined;
  const pick = await vscode.window.showQuickPick(
    versions.map(v => ({ label: v, description: v === current ? '(actual)' : '' })),
    { placeHolder: 'Versión de Business Central' });
  if (!pick) return;

  for (const f of targets) {
    if (!listVersions(f).includes(pick.label)) {
      vscode.window.showWarningMessage(`${f.name}: no tiene ${pick.label}${SUFFIX}, se omite.`);
      continue;
    }
    try { await applyVersion(f, pick.label); }
    catch (e) { vscode.window.showErrorMessage(`${f.name}: ${e.message}`); }
  }
}

async function reapply() {
  for (const f of appFolders()) {
    const v = readCurrent(f);
    if (v) await applyVersion(f, v).catch(e => vscode.window.showErrorMessage(`${f.name}: ${e.message}`));
  }
}

function updateStatus() {
  const folders = appFolders();
  if (!folders.length) { statusItem.hide(); return; }
  const versions = [...new Set(folders.map(f => readCurrent(f) || '?'))];
  statusItem.text = `$(versions) BC ${versions.join(' / ')}`;
  statusItem.tooltip = folders.map(f => `${f.name}: ${readCurrent(f) || 'sin seleccionar'}`).join('\n') + '\nClic para cambiar';
  statusItem.show();
}

async function activate(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = 'bcVersionSwitcher.select';
  context.subscriptions.push(
    statusItem,
    vscode.commands.registerCommand('bcVersionSwitcher.select', selectVersion),
    vscode.commands.registerCommand('bcVersionSwitcher.reapply', reapply),
    vscode.workspace.onDidChangeWorkspaceFolders(updateStatus));

  // App recién clonada sin app.json: se genera con la versión guardada o la primera disponible
  for (const f of appFolders()) {
    const versions = listVersions(f);
    if (!fs.existsSync(path.join(f.uri.fsPath, 'app.json')) && versions.length) {
      const saved = readCurrent(f);
      const v = versions.includes(saved) ? saved : versions[0];
      await applyVersion(f, v, { quiet: true }).catch(e => vscode.window.showErrorMessage(`${f.name}: ${e.message}`));
      vscode.window.showInformationMessage(`${f.name}: app.json generado para ${v}. Cámbialo desde la barra de estado.`);
    }
  }
  updateStatus();
}

function deactivate() {}
module.exports = { activate, deactivate };
