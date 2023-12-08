import { getSelectText } from "../util/editor";
import { InteractInfo, ParserInfo, TerminalInfo } from '../interface';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ensureDirSync, emptyDirSync } from 'fs-extra';
import { getActiveEditorDir, getActiveEditorPath } from "../util/fs";
import { BuildInfo, TargetLang } from "../buildInput";
import { generateAntlrProject, compileBuilt, getAntlrJarPath } from "../build";
import { TerminalResult, decodeTerminalOutput, launchTerminal } from "../util/terminal";
import { openInteractWebView } from "../webview";
import { join } from "path";
import { parseToken } from "./token";
import { Log, log } from "../util/log";
import { homedir } from "os";
import { config } from "../util/config";
import { execSync } from "node:child_process";

export async function parse(context: vscode.ExtensionContext) {
  log.clean();
  const { error, text } = getSelectText();
  if (error) {
    vscode.window.showErrorMessage(error);
    return;
  }
  const parseConfig: ParserInfo = {
    g4File: getActiveEditorPath(),
    rule: text,
    parseType: 'gui',
    fileParsed: await getFileParsed()
  };

  // Empty file parsed
  if (!parseConfig.fileParsed) {
    vscode.window.showWarningMessage("not selected file");
    return;
  }
  const b = await buildAndCompile(parseConfig, context);
  if (b) {
    await showGuiTree(parseConfig, context);
  }
}

export async function interact(context: vscode.ExtensionContext) {
  const { error, text } = getSelectText();
  if (error) {
    vscode.window.showErrorMessage(error);
    return;
  }
  // save the active editor dir
  const activeTextDir = getActiveEditorDir();

  const interactConfig: InteractInfo = {
    compiledPath: path.join(getGenDir(), getGrammarName(getActiveEditorPath())),
    g4File: getActiveEditorPath(),
    rule: text,
    grammarName: getGrammarName(getActiveEditorPath()),
    text: '',
    saveText() {
      const savePath = join(activeTextDir, '.gen', this.grammarName, 'tmp.txt');
      fs.writeFileSync(savePath, this.text);
    },
    async getTokens(text: string) {
      this.text = text;
      this.saveText();
      const terminalInfo = getTokenCommand(this, context);
      const result = await launchTerminal(terminalInfo.command, terminalInfo.args, terminalInfo.cwd);
      const tokenInfos = parseToken(result.message);
      return tokenInfos;
    },
    async getAstTree(text: string) {
      this.text = text;
      this.saveText();
      const terminalInfo = getAstTreeCommand(this, context);
      try {
        await launchTerminal(terminalInfo.command, terminalInfo.args, terminalInfo.cwd);
      } catch (e) {
        vscode.window.showErrorMessage(e as string);
      }
    }
  };

  await buildAndCompile(interactConfig, context)
    .finally(async() => {
      openInteractWebView(context.extensionUri, context, interactConfig);
    });
}

let latestUri: vscode.Uri | null = null;
async function getFileParsed() {
  let defaultUri = latestUri;
  if (defaultUri === null && vscode.workspace.workspaceFolders) {
    defaultUri = vscode.workspace.workspaceFolders[0].uri;
  }
  const options: vscode.OpenDialogOptions = {
    canSelectMany: false,
    openLabel: 'Open',
    defaultUri: defaultUri!,
  };

  const file = await vscode.window.showOpenDialog(options);
  if (file && file.length > 0) {
    latestUri = file[0];
    return latestUri.fsPath;
  } else {
    return "";
  }
}

/**
 * build and config the grammar file with antlr so that the parsing is accessible.
 * @param parseConfig 
 * @param context 
 */
export async function buildAndCompile(parseConfig: ParserInfo | InteractInfo, context: vscode.ExtensionContext): Promise<boolean> {
  const grammarName = getGrammarName(parseConfig.g4File);
  if (isCompile(grammarName)) {
    return true;
  }
  let result = await buildForParsing(parseConfig.g4File, grammarName, context);
  if (result.error) {
    return false;
  }
  const compilePath = path.join(getGenDir(), grammarName);
  result = await compileBuilt(compilePath, context);
  if (result.error) {
    return false;
  }
  return true;
}

function getGrammarName(filePath: string) {
  const fileName = path.basename(filePath);
  const splitArr = fileName.split('.');

  if (!splitArr || splitArr.length < 2) {
    vscode.window.showErrorMessage('No a grammar file');
    throw new Error('No a grammar file');
  } else {
    if (splitArr[1] !== 'g4' && splitArr[1] !== 'g') {
      vscode.window.showErrorMessage('No a grammar file');
      throw new Error('No a grammar file');
    }
  }

  return splitArr[0];
}
function isCompile(grammarName: string) {
  const useBuildCompileCache = config.getUseBuildCompileCache();
  const compile = path.join(getGenDir(), grammarName);
  if (useBuildCompileCache) {
    return fs.existsSync(compile);
  } else {
    if (fs.existsSync(compile)) {
      emptyDirSync(compile);
    }
    return false;
  }
}

async function buildForParsing(grammarFile: string, grammarName: string, context: vscode.ExtensionContext): Promise<TerminalResult> {
  const buildInfo: BuildInfo = {
    target: TargetLang.JAVA,
    projectName: grammarName
  };
  const genDir = getGenDir();
  ensureDirSync(genDir);
  return await generateAntlrProject(grammarFile, buildInfo, context, genDir);
}

/**
 * get the generated project dir path
 */
function getGenDir() {
  return path.join(homedir(), '.gen');
}
export async function showGuiTree(parseConfig: ParserInfo, context: vscode.ExtensionContext) {
  const { command, args, cwd } = getTreeCommand(parseConfig, context);
  const terminal = await launchTerminal(command, args, cwd, true);
}
export async function closeGuiTree() {
  let pid = null;
  if (process.platform === 'win32') {
    const ret = execSync("tasklist /v /fo csv");
    const lines = decodeTerminalOutput(ret).toString().split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const arr = line.split(',');
      const windowTitle = arr[arr.length - 1];
      if (windowTitle.indexOf("Parse Tree Inspector") !== -1) {
        pid = arr[1];
        break;
      }
    }
  }
  if (pid) {
    const ret = execSync(`taskkill /F /PID ${pid}`);
    console.log(decodeTerminalOutput(ret));
  }
}

function getTreeCommand(parseConfig: ParserInfo, context: vscode.ExtensionContext) {
  const grammarName = getGrammarName(parseConfig.g4File);
  const result: TerminalInfo = {
    command: 'java',
    args: ['-cp', `.;${getAntlrJarPath(context)}`, 'org.antlr.v4.gui.TestRig', grammarName, parseConfig.rule, '-gui', parseConfig.fileParsed],
    cwd: path.join(getGenDir(), grammarName)
  };

  return result;
}

function getTokenCommand(interactInfo: InteractInfo, context: vscode.ExtensionContext) {
  const parsedFile = path.join(interactInfo.compiledPath, 'tmp.txt');
  const result: TerminalInfo = {
    command: 'java',
    args: ['-cp', `.;${getAntlrJarPath(context)}`, 'org.antlr.v4.gui.TestRig', interactInfo.grammarName, interactInfo.rule, '-tokens', parsedFile],
    cwd: path.join(interactInfo.compiledPath)
  };

  return result;
}

function getAstTreeCommand(interactInfo: InteractInfo, context: vscode.ExtensionContext) {
  const parsedFile = path.join(interactInfo.compiledPath, 'tmp.txt');
  const result: TerminalInfo = {
    command: 'java',
    args: ['-cp', `.;${getAntlrJarPath(context)}`, 'org.antlr.v4.gui.TestRig', interactInfo.grammarName, interactInfo.rule, '-gui', parsedFile],
    cwd: path.join(interactInfo.compiledPath)
  };

  return result;
}

