import * as vscode from "vscode";

const id = 'justAntlr';
const KEY_RULE = 'rule';
const KEY_G4 = 'g4';
const KEY_FILE = 'file';
const KEY_USE_BUILD_COMPILE_CACHE = "useBuildCompileCache";
export class Config {
  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(id);
  }
  private getConfigByKey<T>(key: string): T {
    return this.getConfig().get(key) as T;
  }
  getUseBuildCompileCache(): boolean {
    return this.getConfigByKey<boolean>(KEY_USE_BUILD_COMPILE_CACHE);
  }
  async setG4(v: string) {
    await this.getConfig().update(KEY_G4, v);
  }
  getG4(): string {
    return this.getConfigByKey(KEY_G4) || "";
  }
  async setFile(v: string) {
    await this.getConfig().update(KEY_FILE, v);
  }
  getFile(): string {
    return this.getConfigByKey(KEY_FILE) || "";
  }
  async setRule(v: string) {
    await this.getConfig().update(KEY_RULE, v);
  }
  getRule(): string {
    return this.getConfigByKey(KEY_RULE) || "";
  }
}
export const config = new Config();