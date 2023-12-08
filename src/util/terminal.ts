import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { getActiveEditorDir } from './fs';
import { type } from 'os';
import * as iconv from 'iconv-lite';
import { rejects } from 'assert';
import { log } from "./log";

export class TerminalResult {
  /**
   * executed result code
   */
  public code: number = 0;
  /**
   * execute message
   */
  public message: string = "";
  /**
   * is executed successfully
   */
  public error: boolean = false;

  /**
   * 进程对象
   */
  public child: ChildProcessWithoutNullStreams | null = null;
}

/**
 * launch a terminal in child process
 * @param command 
 * @param args 
 * @param cwd 
 */
export function launchTerminal(command: string, args: string[], cwd: string | undefined, returnImmediately: boolean = false): Promise<TerminalResult> {
  let finalCwd: string;
  let outputResult: string = '';

  if (!cwd) {
    finalCwd = getActiveEditorDir();
  } else {
    finalCwd = cwd;
  }

  return new Promise<TerminalResult>((resolve, reject) => {
    const terminal = new TerminalResult();
    terminal.error = false;
    log.output(`run command in ${finalCwd}:\n${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      cwd: finalCwd
    });

    child.stdout.on('data', (data) => {
      if (data) {
        outputResult += decodeTerminalOutput(data);
      }
    });

    child.on('exit', (code: number) => {
      log.output(outputResult);
      terminal.code = code;
      terminal.message += outputResult;
      if (!returnImmediately) {
        terminal.child = null;
        resolve(terminal);
      }
    });

    child.stderr.on('data', (data) => {
      const result = decodeTerminalOutput(data);
      log.output(result);
      terminal.error = true;
      terminal.message += result;
    });
    terminal.child = child;
    if (returnImmediately) {
      resolve(terminal);
    }
  });
}
export function decodeTerminalOutput(data: any) {
  return iconv.decode(data, getTerminalEncoding());
}
function getTerminalEncoding() {
  return type().toLowerCase().includes('windows') ? 'gbk' : 'utf8';
}