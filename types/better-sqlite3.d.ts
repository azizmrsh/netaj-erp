declare module "better-sqlite3" {
  type DatabaseOptions = { readonly?: boolean; fileMustExist?: boolean };
  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    backup(destination: string): Promise<void>;
    close(): void;
    pragma(source: string, options: { simple: true }): unknown;
    pragma(source: string): unknown[];
    prepare(source: string): { get(...parameters: unknown[]): Record<string, unknown> };
  }
  export default Database;
}
