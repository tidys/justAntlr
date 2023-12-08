// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { build } from './build';
import { interact, parse, buildAndCompile, showGuiTree, closeGuiTree } from './parser';
import { log } from "./util/log";
import { config } from "./util/config";
import { readFileSync } from "fs";
import { ParserInfo } from "./interface";
import { exec, execSync } from "child_process";
import { decodeTerminalOutput } from "./util/terminal";
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  log.init();
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const buildDisposable = vscode.commands.registerTextEditorCommand('justAntlr.build', async () => {
		await build(context);
	});

  const parseDisposable = vscode.commands.registerTextEditorCommand('justAntlr.genAST', () => {
		parse(context);
	});

  const interactDisposable = vscode.commands.registerTextEditorCommand('justAntlr.inputInteractive', () => {
		interact(context);
	});

  context.subscriptions.push(buildDisposable, parseDisposable, interactDisposable);

  context.subscriptions.push(vscode.commands.registerTextEditorCommand('justAntlr.setGrammar4File', async () => {
    const uri = await vscode.window.showOpenDialog({
      title: 'grammar file',
      canSelectFiles: true,
      defaultUri: vscode.window.activeTextEditor?.document.uri,
      filters: {
        "grammar4": ['g4', 'g']
      }
    });
    if (uri && uri.length > 0) {
      const file = uri[0].fsPath;
      await config.setG4(file);
      const rules: string[] = [];
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.map((line) => {
        if (line && line.length && /[a-z]/.test(line[0]) && !line.startsWith("grammar")) {
          const rule = line.split(':')[0].trim();
          rules.push(rule);
        }
      });

      const ret = await vscode.window.showQuickPick(rules, {
        title: 'choose rule',
        placeHolder: config.getRule() || "",
        canPickMany: false,
      });
      if (ret) {
        await config.setRule(ret);
      }
    }
  }));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('justAntlr.setParseFile', async () => {
    const uri = await vscode.window.showOpenDialog({
      title: 'grammar file',
      canSelectFiles: true,
      defaultUri: vscode.window.activeTextEditor?.document.uri,
    });
    if (uri && uri.length > 0) {
      await config.setFile(uri[0].fsPath);
    }
  }));

  context.subscriptions.push(vscode.commands.registerTextEditorCommand('justAntlr.showGUI', async () => {
    log.clean();
    closeGuiTree();
    const g4File = config.getG4();
    if (!g4File) {
      return vscode.window.showErrorMessage('No config grammar4 file');
    }
    const rule = config.getRule();
    if (!rule) {
      return vscode.window.showErrorMessage('No config rule');
    }
    const file = config.getFile();
    if (!file) {
      return vscode.window.showErrorMessage('No config file');
    }

    const parseConfig: ParserInfo = { g4File, rule, parseType: 'gui', fileParsed: file };

    const b = await buildAndCompile(parseConfig, context);
    if (b) {
      await showGuiTree(parseConfig, context);
    }
  }));
}

// this method is called when your extension is deactivated
export function deactivate() {}

